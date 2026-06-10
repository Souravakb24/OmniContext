"""
Central telemetry emitter.

emit_event() writes one row to pipeline_events (PostgreSQL) and also
logs the event via loguru.  It is fire-and-forget: it swallows every
exception so a telemetry failure can never crash the caller.
"""
from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID

from loguru import logger


def _safe_uuid(val: str | None) -> str | None:
    """Return val if it is a valid UUID string, else None."""
    if not val:
        return None
    try:
        UUID(str(val))
        return str(val)
    except (ValueError, AttributeError):
        return None


def emit_event(
    event_type: str,
    stage: str = "",
    status: str = "success",
    doc_id: str = "",
    query_id: str = "",
    session_id: str = "",
    collection_id: str = "",
    duration_ms: int | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    input_text: str = "",
    output_text: str = "",
    error_type: str = "",
    error_message: str = "",
    error_traceback: str = "",
    **metadata,
) -> None:
    """Write a telemetry event to pipeline_events. Never raises."""
    try:
        from app.database import SessionLocal
        from sqlalchemy import text

        db = SessionLocal()
        try:
            db.execute(
                text("""
                    INSERT INTO pipeline_events
                        (event_type, stage, status,
                         doc_id, query_id, session_id, collection_id,
                         duration_ms, input_tokens, output_tokens,
                         input_text, output_text,
                         error_type, error_message, error_traceback,
                         metadata, created_at)
                    VALUES
                        (:event_type, :stage, :status,
                         :doc_id, :query_id, :session_id, :collection_id,
                         :duration_ms, :input_tokens, :output_tokens,
                         :input_text, :output_text,
                         :error_type, :error_message, :error_traceback,
                         CAST(:metadata AS jsonb), :created_at)
                """),
                {
                    "event_type":      event_type,
                    "stage":           stage or "",
                    "status":          status,
                    "doc_id":          _safe_uuid(doc_id),
                    "query_id":        _safe_uuid(query_id),
                    "session_id":      session_id or None,
                    "collection_id":   _safe_uuid(collection_id),
                    "duration_ms":     duration_ms,
                    "input_tokens":    input_tokens,
                    "output_tokens":   output_tokens,
                    "input_text":      input_text or None,
                    "output_text":     output_text or None,
                    "error_type":      error_type or None,
                    "error_message":   error_message or None,
                    "error_traceback": error_traceback or None,
                    "metadata":        json.dumps(metadata) if metadata else "{}",
                    "created_at":      datetime.utcnow(),
                },
            )
            db.commit()
        finally:
            db.close()

        if status == "error":
            logger.bind(
                event_type=event_type, stage=stage,
                doc_id=doc_id, query_id=query_id,
            ).error("telemetry[{}|{}] error — {}", event_type, stage, error_message)
        else:
            logger.bind(
                event_type=event_type, stage=stage,
                doc_id=doc_id, query_id=query_id,
            ).debug("telemetry[{}|{}] duration_ms={}", event_type, stage, duration_ms)

    except Exception:
        pass  # telemetry must never crash the caller
