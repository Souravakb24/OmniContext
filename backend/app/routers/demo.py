"""
Demo API — no authentication required.

POST   /demo/start                     — create an isolated demo session
POST   /demo/upload                    — upload a document (max 2 per session)
GET    /demo/document/{doc_id}/status  — poll ingestion status
POST   /demo/query                     — SSE query stream (max 3 per session)
DELETE /demo/session/{session_id}      — cleanup; frontend calls after 5-min countdown

Limits:
  - 2 documents per session
  - 3 queries per session
  - Session TTL: 2 hours (background worker purges expired sessions)

Each session gets its own ChromaDB collections:
  {collection_name}        — vector chunks
  {collection_name}_graph  — entity embeddings

Isolation is session-UUID-based; no shared state between concurrent demo users.
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app import crud
from app.services.storage import StorageError, delete_doc_dir, store_uploaded_file
from app.services.validator import ValidationError, validate_upload
from app.services.retrieval.workflow import workflow_app
from app.services.retrieval.config import MAX_ITERATIONS
from fastapi import Depends

router = APIRouter(prefix="/demo", tags=["demo"])


def _truncate_pdf(pdf_path: str, max_pages: int) -> tuple[int, int]:
    """
    Truncate a PDF file in-place to at most max_pages pages.

    Returns (original_page_count, ingested_page_count).
    Uses PyMuPDF (fitz) — no additional deps needed.
    """
    import fitz

    doc = fitz.open(pdf_path)
    original = doc.page_count
    doc.close()

    if original <= max_pages:
        return original, original

    # Write a new file containing only the first max_pages pages
    src = fitz.open(pdf_path)
    out = fitz.open()
    out.insert_pdf(src, from_page=0, to_page=max_pages - 1)
    out.save(pdf_path)
    out.close()
    src.close()

    return original, max_pages


# ── Request / Response schemas ────────────────────────────────────────────────

class DemoQueryRequest(BaseModel):
    session_id: str
    raw_query:  str
    is_graph:   bool = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_active_session(session_id: str, db: DBSession) -> dict:
    """Load and validate a demo session — raises 404/410 if invalid/expired."""
    from datetime import datetime

    s = crud.get_demo_session(db, session_id)
    if s is None:
        raise HTTPException(status_code=404, detail={"error": "SESSION_NOT_FOUND"})
    if s["status"] == "cleaned_up":
        raise HTTPException(status_code=410, detail={"error": "SESSION_EXPIRED"})
    if s["expires_at"] < datetime.utcnow():
        raise HTTPException(status_code=410, detail={"error": "SESSION_EXPIRED"})
    if s["status"] != "active":
        raise HTTPException(status_code=410, detail={"error": "SESSION_EXPIRED"})
    return s


# ── POST /demo/start ──────────────────────────────────────────────────────────

@router.post("/start", status_code=201)
def demo_start(db: DBSession = Depends(get_db)):
    """
    Create a new isolated demo session.

    Returns session_id — store it in localStorage and include it in every
    subsequent demo request.
    """
    result = crud.create_demo_session(db)
    return {
        "session_id":        result["session_id"],
        "collection_name":   result["collection_name"],
        "expires_at":        result["expires_at"].isoformat(),
        "max_docs":          crud.DEMO_MAX_DOCS,
        "max_queries":       crud.DEMO_MAX_QUERIES,
        "docs_used":         0,
        "queries_used":      0,
    }


# ── POST /demo/upload ─────────────────────────────────────────────────────────

@router.post("/upload", status_code=201)
async def demo_upload(
    request:    Request,
    file:       UploadFile = File(...),
    session_id: str        = Form(...),
    db:         DBSession  = Depends(get_db),
):
    """
    Upload a document to the demo session.

    Max 2 documents per session. Accepts PDF, DOCX, PPT, PPTX.
    Ingestion starts automatically in the background worker.
    Poll GET /demo/document/{doc_id}/status until status == COMPLETED.
    """
    session = _require_active_session(session_id, db)

    if session["doc_count"] >= crud.DEMO_MAX_DOCS:
        raise HTTPException(
            status_code=429,
            detail={"error": "DOC_LIMIT_REACHED",
                    "reason": f"Demo sessions allow at most {crud.DEMO_MAX_DOCS} documents"},
        )

    doc_id: Optional[str] = None
    log = logger.bind(demo_session=session_id[:8], filename=file.filename)

    try:
        data           = await file.read()
        content_length = int(request.headers.get("content-length", len(data)))

        # Skip hash-based deduplication for demo — always create a fresh document
        async def _no_hash_check(_sha256: str):
            return None

        validated, _ = await validate_upload(
            filename=file.filename,
            data=data,
            check_hash_fn=_no_hash_check,
            log=log,
            content_length=content_length,
        )

        doc_id = str(uuid.uuid4())
        stored = store_uploaded_file(doc_id, validated)

        # Truncate to first DEMO_MAX_PAGES pages in-place
        original_pages, ingested_pages = _truncate_pdf(
            stored.pdf_path, crud.DEMO_MAX_PAGES
        )
        pages_truncated = original_pages > ingested_pages

        collection = crud.get_demo_collection(db, session["collection_name"])
        if collection is None:
            raise HTTPException(status_code=500,
                                detail={"error": "COLLECTION_MISSING"})

        row = crud.insert_demo_document(
            db,
            doc_id=doc_id,
            collection_id=collection.id,
            filename=file.filename,
            original_extension=validated.extension.lstrip("."),
            output_dir=stored.output_dir,
            pdf_path=stored.pdf_path,
            mime_type=validated.mime_type,
            size_bytes=validated.size_bytes,
        )

        # Atomically increment; -1 means another request raced past the limit
        new_count = crud.increment_demo_doc_count(db, session_id)
        if new_count == -1:
            delete_doc_dir(doc_id)
            db.execute(
                __import__("sqlalchemy").text(
                    "DELETE FROM documents WHERE doc_id = CAST(:id AS uuid)"
                ),
                {"id": row["doc_id"]},
            )
            db.commit()
            raise HTTPException(
                status_code=429,
                detail={"error": "DOC_LIMIT_REACHED",
                        "reason": f"Demo limit of {crud.DEMO_MAX_DOCS} documents reached"},
            )

        log.info("Demo upload: doc_id={} queued (pages {}/{})",
                 row["doc_id"], ingested_pages, original_pages)
        return {
            "doc_id":           row["doc_id"],
            "filename":         file.filename,
            "status":           "UPLOADED",
            "created_at":       row["created_at"].isoformat(),
            "docs_used":        new_count,
            "docs_remaining":   max(0, crud.DEMO_MAX_DOCS - new_count),
            "original_pages":   original_pages,
            "ingested_pages":   ingested_pages,
            "pages_truncated":  pages_truncated,
            "notice":           (
                f"Only the first {ingested_pages} of {original_pages} pages "
                f"were ingested for this demo."
            ) if pages_truncated else None,
        }

    except HTTPException:
        raise

    except ValidationError as exc:
        if doc_id:
            delete_doc_dir(doc_id)
        raise HTTPException(
            status_code=exc.http_status,
            detail={"error": "VALIDATION_FAILED", "reason": exc.reason},
        )

    except StorageError as exc:
        if doc_id:
            delete_doc_dir(doc_id)
        raise HTTPException(status_code=500, detail={"error": "STORAGE_ERROR", "reason": str(exc)})

    except Exception as exc:
        if doc_id:
            delete_doc_dir(doc_id)
        log.exception("Demo upload failed: {}", exc)
        raise HTTPException(status_code=500, detail={"error": "INTERNAL_ERROR"})


# ── GET /demo/document/{doc_id}/status ────────────────────────────────────────

@router.get("/document/{doc_id}/status")
def demo_document_status(
    doc_id:     str,
    session_id: str,
    db:         DBSession = Depends(get_db),
):
    """
    Poll ingestion status for a demo document.

    Pass session_id as a query parameter.
    Poll until status == COMPLETED before sending queries.
    """
    session = _require_active_session(session_id, db)

    row = crud.get_demo_document_status(db, doc_id, session["collection_name"])
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "NOT_FOUND"})

    report = row.get("ingestion_report") or {}
    elem   = report.get("element_counts") or {}
    return {
        "doc_id":         str(row["doc_id"]),
        "filename":       row["filename"],
        "status":         row["status"],
        "error_message":  row.get("error_message"),
        "ingestion_start": row["ingestion_start"].isoformat() if row.get("ingestion_start") else None,
        "ingestion_end":   row["ingestion_end"].isoformat()   if row.get("ingestion_end")   else None,
        "created_at":      row["created_at"].isoformat(),
        "chunk_count":     report.get("chunk_count"),
        "total_pages":     report.get("total_pages"),
        "tables":          elem.get("table"),
        "figures":         elem.get("picture"),
    }


# ── POST /demo/query ──────────────────────────────────────────────────────────

@router.post("/query")
async def demo_query(
    request: DemoQueryRequest,
    db:      DBSession = Depends(get_db),
):
    """
    Submit a query and receive an SSE stream of agent progress + final answer.

    Identical stream format to the authenticated /api/v1/retrieval/query endpoint.
    After the 3rd (final) query, stream_end includes is_final=true so the frontend
    can start the 5-minute countdown and then call DELETE /demo/session/{session_id}.

    No conversation history is stored for demo queries.
    """
    if not request.raw_query.strip():
        raise HTTPException(status_code=400, detail="raw_query must not be empty")

    session = _require_active_session(request.session_id, db)

    # Check limit before running — prevents > 3 concurrent races
    if session["query_count"] >= crud.DEMO_MAX_QUERIES:
        raise HTTPException(
            status_code=429,
            detail={"error": "QUERY_LIMIT_REACHED",
                    "reason": f"Demo sessions allow at most {crud.DEMO_MAX_QUERIES} queries"},
        )

    # Atomically increment; -1 means a concurrent request took the last slot
    new_query_count = crud.increment_demo_query_count(db, request.session_id)
    if new_query_count == -1:
        raise HTTPException(
            status_code=429,
            detail={"error": "QUERY_LIMIT_REACHED",
                    "reason": f"Demo limit of {crud.DEMO_MAX_QUERIES} queries reached"},
        )

    is_final = (new_query_count >= crud.DEMO_MAX_QUERIES)

    collection_name = session["collection_name"]
    demo_user_id    = crud.DEMO_USER_ID

    initial_state = {
        "session_id":            f"demo_{request.session_id}",
        "user_id":               demo_user_id,
        "collection_name":       collection_name,
        "raw_query":             request.raw_query.strip(),
        "is_graph":              request.is_graph,
        "conversation_history":  [],  # no multi-turn history in demo
        "rewritten_query":       "",
        "query_complexity":      "simple",
        "planned_queries":       [],
        "retrieved_chunks":      [],
        "graph_context":         "",
        "graph_ui":              {},
        "current_answer":        "",
        "best_answer":           "",
        "best_score":            0.0,
        "verification_score":    0.0,
        "verification_feedback": "",
        "verification_passed":   False,
        "iteration":             0,
        "max_iterations":        MAX_ITERATIONS,
        "final_answer":          "",
        "citations":             [],
        "no_context":            False,
    }

    async def event_generator():
        yield f"data: {json.dumps({'event': 'session_start', 'session_id': request.session_id, 'collection': collection_name})}\n\n"

        final_state = {}
        try:
            async for event_type, data in workflow_app.astream(
                initial_state,
                stream_mode=["custom", "values"],
            ):
                if event_type == "custom":
                    yield f"data: {json.dumps(data)}\n\n"
                elif event_type == "values":
                    final_state = data
        except Exception as exc:
            yield f"data: {json.dumps({'event': 'error', 'detail': str(exc)})}\n\n"
            return

        graph_ui     = final_state.get("graph_ui") or None
        final_answer = final_state.get("final_answer") or final_state.get("best_answer") or ""
        citations    = final_state.get("citations") or []

        # If citation_agent returned nothing (LLM extraction failed or empty),
        # fall back to the top retrieved chunks — already reranked by relevance.
        if not citations:
            for c in (final_state.get("retrieved_chunks") or [])[:5]:
                citations.append({
                    "document_name": c.get("document_name", ""),
                    "page_numbers":  c.get("page_numbers", ""),
                    "headings":      c.get("headings", ""),
                    "chunk_index":   c.get("chunk_index"),
                    "relevance":     (c.get("text") or "")[:200],
                })

        yield f"data: {json.dumps({'event': 'stream_end', 'session_id': request.session_id, 'graph_ui': graph_ui, 'final_answer': final_answer, 'citations': citations, 'queries_used': new_query_count, 'queries_remaining': max(0, crud.DEMO_MAX_QUERIES - new_query_count), 'is_final': is_final})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── DELETE /demo/session/{session_id} ─────────────────────────────────────────

@router.delete("/session/{session_id}")
def demo_cleanup(
    session_id: str,
    db:         DBSession = Depends(get_db),
):
    """
    Cleanup a demo session — delete all files, vector/graph indices, and DB rows.

    Called by the frontend after the 5-minute post-query countdown expires.
    Safe to call multiple times (idempotent).
    """
    s = crud.get_demo_session(db, session_id)
    if s is None:
        # Already cleaned up or never existed — treat as success
        return {"deleted": True, "session_id": session_id}

    collection_name = s["collection_name"]
    db.close()

    # Run cleanup in a background thread so the response returns immediately
    import threading
    from app.services.demo_cleanup import cleanup_session
    t = threading.Thread(
        target=cleanup_session,
        args=(session_id, collection_name),
        daemon=True,
        name=f"demo-cleanup-{session_id[:8]}",
    )
    t.start()

    return {"deleted": True, "session_id": session_id}
