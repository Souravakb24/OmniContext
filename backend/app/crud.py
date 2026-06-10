from uuid import UUID
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.models import Organisation, OrgLimit, User, Session as UserSession, UserFileUsage, Collection, SuperAdmin, Conversation, ConversationTurn, DemoSession
from app.encryption import encrypt_value, decrypt_value, generate_username_hash
from app.auth import hash_password, hash_token
from app.config import settings
from app.services import figure_store

# Fixed UUIDs for the shared demo org + user (created once at startup)
DEMO_ORG_ID   = "00000000-0000-0000-0000-000000000001"
DEMO_USER_ID  = "00000000-0000-0000-0000-000000000002"
DEMO_MAX_DOCS    = 2
DEMO_MAX_PAGES   = 2   # max pages ingested per demo document (extras are truncated)
DEMO_MAX_QUERIES = 3
DEMO_TTL_HOURS   = 2


# ── Org ──────────────────────────────────────────────────────────────────────

def get_all_orgs_decrypted(db: Session) -> list[dict]:
    orgs = db.query(Organisation).all()
    result = []
    for org in orgs:
        name = decrypt_value(db, org.name_encrypted)
        result.append({"id": org.id, "name": name, "created_at": org.created_at})
    return result


def find_org_by_name(db: Session, org_name: str) -> Organisation | None:
    orgs = db.query(Organisation).all()
    for org in orgs:
        decrypted = decrypt_value(db, org.name_encrypted)
        if decrypted.lower() == org_name.lower():
            return org
    return None


def create_org(
    db: Session,
    org_name: str,
    max_users: int = 10,
    max_collections: int = 5,
    max_docs_per_collection: int = 50,
) -> tuple[Organisation, OrgLimit]:
    encrypted = encrypt_value(db, org_name)
    org = Organisation(name_encrypted=encrypted)
    db.add(org)
    db.flush()

    limits = OrgLimit(
        org_id=org.id,
        max_users=max_users,
        max_collections=max_collections,
        max_docs_per_collection=max_docs_per_collection,
    )
    db.add(limits)
    db.commit()
    db.refresh(org)
    db.refresh(limits)
    return org, limits


def get_org_by_id(db: Session, org_id: UUID) -> Organisation | None:
    return db.query(Organisation).filter(Organisation.id == org_id).first()


def get_org_limits(db: Session, org_id: UUID) -> OrgLimit | None:
    return db.query(OrgLimit).filter(OrgLimit.org_id == org_id).first()


def update_org_limits(db: Session, org_id: UUID, max_users: int, max_collections: int, max_docs_per_collection: int) -> OrgLimit:
    limits = get_org_limits(db, org_id)
    limits.max_users = max_users
    limits.max_collections = max_collections
    limits.max_docs_per_collection = max_docs_per_collection
    db.commit()
    db.refresh(limits)
    return limits


# ── User ─────────────────────────────────────────────────────────────────────

def count_active_users(db: Session, org_id: UUID) -> int:
    return db.query(User).filter(User.org_id == org_id, User.is_active == True).count()


def count_all_users(db: Session, org_id: UUID) -> int:
    return db.query(User).filter(User.org_id == org_id).count()


def get_user_by_username_hash(db: Session, org_id: UUID, username_hash: str) -> User | None:
    return db.query(User).filter(
        User.org_id == org_id,
        User.username_hash == username_hash
    ).first()


