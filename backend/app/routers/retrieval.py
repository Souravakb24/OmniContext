"""
Retrieval API router.

Endpoints:
  POST /api/v1/retrieval/query                          — SSE streaming query
  POST /api/v1/retrieval/conversations                  — create a new session
  GET  /api/v1/retrieval/conversations                  — list user's sessions
  GET  /api/v1/retrieval/conversations/{session_id}/history — paginated turn history

session_id is the single external identifier for a conversation.
The DB primary key (conversations.id) is internal only and never exposed.
"""
from __future__ import annotations

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app import crud
from app.services import figure_store
from app.services.retrieval.workflow import workflow_app
from app.services.retrieval.config import MAX_ITERATIONS
from app.core.telemetry import emit_event

router = APIRouter(prefix="/api/v1/retrieval", tags=["retrieval"])


# ── Request schemas ───────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    raw_query:       str
    collection_name: str
    is_graph:        bool = False
    session_id:      Optional[str] = None   # omit to start a new conversation
    doc_id:          Optional[str] = None   # set to scope retrieval to one document


class ConversationCreateRequest(BaseModel):
    collection_name: str
    is_graph:        bool = False


# ── Helper ────────────────────────────────────────────────────────────────────

def _build_initial_state(
    request:                QueryRequest,
    user:                   User,
    conversation_history:   list[dict],
    session_id:             str,
    active_collection_name: str,
    active_collection_id:   str = "",
    active_doc_id:          str | None = None,
    query_id:               str = "",
) -> dict:
    return {
        "query_id":              query_id,
        "session_id":            session_id,
        "user_id":               str(user.id),
        "collection_id":         active_collection_id,
        "collection_name":       active_collection_name,
        "doc_id":                active_doc_id or "",
        "raw_query":             request.raw_query.strip(),
        "is_graph":              request.is_graph,
        "conversation_history":  conversation_history,
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
        "answer_found":          True,
    }


# ── SSE Query endpoint ────────────────────────────────────────────────────────

