"""
Management endpoints — delete, rename, update across all entities.

Documents  (user = own docs · admin = any doc in org):
  DELETE /api/user/document/{doc_id}               — delete single doc
  DELETE /api/user/documents                        — bulk delete (list of doc_ids)
  PATCH  /api/user/document/{doc_id}/tags           — update tags

Collections (admin only):
  DELETE /api/org/collection/{collection_id}        — delete collection + all its docs
  PATCH  /api/org/collection/{collection_id}/rename — rename display name
  PATCH  /api/org/collection/{collection_id}/description — update description

Conversations (user = own):
  DELETE /api/v1/retrieval/conversations/{session_id}  — delete single chat
  DELETE /api/v1/retrieval/conversations               — delete ALL user's chats
  PATCH  /api/v1/retrieval/conversations/{session_id}/rename — rename title

Users (admin only):
  DELETE /api/org/user/{username}                   — hard delete user + all their data
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import User
from app.services.storage import delete_doc_dir

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _chroma_delete_doc(chroma_collection_name: str, doc_id: str) -> None:
    """Remove all chunks for doc_id from ChromaDB. Silently no-ops if not found."""
    try:
        import chromadb
        from app.services.ingestion.config import CHROMA_DB_PATH
        client = chromadb.PersistentClient(path=str(CHROMA_DB_PATH))
        col = client.get_collection(chroma_collection_name)
        results = col.get(where={"doc_id": doc_id})
        if results and results.get("ids"):
            col.delete(ids=results["ids"])
    except Exception:
        pass


def _chroma_delete_collection(chroma_collection_name: str) -> None:
    """Drop a ChromaDB collection entirely. Silently no-ops if not found."""
    try:
        import chromadb
        from app.services.ingestion.config import CHROMA_DB_PATH
        client = chromadb.PersistentClient(path=str(CHROMA_DB_PATH))
        client.delete_collection(chroma_collection_name)
    except Exception:
        pass


def _get_chroma_name(db: Session, collection_id: str) -> str | None:
    from sqlalchemy import text
    row = db.execute(
        text("SELECT chroma_collection_name FROM collections WHERE id = CAST(:cid AS uuid)"),
        {"cid": collection_id},
    ).fetchone()
    return row.chroma_collection_name if row else None


def _get_doc_chroma_name(db: Session, doc_id: str) -> str | None:
    from sqlalchemy import text
    row = db.execute(
        text("""
            SELECT c.chroma_collection_name
            FROM documents d JOIN collections c ON c.id = d.collection_id
            WHERE d.doc_id = CAST(:did AS uuid)
        """),
        {"did": doc_id},
    ).fetchone()
    return row.chroma_collection_name if row else None


# ── Document endpoints ────────────────────────────────────────────────────────

@router.delete("/api/user/document/{doc_id}", status_code=200)
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chroma_name = _get_doc_chroma_name(db, doc_id)
    output_dirs = crud.get_doc_output_dirs(db, [doc_id])

    deleted = crud.delete_document_by_id(db, doc_id, str(user.id), str(user.org_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found or not yours")

    if chroma_name:
        _chroma_delete_doc(chroma_name, doc_id)
    for d in output_dirs:
        try:
            shutil.rmtree(d, ignore_errors=True)
        except Exception:
            pass

    return {"doc_id": doc_id, "message": "Document deleted"}


class BulkDeleteRequest(BaseModel):
    doc_ids: List[str]


@router.delete("/api/user/documents", status_code=200)
def bulk_delete_documents(
    body: BulkDeleteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    deleted, skipped = [], []
    for doc_id in body.doc_ids:
        chroma_name = _get_doc_chroma_name(db, doc_id)
        output_dirs = crud.get_doc_output_dirs(db, [doc_id])
        ok = crud.delete_document_by_id(db, doc_id, str(user.id), str(user.org_id))
        if ok:
            if chroma_name:
                _chroma_delete_doc(chroma_name, doc_id)
            for d in output_dirs:
                shutil.rmtree(d, ignore_errors=True)
            deleted.append(doc_id)
        else:
            skipped.append(doc_id)
    return {"deleted": deleted, "skipped": skipped}


class UpdateTagsRequest(BaseModel):
    tags: List[str]


@router.patch("/api/user/document/{doc_id}/tags", status_code=200)
def update_document_tags(
    doc_id: str,
    body: UpdateTagsRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = crud.update_document_tags(db, doc_id, str(user.id), body.tags)
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found or not yours")
    return {"doc_id": doc_id, "tags": body.tags}


# ── Collection endpoints ──────────────────────────────────────────────────────

@router.delete("/api/org/collection/{collection_id}", status_code=200)
def delete_collection(
    collection_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    chroma_name   = _get_chroma_name(db, collection_id)
    doc_ids       = crud.get_collection_doc_ids(db, collection_id)
    output_dirs   = crud.get_doc_output_dirs(db, doc_ids)

    deleted = crud.delete_collection_by_id(db, collection_id, str(user.org_id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Collection not found")

    if chroma_name:
        _chroma_delete_collection(chroma_name)
    for d in output_dirs:
        shutil.rmtree(d, ignore_errors=True)

    return {"collection_id": collection_id, "docs_deleted": len(doc_ids), "message": "Collection deleted"}


class RenameRequest(BaseModel):
    name: str


@router.patch("/api/org/collection/{collection_id}/rename", status_code=200)
def rename_collection(
    collection_id: str,
    body: RenameRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    existing = crud.get_collection_by_name(db, user.org_id, body.name)
    if existing and str(existing.id) != collection_id:
        raise HTTPException(status_code=409, detail="Collection name already exists in this organisation")

    ok = crud.rename_collection(db, collection_id, str(user.org_id), body.name)
    if not ok:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"collection_id": collection_id, "name": body.name}


class UpdateDescriptionRequest(BaseModel):
    description: str


@router.patch("/api/org/collection/{collection_id}/description", status_code=200)
def update_collection_description(
    collection_id: str,
    body: UpdateDescriptionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    ok = crud.update_collection_description(db, collection_id, str(user.org_id), body.description)
    if not ok:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"collection_id": collection_id, "description": body.description}


# ── Conversation endpoints ────────────────────────────────────────────────────

@router.delete("/api/v1/retrieval/conversations/{session_id}", status_code=200)
def delete_conversation(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = crud.delete_conversation(db, session_id, str(user.id))
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found or not yours")
    return {"session_id": session_id, "message": "Conversation deleted"}


@router.delete("/api/v1/retrieval/conversations", status_code=200)
def delete_all_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = crud.delete_all_conversations(db, str(user.id))
    return {"deleted_count": count, "message": "All conversations deleted"}


class RenameConversationRequest(BaseModel):
    title: str


@router.patch("/api/v1/retrieval/conversations/{session_id}/rename", status_code=200)
def rename_conversation(
    session_id: str,
    body: RenameConversationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ok = crud.rename_conversation(db, session_id, str(user.id), body.title)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found or not yours")
    return {"session_id": session_id, "title": body.title}


# ── User endpoints ────────────────────────────────────────────────────────────

@router.delete("/api/org/user/{username}", status_code=200)
def hard_delete_user(
    username: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    from app.encryption import decrypt_value
    if decrypt_value(admin.username_encrypted) == username:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    # Collect output_dirs before deletion (cascade will wipe docs)
    from sqlalchemy import text
    from app.encryption import generate_username_hash
    username_hash = generate_username_hash(username)
    user_row = db.execute(
        text("SELECT id FROM users WHERE username_hash = :h AND org_id = CAST(:oid AS uuid)"),
        {"h": username_hash, "oid": str(admin.org_id)},
    ).fetchone()
    if not user_row:
        raise HTTPException(status_code=404, detail="User not found in your organisation")

    doc_rows = db.execute(
        text("SELECT doc_id::text, output_dir, collection_id::text FROM documents WHERE user_id = :uid"),
        {"uid": user_row.id},
    ).fetchall()

    chroma_cleanups = []
    for row in doc_rows:
        chroma_name = _get_doc_chroma_name(db, row.doc_id)
        if chroma_name:
            chroma_cleanups.append((chroma_name, row.doc_id))

    ok = crud.hard_delete_user(db, username, str(admin.org_id))
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")

    for chroma_name, doc_id in chroma_cleanups:
        _chroma_delete_doc(chroma_name, doc_id)
    for row in doc_rows:
        if row.output_dir:
            shutil.rmtree(row.output_dir, ignore_errors=True)

    return {"username": username, "docs_deleted": len(doc_rows), "message": "User and all their data deleted"}
