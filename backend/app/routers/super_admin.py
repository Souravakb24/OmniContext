from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID
from app import crud
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import verify_password, create_super_admin_token, decode_super_admin_token
from app.models import SuperAdmin
from app import schemas

router = APIRouter(prefix="/api/super_admin", tags=["super_admin"])

bearer_scheme = HTTPBearer()


def get_current_super_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> SuperAdmin:
    token = credentials.credentials
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired super admin token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_super_admin_token(token)
        username: str = payload.get("username")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    sa = crud.get_super_admin_by_username(db, username)
    if sa is None:
        raise credentials_exception
    return sa


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.post("/register", response_model=schemas.MessageResponse, status_code=201)
def register_super_admin(body: schemas.SuperAdminRegisterRequest, db: Session = Depends(get_db)):
    existing = crud.get_super_admin_by_username(db, body.username)
    if existing:
        raise HTTPException(status_code=409, detail="Super admin username already taken")
    crud.create_super_admin(db, body.username, body.password)
    return schemas.MessageResponse(message=f"Super admin '{body.username}' created successfully")


@router.post("/login", response_model=schemas.SuperAdminLoginResponse)
def login_super_admin(body: schemas.SuperAdminLoginRequest, db: Session = Depends(get_db)):
    sa = crud.get_super_admin_by_username(db, body.username)
    if not sa or not verify_password(body.password, sa.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_super_admin_token({"username": sa.username})
    return schemas.SuperAdminLoginResponse(access_token=token)


# ── Platform Stats ────────────────────────────────────────────────────────────

@router.get("/stats", response_model=schemas.PlatformStatsResponse)
def platform_stats(
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    stats = crud.get_platform_stats(db)
    return schemas.PlatformStatsResponse(**stats)


# ── Org Management ────────────────────────────────────────────────────────────

@router.get("/orgs", response_model=list[schemas.OrgWithStatsResponse])
def list_all_orgs(
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    orgs = crud.get_all_orgs_with_stats(db)
    result = []
    for o in orgs:
        limits = o["limits"]
        result.append(schemas.OrgWithStatsResponse(
            org_id=o["org_id"],
            org_name=o["org_name"],
            data_consent=o["data_consent"],
            allow_training=o["allow_training"],
            consent_updated_at=o["consent_updated_at"],
            created_at=o["created_at"],
            user_count=o["user_count"],
            collection_count=o["collection_count"],
            doc_count=o["doc_count"],
            limits=schemas.OrgLimitsOut(
                max_users=limits.max_users if limits else 10,
                max_collections=limits.max_collections if limits else 5,
                max_docs_per_collection=limits.max_docs_per_collection if limits else 50,
            ),
        ))
    return result


@router.get("/org/{org_id}/users", response_model=list[schemas.UserListItem])
def list_org_users(
    org_id: UUID,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    org = crud.get_org_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    users = crud.list_users_in_org(db, org_id)
    return [schemas.UserListItem(**u) for u in users]


@router.patch("/org/{org_id}/limits", response_model=schemas.UpdateLimitsResponse)
def update_org_limits(
    org_id: UUID,
    body: schemas.UpdateLimitsRequest,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    org = crud.get_org_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    limits = crud.update_org_limits(db, org_id, body.max_users, body.max_collections, body.max_docs_per_collection)
    return schemas.UpdateLimitsResponse(
        org_id=org_id,
        max_users=limits.max_users,
        max_collections=limits.max_collections,
        max_docs_per_collection=limits.max_docs_per_collection,
    )


@router.patch("/org/{org_id}/consent", response_model=schemas.OrgConsentResponse)
def update_org_consent(
    org_id: UUID,
    body: schemas.OrgConsentRequest,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    org = crud.get_org_by_id(db, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")
    from app.encryption import decrypt_value
    org_name = decrypt_value(db, org.name_encrypted)
    updated = crud.update_org_consent(db, org_id, body.data_consent, body.allow_training)
    return schemas.OrgConsentResponse(
        org_id=org_id,
        org_name=org_name,
        data_consent=updated.data_consent,
        allow_training=updated.allow_training,
        consent_updated_at=updated.consent_updated_at,
    )


# ── Logs / Telemetry Dashboard ────────────────────────────────────────────────

@router.get("/logs/summary")
def logs_summary(
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Overview stats for last 24h, 7d, 30d."""
    rows = db.execute(text("""
        SELECT
            SUM(CASE WHEN event_type='doc_lifecycle' AND stage='completed' AND created_at >= NOW()-INTERVAL '1 day'  THEN 1 ELSE 0 END) AS docs_24h,
            SUM(CASE WHEN event_type='doc_lifecycle' AND stage='completed' AND created_at >= NOW()-INTERVAL '7 days' THEN 1 ELSE 0 END) AS docs_7d,
            SUM(CASE WHEN event_type='doc_lifecycle' AND stage='failed'    AND created_at >= NOW()-INTERVAL '1 day'  THEN 1 ELSE 0 END) AS doc_errors_24h,
            SUM(CASE WHEN event_type='query_lifecycle' AND stage='completed' AND created_at >= NOW()-INTERVAL '1 day'  THEN 1 ELSE 0 END) AS queries_24h,
            SUM(CASE WHEN event_type='query_lifecycle' AND stage='completed' AND created_at >= NOW()-INTERVAL '7 days' THEN 1 ELSE 0 END) AS queries_7d,
            SUM(CASE WHEN event_type='query_lifecycle' AND stage='failed'    AND created_at >= NOW()-INTERVAL '1 day'  THEN 1 ELSE 0 END) AS query_errors_24h,
            SUM(CASE WHEN event_type='llm_call' AND created_at >= NOW()-INTERVAL '1 day' THEN COALESCE(input_tokens,0)+COALESCE(output_tokens,0) ELSE 0 END) AS tokens_24h,
            SUM(CASE WHEN event_type='llm_call' AND created_at >= NOW()-INTERVAL '7 days' THEN COALESCE(input_tokens,0)+COALESCE(output_tokens,0) ELSE 0 END) AS tokens_7d,
            AVG(CASE WHEN event_type='doc_lifecycle' AND stage='completed' AND created_at >= NOW()-INTERVAL '7 days' THEN duration_ms END) AS avg_ingest_ms,
            AVG(CASE WHEN event_type='query_lifecycle' AND stage='completed' AND created_at >= NOW()-INTERVAL '7 days' THEN duration_ms END) AS avg_query_ms,
            SUM(CASE WHEN status='error' AND created_at >= NOW()-INTERVAL '1 day' THEN 1 ELSE 0 END) AS total_errors_24h
        FROM pipeline_events
    """)).fetchone()
    return {
        "docs_ingested":     {"24h": rows.docs_24h or 0,  "7d": rows.docs_7d or 0},
        "doc_errors":        {"24h": rows.doc_errors_24h or 0},
        "queries_handled":   {"24h": rows.queries_24h or 0, "7d": rows.queries_7d or 0},
        "query_errors":      {"24h": rows.query_errors_24h or 0},
        "total_tokens":      {"24h": rows.tokens_24h or 0, "7d": rows.tokens_7d or 0},
        "avg_ingest_ms":     round(float(rows.avg_ingest_ms or 0), 1),
        "avg_query_ms":      round(float(rows.avg_query_ms or 0), 1),
        "total_errors_24h":  rows.total_errors_24h or 0,
    }


@router.get("/logs/ingestion")
def logs_ingestion(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    collection_id: Optional[str] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Paginated list of document ingestion lifecycle events — one row per document."""
    filters = ["pe.event_type = 'doc_lifecycle'"]
    params: dict = {"limit": limit, "offset": (page - 1) * limit}
    if status:
        filters.append("pe.status = :status")
        params["status"] = status
    if collection_id:
        filters.append("pe.collection_id = CAST(:collection_id AS uuid)")
        params["collection_id"] = collection_id
    if from_dt:
        filters.append("pe.created_at >= :from_dt")
        params["from_dt"] = from_dt
    if to_dt:
        filters.append("pe.created_at <= :to_dt")
        params["to_dt"] = to_dt
    where = " AND ".join(filters)
    # One row per doc_id: latest event wins (shows terminal state)
    rows = db.execute(text(f"""
        WITH ranked AS (
            SELECT pe.id, pe.stage, pe.status, pe.doc_id, pe.collection_id,
                   pe.duration_ms, pe.error_type, pe.error_message, pe.metadata,
                   pe.created_at,
                   COALESCE(d.filename, pe.metadata->>'filename') AS filename,
                   col.name AS collection_name,
                   ROW_NUMBER() OVER (PARTITION BY pe.doc_id ORDER BY pe.created_at DESC) AS rn
            FROM pipeline_events pe
            LEFT JOIN documents  d   ON d.doc_id      = pe.doc_id
            LEFT JOIN collections col ON col.id        = pe.collection_id
            WHERE {where}
        )
        SELECT id, stage, status, doc_id, collection_id, duration_ms,
               error_type, error_message, metadata, created_at,
               filename, collection_name
        FROM ranked WHERE rn = 1
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """), params).fetchall()
    total = db.execute(text(f"""
        SELECT COUNT(DISTINCT pe.doc_id) FROM pipeline_events pe WHERE {where}
    """), {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar()
    return {
        "total": total,
        "page": page,
        "items": [dict(r._mapping) for r in rows],
    }


@router.get("/logs/ingestion/{doc_id}/trace")
def logs_ingestion_trace(
    doc_id: str,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Full event timeline for a single document, with filename."""
    doc_row = db.execute(text(
        "SELECT filename FROM documents WHERE doc_id = CAST(:doc_id AS uuid)"
    ), {"doc_id": doc_id}).fetchone()
    filename = doc_row.filename if doc_row else None

    rows = db.execute(text("""
        SELECT event_type, stage, status, duration_ms, input_tokens, output_tokens,
               input_text, output_text, error_type, error_message, error_traceback,
               metadata, created_at
        FROM pipeline_events
        WHERE doc_id = CAST(:doc_id AS uuid)
        ORDER BY created_at ASC
    """), {"doc_id": doc_id}).fetchall()
    return {"doc_id": doc_id, "filename": filename, "events": [dict(r._mapping) for r in rows]}


@router.get("/logs/queries")
def logs_queries(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    session_id: Optional[str] = None,
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Paginated list of completed queries with session title, turn index, collection name."""
    filters = ["pe.event_type = 'query_lifecycle'", "pe.stage = 'completed'"]
    params: dict = {"limit": limit, "offset": (page - 1) * limit}
    if status:
        filters.append("pe.status = :status")
        params["status"] = status
    if session_id:
        filters.append("pe.session_id = :session_id")
        params["session_id"] = session_id
    if from_dt:
        filters.append("pe.created_at >= :from_dt")
        params["from_dt"] = from_dt
    if to_dt:
        filters.append("pe.created_at <= :to_dt")
        params["to_dt"] = to_dt
    where = " AND ".join(filters)
    rows = db.execute(text(f"""
        SELECT pe.id, pe.status, pe.query_id, pe.session_id, pe.collection_id,
               pe.duration_ms, pe.metadata, pe.created_at,
               col.name                                         AS collection_name,
               conv.title                                       AS session_title,
               (pe.metadata->>'turn_index')::int                AS turn_index,
               (SELECT COUNT(*) FROM conversation_turns ct2
                JOIN conversations c2 ON c2.id = ct2.conversation_id
                WHERE c2.session_id = pe.session_id)            AS total_turns,
               (pe.metadata->>'raw_query')                      AS raw_query
        FROM pipeline_events pe
        LEFT JOIN collections  col  ON col.id           = pe.collection_id
        LEFT JOIN conversations conv ON conv.session_id = pe.session_id
        WHERE {where}
        ORDER BY pe.created_at DESC
        LIMIT :limit OFFSET :offset
    """), params).fetchall()
    total = db.execute(text(f"SELECT COUNT(*) FROM pipeline_events pe WHERE {where}"),
                       {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar()
    return {
        "total": total,
        "page": page,
        "items": [dict(r._mapping) for r in rows],
    }


@router.get("/logs/queries/{query_id}/trace")
def logs_query_trace(
    query_id: str,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Full event timeline for a single query, including LLM text and chunk details."""
    # Pull session context from the received event
    ctx = db.execute(text("""
        SELECT session_id, (metadata->>'raw_query') AS raw_query,
               (metadata->>'turn_index')::int        AS turn_index
        FROM pipeline_events
        WHERE query_id = CAST(:qid AS uuid) AND stage = 'received'
        LIMIT 1
    """), {"qid": query_id}).fetchone()

    session_id  = ctx.session_id  if ctx else None
    raw_query   = ctx.raw_query   if ctx else None
    turn_index  = ctx.turn_index  if ctx else None

    # Session title and total turns
    session_title = None
    total_turns   = None
    if session_id:
        conv = db.execute(text("""
            SELECT conv.title,
                   (SELECT COUNT(*) FROM conversation_turns ct
                    JOIN conversations c2 ON c2.id = ct.conversation_id
                    WHERE c2.session_id = :sid) AS total_turns
            FROM conversations conv WHERE conv.session_id = :sid LIMIT 1
        """), {"sid": session_id}).fetchone()
        if conv:
            session_title = conv.title
            total_turns   = conv.total_turns

    rows = db.execute(text("""
        SELECT event_type, stage, status, duration_ms, input_tokens, output_tokens,
               input_text, output_text, error_type, error_message, error_traceback,
               metadata, created_at
        FROM pipeline_events
        WHERE query_id = CAST(:qid AS uuid)
        ORDER BY created_at ASC
    """), {"qid": query_id}).fetchall()

    # Fetch full answer from conversation_turns (no truncation)
    full_answer = None
    if session_id and turn_index is not None:
        ans_row = db.execute(text("""
            SELECT ct.final_answer
            FROM conversation_turns ct
            JOIN conversations c ON c.id = ct.conversation_id
            WHERE c.session_id = :sid AND ct.turn_index = :ti
            LIMIT 1
        """), {"sid": session_id, "ti": turn_index}).fetchone()
        if ans_row:
            full_answer = ans_row.final_answer

    events = []
    for r in rows:
        e = dict(r._mapping)
        # Replace truncated output_text with full answer for the answer stage
        if e.get("stage") == "answer" and full_answer:
            e["output_text"] = full_answer
        events.append(e)

    return {
        "query_id":     query_id,
        "session_id":   session_id,
        "session_title":session_title,
        "raw_query":    raw_query,
        "turn_index":   turn_index,
        "total_turns":  total_turns,
        "events":       events,
    }


@router.get("/logs/tokens")
def logs_tokens(
    group_by: str = Query("stage", pattern="^(stage|model|day)$"),
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Token usage from llm_call events, grouped by stage, model, or day."""
    filters = ["event_type = 'llm_call'"]
    params: dict = {}
    if from_dt:
        filters.append("created_at >= :from_dt")
        params["from_dt"] = from_dt
    if to_dt:
        filters.append("created_at <= :to_dt")
        params["to_dt"] = to_dt
    where = " AND ".join(filters)

    if group_by == "stage":
        select = "stage AS group_key"
        group  = "stage"
    elif group_by == "model":
        select = "metadata->>'model' AS group_key"
        group  = "metadata->>'model'"
    else:
        select = "DATE(created_at)::text AS group_key"
        group  = "DATE(created_at)"

    rows = db.execute(text(f"""
        SELECT {select},
               COUNT(*)                        AS call_count,
               SUM(COALESCE(input_tokens,0))   AS input_tokens_total,
               SUM(COALESCE(output_tokens,0))  AS output_tokens_total,
               AVG(duration_ms)                AS avg_latency_ms
        FROM pipeline_events
        WHERE {where}
        GROUP BY {group}
        ORDER BY input_tokens_total DESC NULLS LAST
    """), params).fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/logs/errors")
def logs_errors(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """All error events across ingestion and retrieval."""
    filters = ["status = 'error'"]
    params: dict = {"limit": limit, "offset": (page - 1) * limit}
    if from_dt:
        filters.append("created_at >= :from_dt")
        params["from_dt"] = from_dt
    if to_dt:
        filters.append("created_at <= :to_dt")
        params["to_dt"] = to_dt
    where = " AND ".join(filters)
    rows = db.execute(text(f"""
        SELECT id, event_type, stage, doc_id, query_id, collection_id,
               error_type, error_message, error_traceback, created_at
        FROM pipeline_events
        WHERE {where}
        ORDER BY created_at DESC
        LIMIT :limit OFFSET :offset
    """), params).fetchall()
    total = db.execute(text(f"SELECT COUNT(*) FROM pipeline_events WHERE {where}"),
                       {k: v for k, v in params.items() if k not in ("limit", "offset")}).scalar()
    return {
        "total": total,
        "page": page,
        "items": [dict(r._mapping) for r in rows],
    }


@router.get("/logs/errors/grouped")
def logs_errors_grouped(
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Error counts grouped by error_type — shows which errors are most frequent."""
    filters = ["status = 'error'"]
    params: dict = {}
    if from_dt:
        filters.append("created_at >= :from_dt")
        params["from_dt"] = from_dt
    if to_dt:
        filters.append("created_at <= :to_dt")
        params["to_dt"] = to_dt
    where = " AND ".join(filters)
    rows = db.execute(text(f"""
        SELECT error_type, event_type, COUNT(*) AS count,
               MAX(created_at) AS last_seen
        FROM pipeline_events
        WHERE {where}
        GROUP BY error_type, event_type
        ORDER BY count DESC
    """), params).fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/logs/sessions")
def logs_sessions(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Paginated list of all conversations across the platform, newest first."""
    offset = (page - 1) * limit
    rows = db.execute(text("""
        SELECT conv.session_id,
               COALESCE(conv.title, 'Untitled conversation') AS title,
               col.name  AS collection_name,
               conv.is_graph,
               conv.created_at,
               conv.updated_at AS last_active,
               COUNT(ct.id)    AS turn_count
        FROM conversations conv
        LEFT JOIN collections        col ON col.id = conv.collection_id
        LEFT JOIN conversation_turns ct  ON ct.conversation_id = conv.id
        GROUP BY conv.session_id, conv.title, col.name, conv.is_graph,
                 conv.created_at, conv.updated_at
        ORDER BY conv.updated_at DESC
        LIMIT :limit OFFSET :offset
    """), {"limit": limit, "offset": offset}).fetchall()

    total = db.execute(text("SELECT COUNT(*) FROM conversations")).scalar()
    return {
        "total": total,
        "page":  page,
        "items": [dict(r._mapping) for r in rows],
    }


@router.get("/logs/sessions/{session_id}")
def logs_session_detail(
    session_id: str,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """All turns in a conversation, each linked to its pipeline query_id."""
    conv = db.execute(text("""
        SELECT conv.session_id, COALESCE(conv.title, 'Untitled conversation') AS title,
               col.name AS collection_name, conv.is_graph,
               conv.created_at, conv.updated_at AS last_active, conv.id AS conv_id
        FROM conversations conv
        LEFT JOIN collections col ON col.id = conv.collection_id
        WHERE conv.session_id = :sid
        LIMIT 1
    """), {"sid": session_id}).fetchone()
    if not conv:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Session not found")

    turns = db.execute(text("""
        SELECT ct.turn_index, ct.raw_query, ct.final_answer,
               ct.rewritten_query, ct.verification_score, ct.iterations_used,
               ct.query_complexity, ct.created_at,
               pe.query_id::text AS query_id
        FROM conversation_turns ct
        LEFT JOIN pipeline_events pe
            ON  pe.session_id = :sid
            AND pe.stage      = 'received'
            AND (pe.metadata->>'turn_index')::int = ct.turn_index
        WHERE ct.conversation_id = :conv_id
        ORDER BY ct.turn_index ASC
    """), {"sid": session_id, "conv_id": str(conv.conv_id)}).fetchall()

    return {
        "session_id":      session_id,
        "title":           conv.title,
        "collection_name": conv.collection_name,
        "is_graph":        conv.is_graph,
        "created_at":      conv.created_at,
        "last_active":     conv.last_active,
        "turns":           [dict(t._mapping) for t in turns],
    }


@router.get("/logs/store-health")
def logs_store_health(
    from_dt: Optional[datetime] = None,
    to_dt: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _: SuperAdmin = Depends(get_current_super_admin),
):
    """Empty-result rates per retrieval store (bm25 / vector / graph)."""
    filters = ["event_type = 'store_result'"]
    params: dict = {}
    if from_dt:
        filters.append("created_at >= :from_dt")
        params["from_dt"] = from_dt
    if to_dt:
        filters.append("created_at <= :to_dt")
        params["to_dt"] = to_dt
    where = " AND ".join(filters)
    rows = db.execute(text(f"""
        SELECT stage,
               COUNT(*) AS total_calls,
               SUM(CASE WHEN (metadata->>'was_empty')::boolean THEN 1 ELSE 0 END) AS empty_calls,
               AVG(duration_ms) AS avg_latency_ms
        FROM pipeline_events
        WHERE {where}
        GROUP BY stage
        ORDER BY stage
    """), params).fetchall()
    result = []
    for r in rows:
        total = r.total_calls or 1
        empty_rate = round((r.empty_calls or 0) / total * 100, 1)
        result.append({
            "store": r.stage,
            "total_calls": r.total_calls,
            "empty_calls": r.empty_calls,
            "empty_rate_pct": empty_rate,
            "avg_latency_ms": round(float(r.avg_latency_ms or 0), 1),
        })
    return result