@router.post("/query")
async def query(
    request: QueryRequest,
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    """
    Submit a query and receive an SSE stream of agent progress + final answer.

    SSE event format:
        data: {"agent": "...", "event": "start|progress|done", ...}

    First event is always session_start — store session_id from it for multi-turn use.
    Last event is stream_end — contains final graph_ui (null when is_graph=False).

    To continue the conversation, pass the same session_id in the next request.
    """
    if not request.raw_query.strip():
        raise HTTPException(status_code=400, detail="raw_query must not be empty")

    session_id   = request.session_id or str(uuid.uuid4())
    query_id     = str(uuid.uuid4())
    conversation = crud.get_conversation_by_session(db, session_id)

    if conversation is None:
        collection = crud.get_collection_by_name(db, user.org_id, request.collection_name)
        if collection is None:
            raise HTTPException(status_code=404, detail="Collection not found")
        conversation = crud.create_conversation(
            db,
            session_id=session_id,
            user_id=user.id,
            collection_id=collection.id,
            is_graph=request.is_graph,
            doc_id=request.doc_id,
        )
        active_collection_name = request.collection_name
        active_collection_id   = str(collection.id)
        active_doc_id          = request.doc_id
    else:
        # Collection (and document scope) is locked to what was chosen at session creation.
        locked_collection = crud.get_collection_by_id(db, conversation.collection_id)
        if locked_collection is None:
            raise HTTPException(status_code=404, detail="Session collection no longer exists")
        active_collection_name = locked_collection.name
        active_collection_id   = str(locked_collection.id)
        active_doc_id          = str(conversation.doc_id) if conversation.doc_id else None

    # Internal DB id used only for CRUD calls — never sent to the client
    _conv_id   = conversation.id
    turn_index = crud.count_turns(db, _conv_id)
    history    = crud.get_conversation_history_for_llm(db, _conv_id)

    initial_state = _build_initial_state(
        request, user, history, session_id,
        active_collection_name, active_collection_id, active_doc_id,
        query_id=query_id,
    )
    emit_event("query_lifecycle", stage="received", status="success",
               query_id=query_id, session_id=session_id,
               collection_id=active_collection_id,
               raw_query=request.raw_query.strip(),
               turn_index=turn_index)

    import time as _time

    async def event_generator():
        # First event: client stores session_id immediately for multi-turn chaining
        yield f"data: {json.dumps({'event': 'session_start', 'session_id': session_id, 'collection': active_collection_name})}\n\n"

        final_state = {}
        _q_t0 = _time.perf_counter()
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
            emit_event("query_lifecycle", stage="failed", status="error",
                       query_id=query_id, session_id=session_id,
                       collection_id=active_collection_id,
                       duration_ms=int((_time.perf_counter() - _q_t0) * 1000),
                       error_type=type(exc).__name__, error_message=str(exc))
            yield f"data: {json.dumps({'event': 'error', 'detail': str(exc)})}\n\n"
            return

        # Grounded refusal — no answer found in the context. Suppress citations,
        # score, and graph everywhere (live + on reload).
        answer_found = final_state.get("answer_found", True)

        try:
            # Copy any cited figure images into this turn's folder; this also
            # tags each figure citation with its relative figure_path.
            citations = final_state.get("citations")
            figure_paths = figure_store.copy_figures_for_turn(
                db, _conv_id, turn_index, citations
            )
            crud.save_conversation_turn(
                db=db,
                conversation_id=_conv_id,
                turn_index=turn_index,
                raw_query=request.raw_query,
                rewritten_query=final_state.get("rewritten_query"),
                final_answer=final_state.get("final_answer"),
                citations=citations,
                verification_score=final_state.get("verification_score") if answer_found else None,
                iterations_used=final_state.get("iteration", 0) + 1,
                query_complexity=final_state.get("query_complexity", "simple"),
                figure_paths=figure_paths,
            )
        except Exception as exc:
            yield f"data: {json.dumps({'event': 'persist_error', 'detail': str(exc)})}\n\n"

        emit_event("query_lifecycle", stage="completed", status="success",
                   query_id=query_id, session_id=session_id,
                   collection_id=active_collection_id,
                   duration_ms=int((_time.perf_counter() - _q_t0) * 1000),
                   answer_found=answer_found, turn_index=turn_index)

        # On a grounded refusal also suppress the graph and tell the client so it
        # doesn't render an empty graph block.
        graph_ui = (final_state.get("graph_ui") or None) if answer_found else None
        yield f"data: {json.dumps({'event': 'stream_end', 'session_id': session_id, 'graph_ui': graph_ui, 'no_answer': not answer_found})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Conversation management endpoints ─────────────────────────────────────────

@router.post("/conversations", status_code=status.HTTP_201_CREATED)
async def create_conversation(
    request: ConversationCreateRequest,
    user:    User = Depends(get_current_user),
    db:      Session = Depends(get_db),
):
    """Create a new conversation and return its session_id."""
    collection = crud.get_collection_by_name(db, user.org_id, request.collection_name)
    if collection is None:
        raise HTTPException(status_code=404, detail="Collection not found")

    session_id   = str(uuid.uuid4())
    conversation = crud.create_conversation(
        db,
        session_id=session_id,
        user_id=user.id,
        collection_id=collection.id,
        is_graph=request.is_graph,
    )
    return {
        "session_id":      session_id,
        "collection_name": request.collection_name,
        "is_graph":        conversation.is_graph,
        "created_at":      conversation.created_at.isoformat(),
    }


@router.get("/conversations")
async def list_conversations(
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    """List all conversations for the current user, sorted by most recently active.

    Use session_id to resume a conversation (pass in next query request).
    Use session_id to load history (GET /conversations/{session_id}/history).
    """
    convs = crud.list_conversations_with_title(db, user.id)
    return [
        {
            "session_id":      c["session_id"],
            "title":           c["title"],
            "collection_name": c["collection_name"],
            "is_graph":        c["is_graph"],
            "turn_count":      c["turn_count"],
            "last_active":     c["last_active"].isoformat(),
            "created_at":      c["created_at"].isoformat(),
        }
        for c in convs
    ]


@router.get("/conversations/{session_id}/history")
async def get_history(
    session_id: str,
    page:       int = 1,
    page_size:  int = 10,
    user: User = Depends(get_current_user),
    db:   Session = Depends(get_db),
):
    """Paginated turn history for a conversation.

    Page 1 = most recent turns. Scroll up → request page 2, 3, ... to load older turns.
    Each page is returned oldest→newest within the batch so the frontend can prepend directly.

    Query params:
      page       (default 1)   — 1 = most recent page_size turns
      page_size  (default 10)  — max 50

    Response fields:
      session_id — same as the URL param (for frontend convenience)
      total      — total turns in this conversation
      has_more   — True means older pages exist
      turns      — list of turns, oldest→newest within this batch
    """
    if page < 1:
        raise HTTPException(status_code=400, detail="page must be >= 1")
    if not (1 <= page_size <= 50):
        raise HTTPException(status_code=400, detail="page_size must be between 1 and 50")

    conversation = crud.get_conversation_by_session(db, session_id)
    if conversation is None or conversation.user_id != user.id:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "session_id": session_id,
        **crud.get_conversation_turns_page(
            db, conversation.id, page=page, page_size=page_size
        ),
    }