def get_user_by_id(db: Session, user_id: UUID) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, org_id: UUID, username: str, password: str, role: str) -> User:
    username_hash = generate_username_hash(username)
    username_encrypted = encrypt_value(db, username)
    hashed_pw = hash_password(password)

    user = User(
        org_id=org_id,
        username_encrypted=username_encrypted,
        username_hash=username_hash,
        password=hashed_pw,
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def list_users(db: Session, org_id: UUID) -> list[dict]:
    users = db.query(User).filter(User.org_id == org_id).all()
    result = []
    for u in users:
        username = decrypt_value(db, u.username_encrypted)
        result.append({
            "user_id": u.id,
            "username": username,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at,
        })
    return result


def set_user_active(db: Session, user: User, active: bool) -> None:
    user.is_active = active
    db.commit()


def set_user_role(db: Session, user: User, role: str) -> None:
    user.role = role
    db.commit()


def update_user_password(db: Session, user: User, new_password: str) -> None:
    user.password = hash_password(new_password)
    db.commit()


# ── Sessions ──────────────────────────────────────────────────────────────────

def create_session(db: Session, user_id: UUID, token: str) -> UserSession:
    token_hash = hash_token(token)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRES_MINUTES)
    session = UserSession(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(session)
    db.commit()
    return session


def delete_session_by_token(db: Session, token: str) -> None:
    token_hash = hash_token(token)
    db.query(UserSession).filter(UserSession.token_hash == token_hash).delete()
    db.commit()


def delete_all_sessions_for_user(db: Session, user_id: UUID) -> None:
    db.query(UserSession).filter(UserSession.user_id == user_id).delete()
    db.commit()


# ── File Usage ────────────────────────────────────────────────────────────────

def get_daily_file_usage(db: Session, user_id: UUID) -> int:
    row = db.execute(
        text("SELECT file_count FROM user_file_usage WHERE user_id = :uid AND usage_date = CURRENT_DATE"),
        {"uid": str(user_id)}
    ).fetchone()
    return row.file_count if row else 0


def increment_file_usage(db: Session, user_id: UUID, org_id: UUID) -> None:
    db.execute(
        text("""
            INSERT INTO user_file_usage (id, user_id, org_id, file_count, usage_date)
            VALUES (gen_random_uuid(), :user_id, :org_id, 1, CURRENT_DATE)
            ON CONFLICT (user_id, usage_date)
            DO UPDATE SET file_count = user_file_usage.file_count + 1
        """),
        {"user_id": str(user_id), "org_id": str(org_id)}
    )
    db.commit()


def get_org_file_usage_today(db: Session, org_id: UUID) -> list[dict]:
    rows = db.execute(
        text("""
            SELECT u.id AS user_id, u.username_encrypted, ufu.file_count
            FROM users u
            LEFT JOIN user_file_usage ufu
                ON ufu.user_id = u.id AND ufu.usage_date = CURRENT_DATE
            WHERE u.org_id = :org_id
        """),
        {"org_id": str(org_id)}
    ).fetchall()
    result = []
    for row in rows:
        username = decrypt_value(db, row.username_encrypted)
        uploaded = row.file_count or 0
        result.append({"username": username, "uploaded": uploaded, "remaining": max(0, 5 - uploaded)})
    return result


# ── Collections ───────────────────────────────────────────────────────────────

def count_active_collections(db: Session, org_id: UUID) -> int:
    return db.query(Collection).filter(Collection.org_id == org_id, Collection.is_active == True).count()


def get_collection_by_name(db: Session, org_id: UUID, name: str) -> Collection | None:
    return db.query(Collection).filter(Collection.org_id == org_id, Collection.name == name).first()


def get_collection_by_id(db: Session, collection_id: UUID) -> Collection | None:
    return db.query(Collection).filter(Collection.id == collection_id).first()


def create_collection(db: Session, org_id: UUID, name: str, description: str | None, created_by: UUID) -> Collection:
    import re, uuid as _uuid
    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", name).lower()
    chroma_name = f"{slug}_{_uuid.uuid4().hex[:8]}_vector"
    col = Collection(org_id=org_id, name=name, description=description,
                     created_by=created_by, chroma_collection_name=chroma_name)
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


def list_collections(db: Session, org_id: UUID) -> list[Collection]:
    return db.query(Collection).filter(Collection.org_id == org_id, Collection.is_active == True).all()


def try_increment_doc_count(db: Session, collection_id: UUID, max_docs: int) -> bool:
    """Atomically increment doc_count only if still under the limit.
    Returns True if incremented, False if the limit was already reached."""
    result = db.execute(
        text("""
            UPDATE collections
            SET doc_count = doc_count + 1
            WHERE id = CAST(:collection_id AS uuid)
              AND doc_count < :max_docs
        """),
        {"collection_id": str(collection_id), "max_docs": max_docs}
    )
    db.commit()
    return result.rowcount == 1


# ── Upload / Documents ────────────────────────────────────────────────────────

def get_document_by_hash(db: Session, sha256: str) -> dict | None:
    row = db.execute(
        text("SELECT doc_id, output_dir, pdf_path FROM documents WHERE sha256_hash = :h"),
        {"h": sha256}
    ).fetchone()
    if row is None:
        return None
    return {"doc_id": str(row.doc_id), "output_dir": row.output_dir, "pdf_path": row.pdf_path}


def insert_document(
    db: Session,
    user_id: UUID,
    collection_id: UUID,
    filename: str,
    original_extension: str,
    output_dir: str,
    pdf_path: str,
    sha256_hash: str,
    mime_type: str,
    size_bytes: int,
    tags: list[str],
    storage_mode: str = "Vector_DB",
) -> dict:
    row = db.execute(
        text("""
            INSERT INTO documents (
                user_id, collection_id, filename, original_extension,
                output_dir, pdf_path, sha256_hash, mime_type, size_bytes, tags, status, storage_mode
            ) VALUES (
                :user_id, :collection_id, :filename, :original_extension,
                :output_dir, :pdf_path, :sha256_hash, :mime_type, :size_bytes, :tags, 'QUEUED', :storage_mode
            )
            RETURNING doc_id, created_at
        """),
        {
            "user_id": str(user_id),
            "collection_id": str(collection_id),
            "filename": filename,
            "original_extension": original_extension,
            "output_dir": output_dir,
            "pdf_path": pdf_path,
            "sha256_hash": sha256_hash,
            "mime_type": mime_type,
            "size_bytes": size_bytes,
            "tags": tags,
            "storage_mode": storage_mode,
        }
    ).fetchone()
    db.commit()
    return {"doc_id": str(row.doc_id), "created_at": row.created_at}


def update_document_paths(db: Session, doc_id: str, output_dir: str, pdf_path: str) -> None:
    db.execute(
        text("""
            UPDATE documents
            SET output_dir = :output_dir, pdf_path = :pdf_path,
                status = 'QUEUED', error_message = NULL
            WHERE doc_id = CAST(:doc_id AS uuid)
        """),
        {"doc_id": doc_id, "output_dir": output_dir, "pdf_path": pdf_path}
    )
    db.commit()


# ── Ingestion ─────────────────────────────────────────────────────────────────

def claim_next_document(db: Session) -> dict | None:
    """Atomically claim the oldest QUEUED document for ingestion.
    Uses SELECT FOR UPDATE SKIP LOCKED so concurrent workers never double-claim.
    Sets ingestion_start at claim time so timing reflects actual processing start."""
    row = db.execute(
        text("""
            UPDATE documents
            SET ingestion_start = NOW()
            WHERE doc_id = (
                SELECT doc_id FROM documents
                WHERE status = 'QUEUED'
                ORDER BY created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            )
            RETURNING doc_id, pdf_path, output_dir, filename, storage_mode, collection_id
        """)
    ).fetchone()
    db.commit()
    if row is None:
        return None
    coll = db.execute(
        text("SELECT name FROM collections WHERE id = :cid"),
        {"cid": row.collection_id},
    ).fetchone()
    return {
        "doc_id":           str(row.doc_id),
        "pdf_path":         row.pdf_path,
        "output_dir":       row.output_dir,
        "filename":         row.filename,
        "storage_mode":     row.storage_mode,
        "collection_id":    str(row.collection_id),
        "collection_name":  coll.name if coll else "default",
    }


def update_document_status(db: Session, doc_id: str, status: str, **kwargs) -> None:
    extra_sets = ""
    params: dict = {"doc_id": doc_id, "status": status}

    if "ingestion_start" in kwargs:
        extra_sets += ", ingestion_start = :ingestion_start"
        params["ingestion_start"] = kwargs["ingestion_start"]
    if "ingestion_end" in kwargs:
        extra_sets += ", ingestion_end = :ingestion_end"
        params["ingestion_end"] = kwargs["ingestion_end"]

    db.execute(
        text(f"UPDATE documents SET status = :status{extra_sets} WHERE doc_id = CAST(:doc_id AS uuid)"),
        params,
    )
    db.commit()


def mark_document_failed(db: Session, doc_id: str, error_message: str) -> None:
    db.execute(
        text("""
            UPDATE documents
            SET status = 'FAILED',
                error_message = :error,
                retry_count   = COALESCE(retry_count, 0) + 1,
                ingestion_end = NOW()
            WHERE doc_id = CAST(:doc_id AS uuid)
        """),
        {"doc_id": doc_id, "error": error_message},
    )
    db.commit()


def mark_document_completed(db: Session, doc_id: str) -> None:
    db.execute(
        text("""
            UPDATE documents
            SET status = 'COMPLETED', ingestion_end = NOW()
            WHERE doc_id = CAST(:doc_id AS uuid)
        """),
        {"doc_id": doc_id},
    )
    db.commit()


def save_pipeline_result(
    db: Session,
    doc_id: str,
    layout_json: dict,
    chunks_json: dict,       # kept in signature for call-site compatibility; no longer persisted
    ingestion_report: dict,
) -> None:
    import json as _json
    db.execute(
        text("""
            UPDATE documents
            SET layout_json      = CAST(:layout AS jsonb),
                ingestion_report = CAST(:report AS jsonb)
            WHERE doc_id = CAST(:doc_id AS uuid)
        """),
        {
            "doc_id": doc_id,
            "layout": _json.dumps(layout_json),
            "report": _json.dumps(ingestion_report),
        },
    )
    db.commit()


def insert_document_pages(db: Session, doc_id: str, pages: list[dict]) -> None:
    """Insert or replace page image paths.
    Each entry in pages: {page_no, image_path (str), width_px, height_px}"""
    for page in pages:
        db.execute(
            text("""
                INSERT INTO document_pages (id, doc_id, page_no, image_path, width_px, height_px)
                VALUES (gen_random_uuid(), CAST(:doc_id AS uuid), :page_no, :image_path, :width_px, :height_px)
                ON CONFLICT (doc_id, page_no) DO UPDATE
                    SET image_path = EXCLUDED.image_path,
                        width_px   = EXCLUDED.width_px,
                        height_px  = EXCLUDED.height_px
            """),
            {
                "doc_id":     doc_id,
                "page_no":    page["page_no"],
                "image_path": page["image_path"],
                "width_px":   page["width_px"],
                "height_px":  page["height_px"],
            },
        )
    db.commit()


def get_document_for_user(db: Session, doc_id: str, user_id: UUID) -> dict | None:
    row = db.execute(
        text("""
            SELECT doc_id, filename, status, error_message, retry_count,
                   ingestion_start, ingestion_end, created_at,
                   mime_type, size_bytes, collection_id, tags, original_extension,
                   ingestion_report
            FROM documents
            WHERE doc_id = CAST(:doc_id AS uuid)
              AND user_id = CAST(:user_id AS uuid)
        """),
        {"doc_id": doc_id, "user_id": str(user_id)},
    ).fetchone()
    if row is None:
        return None
    return dict(row._mapping)


def list_user_documents(db: Session, user_id: UUID) -> list[dict]:
    rows = db.execute(
        text("""
            SELECT doc_id, filename, status, error_message, retry_count,
                   ingestion_start, ingestion_end, created_at,
                   mime_type, size_bytes, collection_id, tags, original_extension,
                   ingestion_report
            FROM documents
            WHERE user_id = CAST(:user_id AS uuid)
            ORDER BY created_at DESC
        """),
        {"user_id": str(user_id)},
    ).fetchall()
    return [dict(r._mapping) for r in rows]


def reset_document_for_retry(db: Session, doc_id: str, user_id: UUID) -> bool:
    """Re-queue a stuck/failed document so the worker re-picks it.

    Targets 'QUEUED' (the status the worker actually claims) and allows retry from
    any non-completed state — FAILED or a status left mid-run by a crash/restart.
    """
    result = db.execute(
        text("""
            UPDATE documents
            SET status        = 'QUEUED',
                error_message = NULL,
                ingestion_start = NULL,
                ingestion_end   = NULL
            WHERE doc_id  = CAST(:doc_id AS uuid)
              AND user_id = CAST(:user_id AS uuid)
              AND status <> 'COMPLETED'
        """),
        {"doc_id": doc_id, "user_id": str(user_id)},
    )
    db.commit()
    return result.rowcount == 1


def requeue_stuck_documents(db: Session) -> int:
    """Re-queue documents stranded mid-ingestion (e.g. by a worker crash/restart).

    Any doc in a non-terminal status other than QUEUED is reset to QUEUED so the
    worker re-claims it. Re-ingestion is idempotent (chunks are deleted+reinserted
    and ChromaDB upserts), so reprocessing is safe. The age guard avoids racing a
    document that another worker started processing seconds ago.
    """
    result = db.execute(
        text("""
            UPDATE documents
            SET status        = 'QUEUED',
                error_message = NULL,
                ingestion_start = NULL,
                ingestion_end   = NULL
            WHERE status IN ('UPLOADED','CONVERTING','PARSING','CHUNKING','EMBEDDING','INDEXING')
              AND (ingestion_start IS NULL OR ingestion_start < NOW() - INTERVAL '1 minute')
        """)
    )
    db.commit()
    return result.rowcount


# ── Doc Summary ───────────────────────────────────────────────────────────────

def save_doc_summary(
    db: Session,
    doc_id: str,
    file_name: str,
    summary,
    assigned_domain,
    is_new_domain,
    proposed_domain,
    confidence,
    needs_graph,
    graph_reason,
    model_used,
    sampled_chunk_indices,
) -> None:
    import json as _json
    db.execute(
        text("""
            INSERT INTO doc_summary (
                doc_id, file_name, summary, assigned_domain,
                is_new_domain, proposed_domain, confidence,
                needs_graph, graph_reason,
                model_used, sampled_chunk_indices
            ) VALUES (
                CAST(:doc_id AS uuid), :file_name, :summary, :assigned_domain,
                :is_new_domain, :proposed_domain, :confidence,
                :needs_graph, :graph_reason,
                :model_used, CAST(:indices AS jsonb)
            )
            ON CONFLICT (doc_id) DO UPDATE SET
                summary               = EXCLUDED.summary,
                assigned_domain       = EXCLUDED.assigned_domain,
                is_new_domain         = EXCLUDED.is_new_domain,
                proposed_domain       = EXCLUDED.proposed_domain,
                confidence            = EXCLUDED.confidence,
                needs_graph           = EXCLUDED.needs_graph,
                graph_reason          = EXCLUDED.graph_reason,
                model_used            = EXCLUDED.model_used,
                sampled_chunk_indices = EXCLUDED.sampled_chunk_indices
        """),
        {
            "doc_id":          doc_id,
            "file_name":       file_name,
            "summary":         summary,
            "assigned_domain": assigned_domain,
            "is_new_domain":   is_new_domain,
            "proposed_domain": proposed_domain,
            "confidence":      confidence,
            "needs_graph":     needs_graph,
            "graph_reason":    graph_reason,
            "model_used":      model_used,
            "indices":         _json.dumps(sampled_chunk_indices),
        },
    )
    db.commit()


def get_doc_summary(db: Session, doc_id: str, user_id) -> dict | None:
    row = db.execute(
        text("""
            SELECT ds.doc_id, ds.file_name, ds.summary, ds.assigned_domain,
                   ds.is_new_domain, ds.proposed_domain, ds.confidence,
                   ds.needs_graph, ds.graph_reason, ds.model_used,
                   ds.sampled_chunk_indices
            FROM doc_summary ds
            JOIN documents d ON d.doc_id = ds.doc_id
            WHERE ds.doc_id = CAST(:doc_id AS uuid)
              AND d.user_id = CAST(:user_id AS uuid)
        """),
        {"doc_id": doc_id, "user_id": str(user_id)},
    ).fetchone()
    if row is None:
        return None
    return dict(row._mapping)


# ── Super Admin ───────────────────────────────────────────────────────────────

def get_super_admin_by_username(db: Session, username: str) -> SuperAdmin | None:
    return db.query(SuperAdmin).filter(SuperAdmin.username == username).first()


def create_super_admin(db: Session, username: str, password: str) -> SuperAdmin:
    sa = SuperAdmin(username=username, password=hash_password(password))
    db.add(sa)
    db.commit()
    db.refresh(sa)
    return sa


def update_org_consent(db: Session, org_id: UUID, data_consent: bool, allow_training: bool) -> Organisation:
    org = db.query(Organisation).filter(Organisation.id == org_id).first()
    org.data_consent = data_consent
    org.allow_training = allow_training
    org.consent_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(org)
    return org


def get_platform_stats(db: Session) -> dict:
    total_orgs = db.query(Organisation).count()
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    total_collections = db.query(Collection).filter(Collection.is_active == True).count()
    total_docs = db.execute(text("SELECT COALESCE(SUM(doc_count), 0) FROM collections WHERE is_active = true")).scalar()
    orgs_with_consent = db.query(Organisation).filter(Organisation.data_consent == True).count()
    orgs_with_training = db.query(Organisation).filter(Organisation.allow_training == True).count()
    return {
        "total_orgs": total_orgs,
        "total_users": total_users,
        "active_users": active_users,
        "total_collections": total_collections,
        "total_docs": int(total_docs),
        "orgs_with_data_consent": orgs_with_consent,
        "orgs_with_training_consent": orgs_with_training,
    }


def get_all_orgs_with_stats(db: Session) -> list[dict]:
    orgs = db.query(Organisation).all()
    result = []
    for org in orgs:
        name = decrypt_value(db, org.name_encrypted)
        limits = db.query(OrgLimit).filter(OrgLimit.org_id == org.id).first()
        user_count = db.query(User).filter(User.org_id == org.id).count()
        collection_count = db.query(Collection).filter(Collection.org_id == org.id, Collection.is_active == True).count()
        doc_count = db.execute(
            text("SELECT COALESCE(SUM(doc_count), 0) FROM collections WHERE org_id = :oid AND is_active = true"),
            {"oid": str(org.id)}
        ).scalar()
        result.append({
            "org_id": org.id,
            "org_name": name,
            "data_consent": org.data_consent,
            "allow_training": org.allow_training,
            "consent_updated_at": org.consent_updated_at,
            "created_at": org.created_at,
            "limits": limits,
            "user_count": user_count,
            "collection_count": collection_count,
            "doc_count": int(doc_count),
        })
    return result


def list_users_in_org(db: Session, org_id: UUID) -> list[dict]:
    users = db.query(User).filter(User.org_id == org_id).all()
    result = []
    for u in users:
        username = decrypt_value(db, u.username_encrypted)
        result.append({
            "user_id": u.id,
            "username": username,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at,
        })
    return result


# ── Conversations ─────────────────────────────────────────────────────────────

def create_conversation(
    db: Session,
    session_id: str,
    user_id: UUID,
    collection_id: UUID,
    is_graph: bool,
    doc_id: str | None = None,
) -> Conversation:
    conv = Conversation(
        session_id=session_id,
        user_id=user_id,
        collection_id=collection_id,
        is_graph=is_graph,
        doc_id=doc_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


def get_conversation(db: Session, conversation_id: UUID) -> Conversation | None:
    return db.query(Conversation).filter(Conversation.id == conversation_id).first()


def get_conversation_by_session(db: Session, session_id: str) -> Conversation | None:
    return (
        db.query(Conversation)
        .filter(Conversation.session_id == session_id)
        .order_by(Conversation.created_at.desc())
        .first()
    )


def list_conversations_with_title(db: Session, user_id: UUID) -> list[dict]:
    """Return all conversations for a user, sorted by most recently active.
    Title is derived from the first turn's raw_query (truncated to 60 chars).
    """
    convs = (
        db.query(Conversation)
        .filter(Conversation.user_id == user_id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    result = []
    for conv in convs:
        first_turn = (
            db.query(ConversationTurn)
            .filter(ConversationTurn.conversation_id == conv.id)
            .order_by(ConversationTurn.turn_index.asc())
            .first()
        )
        if conv.title:
            title = conv.title
        elif first_turn:
            title = (first_turn.raw_query[:57] + "...") if len(first_turn.raw_query) > 60 else first_turn.raw_query
        else:
            title = "New conversation"
        collection = db.query(Collection).filter(Collection.id == conv.collection_id).first()
        doc_name = None
        if conv.doc_id:
            doc_row = db.execute(
                text("SELECT filename FROM documents WHERE doc_id = :did"),
                {"did": conv.doc_id},
            ).fetchone()
            doc_name = doc_row.filename if doc_row else None
        result.append({
            "conversation_id": conv.id,
            "session_id":      conv.session_id,
            "title":           title,
            "collection_name": collection.name if collection else "",
            "doc_id":          str(conv.doc_id) if conv.doc_id else None,
            "doc_name":        doc_name,
            "is_graph":        conv.is_graph,
            "turn_count":      db.query(ConversationTurn).filter(
                                   ConversationTurn.conversation_id == conv.id
                               ).count(),
            "last_active":     conv.updated_at,
            "created_at":      conv.created_at,
        })
    return result


def count_turns(db: Session, conversation_id: UUID) -> int:
    return db.query(ConversationTurn).filter(
        ConversationTurn.conversation_id == conversation_id
    ).count()


def save_conversation_turn(
    db: Session,
    conversation_id: UUID,
    turn_index: int,
    raw_query: str,
    rewritten_query: str | None,
    final_answer: str | None,
    citations: list | None,
    verification_score: float | None,
    iterations_used: int | None,
    query_complexity: str = "simple",
    figure_paths: list | None = None,
) -> ConversationTurn:
    # Prune supporting info from the previous turn — keep only raw_query + final_answer.
    # The full details (citations, scores, iterations, figures) are only needed for the most recent turn.
    if turn_index > 0:
        db.execute(
            text("""
                UPDATE conversation_turns
                SET citations           = NULL,
                    rewritten_query     = NULL,
                    verification_score  = NULL,
                    iterations_used     = NULL,
                    figure_paths        = NULL
                WHERE conversation_id = CAST(:cid AS uuid)
                  AND turn_index = :prev_index
            """),
            {"cid": str(conversation_id), "prev_index": turn_index - 1},
        )
        # Drop the superseded turn's copied figure files so they don't pile up.
        figure_store.delete_turn_figures(conversation_id, turn_index - 1)

    turn = ConversationTurn(
        conversation_id=conversation_id,
        turn_index=turn_index,
        raw_query=raw_query,
        rewritten_query=rewritten_query,
        final_answer=final_answer,
        citations=citations,
        verification_score=verification_score,
        iterations_used=iterations_used,
        query_complexity=query_complexity,
        figure_paths=figure_paths,
    )
    db.add(turn)
    # Touch updated_at on the parent conversation so list sorts by most recently active
    db.execute(
        text("UPDATE conversations SET updated_at = NOW() WHERE id = CAST(:cid AS uuid)"),
        {"cid": str(conversation_id)},
    )
    db.commit()
    db.refresh(turn)
    return turn


def get_conversation_history_for_llm(
    db: Session,
    conversation_id: UUID,
    limit: int = 10,
) -> list[dict]:
    """Return the most recent `limit` turns oldest-first for LLM context injection.
    Used internally by the pipeline — not the paginated API endpoint.
    """
    turns = (
        db.query(ConversationTurn)
        .filter(ConversationTurn.conversation_id == conversation_id)
        .order_by(ConversationTurn.turn_index.desc())
        .limit(limit)
        .all()
    )
    # Reverse so they are oldest → newest for the LLM
    turns = list(reversed(turns))
    return [
        {"query": t.raw_query, "answer": t.final_answer or ""}
        for t in turns
    ]


def get_conversation_turns_page(
    db: Session,
    conversation_id: UUID,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """Paginated turn history, newest-first.

    Page 1 = most recent `page_size` turns.
    Page 2 = next older `page_size` turns.
    Frontend reverses each page before displaying so the user sees oldest→newest.
    """
    total = (
        db.query(ConversationTurn)
        .filter(ConversationTurn.conversation_id == conversation_id)
        .count()
    )
    offset = (page - 1) * page_size
    turns = (
        db.query(ConversationTurn)
        .filter(ConversationTurn.conversation_id == conversation_id)
        .order_by(ConversationTurn.turn_index.desc())   # newest first
        .offset(offset)
        .limit(page_size)
        .all()
    )
    # Reverse within the page so the batch is oldest→newest for display
    turns = list(reversed(turns))
    has_more = (offset + page_size) < total
    return {
        "total":    total,
        "page":     page,
        "page_size": page_size,
        "has_more": has_more,
        "turns": [
            {
                "turn_index":          t.turn_index,
                "raw_query":           t.raw_query,
                "rewritten_query":     t.rewritten_query,
                "final_answer":        t.final_answer,
                "citations":           _inline_figure_b64(t.citations),
                "verification_score":  t.verification_score,
                "iterations_used":     t.iterations_used,
                "created_at":          t.created_at.isoformat(),
            }
            for t in turns
        ],
    }


def _inline_figure_b64(citations: list | None) -> list | None:
    """Read each figure citation's copied image off disk and inline it as base64.

    The image bytes are never stored in the DB — only the relative figure_path is.
    They are re-read here so the frontend can render inline figures without a
    separate authenticated image request.
    """
    if not citations:
        return citations
    for cite in citations:
        if isinstance(cite, dict) and cite.get("figure_path"):
            b64 = figure_store.load_figure_b64(cite["figure_path"])
            if b64:
                cite["figure_b64"] = b64
    return citations


# ── Dashboard ─────────────────────────────────────────────────────────────────

def get_dashboard(db: Session, org_id: UUID) -> dict:
    """Aggregate stats for the dashboard — all queries scoped to org_id."""

    # ── Per-collection document stats ─────────────────────────────────────────
    coll_rows = db.execute(
        text("""
            SELECT
                c.id                                                    AS collection_id,
                c.name                                                  AS name,
                COUNT(d.doc_id)                                         AS doc_count,
                COUNT(d.doc_id) FILTER (WHERE d.status = 'COMPLETED')  AS ready_count,
                COUNT(d.doc_id) FILTER (
                    WHERE d.status NOT IN ('COMPLETED','FAILED'))        AS processing_count,
                COUNT(d.doc_id) FILTER (WHERE d.status = 'FAILED')      AS failed_count,
                COALESCE(SUM(
                    CASE WHEN d.status = 'COMPLETED'
                    THEN COALESCE((d.ingestion_report->>'chunk_count')::int, 0)
                    ELSE 0 END), 0)                                     AS chunk_count,
                COALESCE(SUM(
                    CASE WHEN d.status = 'COMPLETED'
                    THEN COALESCE((d.ingestion_report->>'total_pages')::int, 0)
                    ELSE 0 END), 0)                                     AS total_pages,
                COALESCE(SUM(
                    CASE WHEN d.status = 'COMPLETED'
                    THEN COALESCE((d.ingestion_report->'element_counts'->>'table')::int, 0)
                    ELSE 0 END), 0)                                     AS tables,
                COALESCE(SUM(
                    CASE WHEN d.status = 'COMPLETED'
                    THEN COALESCE((d.ingestion_report->'element_counts'->>'picture')::int, 0)
                    ELSE 0 END), 0)                                     AS figures,
                COALESCE(SUM(d.size_bytes), 0)                          AS size_bytes
            FROM collections c
            LEFT JOIN documents d ON d.collection_id = c.id
            WHERE c.org_id = CAST(:org_id AS uuid)
            GROUP BY c.id, c.name
            ORDER BY c.name
        """),
        {"org_id": str(org_id)},
    ).fetchall()

    collections = [dict(r._mapping) for r in coll_rows]
    total_storage = sum(c["size_bytes"] for c in collections)

    # ── Domain distribution ───────────────────────────────────────────────────
    domain_rows = db.execute(
        text("""
            SELECT ds.assigned_domain AS domain, COUNT(*) AS count
            FROM doc_summary ds
            JOIN documents d ON d.doc_id = ds.doc_id
            JOIN collections c ON c.id = d.collection_id
            WHERE c.org_id = CAST(:org_id AS uuid)
              AND ds.assigned_domain IS NOT NULL
            GROUP BY ds.assigned_domain
            ORDER BY count DESC
        """),
        {"org_id": str(org_id)},
    ).fetchall()

    domains = [{"domain": r.domain, "count": r.count} for r in domain_rows]

    # ── Knowledge-graph coverage ──────────────────────────────────────────────
    kg_row = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE ds.needs_graph = true) AS needs_graph,
                COUNT(*)                                       AS total_indexed
            FROM doc_summary ds
            JOIN documents d ON d.doc_id = ds.doc_id
            JOIN collections c ON c.id = d.collection_id
            WHERE c.org_id = CAST(:org_id AS uuid)
        """),
        {"org_id": str(org_id)},
    ).fetchone()

    kg_coverage = {
        "needs_graph":   int(kg_row.needs_graph   or 0),
        "total_indexed": int(kg_row.total_indexed or 0),
    }

    # ── Chat stats ────────────────────────────────────────────────────────────
    chat_row = db.execute(
        text("""
            SELECT
                COUNT(DISTINCT cv.id)                                              AS total_conversations,
                COUNT(ct.id)                                                       AS total_turns,
                AVG(ct.verification_score)                                         AS avg_score,
                AVG(CASE WHEN ct.verification_score IS NOT NULL
                         THEN (ct.verification_score >= 0.7)::int END)             AS pass_rate,
                COUNT(DISTINCT cv.id) FILTER (WHERE cv.is_graph = true)            AS graph_sessions,
                AVG(ct.iterations_used)                                            AS avg_iterations,
                COUNT(ct.id) FILTER (WHERE ct.query_complexity = 'simple')         AS simple_queries,
                COUNT(ct.id) FILTER (WHERE ct.query_complexity = 'complex')        AS complex_queries
            FROM conversations cv
            LEFT JOIN conversation_turns ct ON ct.conversation_id = cv.id
            WHERE cv.user_id IN (
                SELECT id FROM users WHERE org_id = CAST(:org_id AS uuid)
            )
        """),
        {"org_id": str(org_id)},
    ).fetchone()

    chat_stats = {
        "total_conversations": int(chat_row.total_conversations or 0),
        "total_turns":         int(chat_row.total_turns         or 0),
        "avg_score":           float(chat_row.avg_score)         if chat_row.avg_score         is not None else None,
        "pass_rate":           float(chat_row.pass_rate)         if chat_row.pass_rate         is not None else None,
        "graph_sessions":      int(chat_row.graph_sessions       or 0),
        "avg_iterations":      float(chat_row.avg_iterations)    if chat_row.avg_iterations    is not None else None,
        "simple_queries":      int(chat_row.simple_queries       or 0),
        "complex_queries":     int(chat_row.complex_queries      or 0),
    }

    return {
        "collections":        collections,
        "domains":            domains,
        "kg_coverage":        kg_coverage,
        "chat_stats":         chat_stats,
        "total_storage_bytes": total_storage,
    }


# ── Demo ──────────────────────────────────────────────────────────────────────

def ensure_demo_org_and_user(db: Session) -> None:
    """Idempotently create the fixed demo org + user at server startup."""
    import uuid as _uuid

    demo_org_uuid  = _uuid.UUID(DEMO_ORG_ID)
    demo_user_uuid = _uuid.UUID(DEMO_USER_ID)

    org = db.query(Organisation).filter(Organisation.id == demo_org_uuid).first()
    if org is None:
        org = Organisation(
            id=demo_org_uuid,
            name_encrypted=encrypt_value(db, "Demo Organisation"),
            data_consent=False,
            allow_training=False,
        )
        db.add(org)
        db.flush()
        db.add(OrgLimit(
            org_id=demo_org_uuid,
            max_users=9999,
            max_collections=9999,
            max_docs_per_collection=9999,
        ))

    user = db.query(User).filter(User.id == demo_user_uuid).first()
    if user is None:
        user = User(
            id=demo_user_uuid,
            org_id=demo_org_uuid,
            username_encrypted=encrypt_value(db, "demo_user"),
            username_hash=generate_username_hash("demo_user"),
            password=hash_password("demo_unused_password_xyz"),
            role="demo",
        )
        db.add(user)

    db.commit()


def create_demo_session(db: Session) -> dict:
    import uuid as _uuid

    session_id      = str(_uuid.uuid4())
    collection_name = f"demo_{session_id.replace('-', '')[:12]}"
    expires_at      = datetime.utcnow() + timedelta(hours=DEMO_TTL_HOURS)

    session = DemoSession(
        id=_uuid.UUID(session_id),
        collection_name=collection_name,
        expires_at=expires_at,
    )
    db.add(session)
    db.flush()

    # Create the real collection row under the demo org
    db.execute(
        text("""
            INSERT INTO collections (id, org_id, name, description, doc_count, is_active, created_by)
            VALUES (
                gen_random_uuid(),
                CAST(:org_id  AS uuid),
                :name,
                'Demo session collection',
                0, true,
                CAST(:user_id AS uuid)
            )
        """),
        {"org_id": DEMO_ORG_ID, "name": collection_name, "user_id": DEMO_USER_ID},
    )
    db.commit()

    return {
        "session_id":      session_id,
        "collection_name": collection_name,
        "expires_at":      expires_at,
    }


def get_demo_session(db: Session, session_id: str) -> dict | None:
    row = db.execute(
        text("""
            SELECT id, collection_name, doc_count, query_count, status, created_at, expires_at
            FROM demo_sessions
            WHERE id = CAST(:id AS uuid)
        """),
        {"id": session_id},
    ).fetchone()
    if row is None:
        return None
    return dict(row._mapping)


def get_demo_collection(db: Session, collection_name: str) -> Collection | None:
    import uuid as _uuid
    return (
        db.query(Collection)
        .filter(
            Collection.name == collection_name,
            Collection.org_id == _uuid.UUID(DEMO_ORG_ID),
        )
        .first()
    )


def increment_demo_doc_count(db: Session, session_id: str) -> int:
    """Atomically increment doc_count. Returns new count, or -1 if limit already reached."""
    row = db.execute(
        text("""
            UPDATE demo_sessions
            SET doc_count = doc_count + 1
            WHERE id = CAST(:id AS uuid)
              AND doc_count < :max
              AND status = 'active'
            RETURNING doc_count
        """),
        {"id": session_id, "max": DEMO_MAX_DOCS},
    ).fetchone()
    db.commit()
    return row.doc_count if row else -1


def increment_demo_query_count(db: Session, session_id: str) -> int:
    """Atomically increment query_count. Returns new count, or -1 if limit reached."""
    row = db.execute(
        text("""
            UPDATE demo_sessions
            SET query_count = query_count + 1
            WHERE id = CAST(:id AS uuid)
              AND query_count < :max
              AND status = 'active'
            RETURNING query_count
        """),
        {"id": session_id, "max": DEMO_MAX_QUERIES},
    ).fetchone()
    db.commit()
    return row.query_count if row else -1


def insert_demo_document(
    db: Session,
    doc_id: str,
    collection_id: UUID,
    filename: str,
    original_extension: str,
    output_dir: str,
    pdf_path: str,
    mime_type: str,
    size_bytes: int,
) -> dict:
    """Insert a demo document.

    sha256_hash is derived from doc_id so it satisfies the NOT NULL + UNIQUE
    constraint without risking collision with real uploaded files.
    """
    import hashlib
    pseudo_hash = hashlib.sha256(f"demo:{doc_id}".encode()).hexdigest()

    row = db.execute(
        text("""
            INSERT INTO documents (
                doc_id, user_id, collection_id, filename, original_extension,
                output_dir, pdf_path, sha256_hash, mime_type, size_bytes,
                tags, status, storage_mode
            ) VALUES (
                CAST(:doc_id AS uuid),
                CAST(:user_id AS uuid), CAST(:collection_id AS uuid),
                :filename, :original_extension,
                :output_dir, :pdf_path, :sha256_hash, :mime_type, :size_bytes,
                '{}', 'UPLOADED', 'both_DB'
            )
            RETURNING doc_id, created_at
        """),
        {
            "doc_id":             doc_id,
            "user_id":            DEMO_USER_ID,
            "collection_id":      str(collection_id),
            "filename":           filename,
            "original_extension": original_extension,
            "output_dir":         output_dir,
            "pdf_path":           pdf_path,
            "sha256_hash":        pseudo_hash,
            "mime_type":          mime_type,
            "size_bytes":         size_bytes,
        },
    ).fetchone()
    db.commit()
    return {"doc_id": str(row.doc_id), "created_at": row.created_at}


def get_demo_document_status(db: Session, doc_id: str, collection_name: str) -> dict | None:
    """Fetch document status scoped to a specific demo session collection."""
    row = db.execute(
        text("""
            SELECT d.doc_id, d.filename, d.status, d.error_message, d.retry_count,
                   d.ingestion_start, d.ingestion_end, d.created_at,
                   d.mime_type, d.size_bytes, d.ingestion_report
            FROM documents d
            JOIN collections c ON c.id = d.collection_id
            WHERE d.doc_id = CAST(:doc_id AS uuid)
              AND c.name = :collection_name
        """),
        {"doc_id": doc_id, "collection_name": collection_name},
    ).fetchone()
    if row is None:
        return None
    return dict(row._mapping)


def get_demo_session_doc_ids(db: Session, session_id: str) -> list[str]:
    rows = db.execute(
        text("""
            SELECT d.doc_id
            FROM documents d
            JOIN collections c ON c.id = d.collection_id
            JOIN demo_sessions s ON s.collection_name = c.name
            WHERE s.id = CAST(:session_id AS uuid)
        """),
        {"session_id": session_id},
    ).fetchall()
    return [str(r.doc_id) for r in rows]


def delete_demo_session_data(db: Session, session_id: str) -> list[str]:
    """Delete all Postgres rows for this session. Returns doc_ids for external cleanup."""
    doc_ids = get_demo_session_doc_ids(db, session_id)

    # Deleting the collections row cascades to documents (and document_pages, doc_summary)
    db.execute(
        text("""
            DELETE FROM collections c
            USING demo_sessions s
            WHERE s.collection_name = c.name
              AND s.id = CAST(:session_id AS uuid)
        """),
        {"session_id": session_id},
    )
    db.execute(
        text("DELETE FROM demo_sessions WHERE id = CAST(:id AS uuid)"),
        {"id": session_id},
    )
    db.commit()
    return doc_ids


def get_expired_demo_sessions(db: Session) -> list[dict]:
    rows = db.execute(
        text("""
            SELECT id, collection_name
            FROM demo_sessions
            WHERE expires_at < NOW()
              AND status != 'cleaned_up'
        """)
    ).fetchall()
    return [{"session_id": str(r.id), "collection_name": r.collection_name} for r in rows]


def mark_demo_session_cleaned_up(db: Session, session_id: str) -> None:
    db.execute(
        text("UPDATE demo_sessions SET status = 'cleaned_up' WHERE id = CAST(:id AS uuid)"),
        {"id": session_id},
    )
    db.commit()


# ── Management: Delete / Rename / Update ─────────────────────────────────────

def get_doc_output_dirs(db: Session, doc_ids: list[str]) -> list[str]:
    """Return output_dir paths for a list of doc_ids (for disk cleanup)."""
    if not doc_ids:
        return []
    rows = db.execute(
        text("SELECT output_dir FROM documents WHERE doc_id = ANY(CAST(:ids AS uuid[]))"),
        {"ids": doc_ids},
    ).fetchall()
    return [r.output_dir for r in rows if r.output_dir]


def get_collection_doc_ids(db: Session, collection_id: str) -> list[str]:
    rows = db.execute(
        text("SELECT doc_id::text FROM documents WHERE collection_id = CAST(:cid AS uuid)"),
        {"cid": collection_id},
    ).fetchall()
    return [r.doc_id for r in rows]


def delete_document_by_id(db: Session, doc_id: str, user_id: str | None, org_id: str) -> bool:
    """Delete a document. user_id=None means admin (skip ownership check, verify org instead)."""
    if user_id:
        row = db.execute(
            text("SELECT doc_id FROM documents WHERE doc_id = CAST(:d AS uuid) AND user_id = CAST(:u AS uuid)"),
            {"d": doc_id, "u": user_id},
        ).fetchone()
    else:
        row = db.execute(
            text("""
                SELECT d.doc_id FROM documents d
                JOIN collections c ON c.id = d.collection_id
                WHERE d.doc_id = CAST(:d AS uuid) AND c.org_id = CAST(:o AS uuid)
            """),
            {"d": doc_id, "o": org_id},
        ).fetchone()
    if not row:
        return False
    db.execute(
        text("UPDATE collections SET doc_count = GREATEST(doc_count - 1, 0) WHERE id = (SELECT collection_id FROM documents WHERE doc_id = CAST(:d AS uuid))"),
        {"d": doc_id},
    )
    db.execute(text("DELETE FROM documents WHERE doc_id = CAST(:d AS uuid)"), {"d": doc_id})
    db.commit()
    return True


def delete_collection_by_id(db: Session, collection_id: str, org_id: str) -> bool:
    row = db.execute(
        text("SELECT id FROM collections WHERE id = CAST(:cid AS uuid) AND org_id = CAST(:oid AS uuid)"),
        {"cid": collection_id, "oid": org_id},
    ).fetchone()
    if not row:
        return False
    db.execute(text("DELETE FROM collections WHERE id = CAST(:cid AS uuid)"), {"cid": collection_id})
    db.commit()
    return True


def rename_collection(db: Session, collection_id: str, org_id: str, new_name: str) -> bool:
    row = db.execute(
        text("SELECT id FROM collections WHERE id = CAST(:cid AS uuid) AND org_id = CAST(:oid AS uuid)"),
        {"cid": collection_id, "oid": org_id},
    ).fetchone()
    if not row:
        return False
    db.execute(
        text("UPDATE collections SET name = :name WHERE id = CAST(:cid AS uuid)"),
        {"name": new_name, "cid": collection_id},
    )
    db.commit()
    return True


def update_collection_description(db: Session, collection_id: str, org_id: str, description: str) -> bool:
    row = db.execute(
        text("SELECT id FROM collections WHERE id = CAST(:cid AS uuid) AND org_id = CAST(:oid AS uuid)"),
        {"cid": collection_id, "oid": org_id},
    ).fetchone()
    if not row:
        return False
    db.execute(
        text("UPDATE collections SET description = :desc WHERE id = CAST(:cid AS uuid)"),
        {"desc": description, "cid": collection_id},
    )
    db.commit()
    return True


def update_document_tags(db: Session, doc_id: str, user_id: str, tags: list[str]) -> bool:
    row = db.execute(
        text("SELECT doc_id FROM documents WHERE doc_id = CAST(:d AS uuid) AND user_id = CAST(:u AS uuid)"),
        {"d": doc_id, "u": user_id},
    ).fetchone()
    if not row:
        return False
    db.execute(
        text("UPDATE documents SET tags = :tags WHERE doc_id = CAST(:d AS uuid)"),
        {"tags": tags, "d": doc_id},
    )
    db.commit()
    return True


def get_conversation_for_user(db: Session, session_id: str, user_id: str) -> dict | None:
    row = db.execute(
        text("SELECT id, session_id FROM conversations WHERE session_id = :sid AND user_id = CAST(:uid AS uuid)"),
        {"sid": session_id, "uid": user_id},
    ).fetchone()
    return dict(row._mapping) if row else None


def delete_conversation(db: Session, session_id: str, user_id: str) -> bool:
    row = get_conversation_for_user(db, session_id, user_id)
    if not row:
        return False
    db.execute(text("DELETE FROM conversations WHERE session_id = :sid"), {"sid": session_id})
    db.commit()
    figure_store.delete_conversation_figures(row["id"])
    return True


def delete_all_conversations(db: Session, user_id: str) -> int:
    conv_ids = [
        r.id for r in db.execute(
            text("SELECT id FROM conversations WHERE user_id = CAST(:uid AS uuid)"),
            {"uid": user_id},
        ).fetchall()
    ]
    result = db.execute(
        text("DELETE FROM conversations WHERE user_id = CAST(:uid AS uuid)"),
        {"uid": user_id},
    )
    db.commit()
    for cid in conv_ids:
        figure_store.delete_conversation_figures(cid)
    return result.rowcount


def rename_conversation(db: Session, session_id: str, user_id: str, title: str) -> bool:
    row = get_conversation_for_user(db, session_id, user_id)
    if not row:
        return False
    db.execute(
        text("UPDATE conversations SET title = :title WHERE session_id = :sid"),
        {"title": title, "sid": session_id},
    )
    db.commit()
    return True


def hard_delete_user(db: Session, username: str, org_id: str) -> bool:
    from app.encryption import generate_username_hash
    username_hash = generate_username_hash(username)
    row = db.execute(
        text("SELECT id FROM users WHERE username_hash = :h AND org_id = CAST(:oid AS uuid)"),
        {"h": username_hash, "oid": org_id},
    ).fetchone()
    if not row:
        return False
    db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": row.id})
    db.commit()
    return True
