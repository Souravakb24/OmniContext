"""
GET  /api/user/documents                    — list all documents for current user
GET  /api/user/document/{doc_id}/status     — status detail for one document
POST /api/user/document/{doc_id}/retry      — re-queue a FAILED document

Auth: Bearer JWT via get_current_user.
"""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app import crud

router = APIRouter(tags=["ingestion"])


# ── Response schemas ──────────────────────────────────────────────────────────

class DocumentStatusResponse(BaseModel):
    doc_id:             str
    filename:           str
    status:             str
    error_message:      Optional[str]
    retry_count:        int
    ingestion_start:    Optional[datetime]
    ingestion_end:      Optional[datetime]
    created_at:         datetime
    mime_type:          Optional[str]
    size_bytes:         Optional[int]
    collection_id:      Optional[str]
    tags:               Optional[List[str]]
    original_extension: Optional[str]
    chunk_count:        Optional[int]
    total_pages:        Optional[int]
    tables:             Optional[int]
    figures:            Optional[int]


class DocSummaryResponse(BaseModel):
    doc_id:          str
    file_name:       str
    summary:         Optional[str]
    assigned_domain: Optional[str]
    is_new_domain:   Optional[bool]
    proposed_domain: Optional[str]
    confidence:      Optional[float]
    needs_graph:     Optional[bool]
    graph_reason:    Optional[str]
    model_used:      Optional[str]


class RetryResponse(BaseModel):
    doc_id:  str
    message: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/api/user/documents",
    response_model=List[DocumentStatusResponse],
    summary="List all documents for the current user",
)
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = crud.list_user_documents(db, current_user.id)
    return [_row_to_response(r) for r in rows]


@router.get(
    "/api/user/document/{doc_id}/status",
    response_model=DocumentStatusResponse,
    responses={404: {"description": "Document not found"}},
    summary="Get ingestion status for a single document",
)
def get_document_status(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = crud.get_document_for_user(db, doc_id, current_user.id)
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "NOT_FOUND", "reason": "Document not found"})
    return _row_to_response(row)


@router.get(
    "/api/user/document/{doc_id}/summary",
    response_model=DocSummaryResponse,
    responses={
        404: {"description": "Document or summary not found"},
        202: {"description": "Ingestion not complete yet"},
    },
    summary="Get AI-generated summary and domain classification for a document",
)
def get_document_summary(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = crud.get_document_for_user(db, doc_id, current_user.id)
    if doc is None:
        raise HTTPException(status_code=404, detail={"error": "NOT_FOUND", "reason": "Document not found"})
    if doc["status"] != "COMPLETED":
        raise HTTPException(status_code=202, detail={"error": "NOT_READY", "reason": f"Document is still '{doc['status']}'"})

    row = crud.get_doc_summary(db, doc_id, current_user.id)
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "NO_SUMMARY", "reason": "Summary not yet available"})

    return DocSummaryResponse(
        doc_id=str(row["doc_id"]),
        file_name=row["file_name"],
        summary=row["summary"],
        assigned_domain=row["assigned_domain"],
        is_new_domain=row["is_new_domain"],
        proposed_domain=row["proposed_domain"],
        confidence=row["confidence"],
        needs_graph=row["needs_graph"],
        graph_reason=row["graph_reason"],
        model_used=row["model_used"],
    )


@router.post(
    "/api/user/document/{doc_id}/retry",
    response_model=RetryResponse,
    responses={
        404: {"description": "Document not found"},
        409: {"description": "Document is not in FAILED state"},
    },
    summary="Re-queue a FAILED document for ingestion",
)
def retry_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    row = crud.get_document_for_user(db, doc_id, current_user.id)
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "NOT_FOUND", "reason": "Document not found"})

    if row["status"] == "COMPLETED":
        raise HTTPException(
            status_code=409,
            detail={"error": "ALREADY_COMPLETED", "reason": "Document is already ingested"},
        )

    reset = crud.reset_document_for_retry(db, doc_id, current_user.id)
    if not reset:
        raise HTTPException(status_code=409, detail={"error": "RETRY_FAILED", "reason": "Could not reset document"})

    return RetryResponse(doc_id=doc_id, message="Document re-queued for ingestion.")


# ── Helper ────────────────────────────────────────────────────────────────────

def _row_to_response(row: dict) -> DocumentStatusResponse:
    report = row.get("ingestion_report") or {}
    elem   = report.get("element_counts") or {}
    return DocumentStatusResponse(
        doc_id=str(row["doc_id"]),
        filename=row["filename"],
        status=row["status"],
        error_message=row.get("error_message"),
        retry_count=row.get("retry_count") or 0,
        ingestion_start=row.get("ingestion_start"),
        ingestion_end=row.get("ingestion_end"),
        created_at=row["created_at"],
        mime_type=row.get("mime_type"),
        size_bytes=row.get("size_bytes"),
        collection_id=str(row["collection_id"]) if row.get("collection_id") else None,
        tags=row.get("tags") or [],
        original_extension=row.get("original_extension"),
        chunk_count=report.get("chunk_count"),
        total_pages=report.get("total_pages"),
        tables=elem.get("table"),
        figures=elem.get("picture"),
    )
