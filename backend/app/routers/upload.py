"""
POST /api/user/upload         — upload a document into a collection
GET  /api/org/upload/collections — list collections for the dropdown
POST /api/user/change-password — change own password

Auth: Bearer JWT via get_current_user (same dependency as all other endpoints).
No HTTP self-call needed — everything runs in the same app on port 8000.
"""
from __future__ import annotations

import time
import uuid
from typing import List, Optional

from app import crud
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from loguru import logger
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app import schemas
from app.upload_schemas import (
    CollectionItem,
    MultiUploadResponse,
    StorageMode,
    UploadErrorResponse,
    UploadResponse,
    ValidationErrorResponse,
)
from app.services.storage import StorageError, delete_doc_dir, store_uploaded_file
from app.services.validator import ValidationError, validate_upload

router = APIRouter(tags=["upload"])

DAILY_UPLOAD_LIMIT = 200


@router.get(
    "/api/org/upload/collections",
    response_model=list[CollectionItem],
    summary="List collections for upload dropdown",
)
def list_upload_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collections = crud.list_collections(db, current_user.org_id)
    return [CollectionItem(collection_id=str(c.id), name=c.name) for c in collections]


@router.post(
    "/api/user/upload",
    response_model=MultiUploadResponse,
    responses={
        400: {"model": ValidationErrorResponse},
        401: {"model": UploadErrorResponse},
        404: {"model": UploadErrorResponse},
        429: {"model": UploadErrorResponse},
        500: {"model": UploadErrorResponse},
    },
    summary="Upload one or more documents to a collection",
)
async def upload_document(
    request: Request,
    files: Optional[List[UploadFile]] = File(default=None, description="Multiple document files"),
    file: Optional[UploadFile] = File(default=None, description="Single document file (legacy)"),
    collection_name: str = Form(..., description="Collection name — select from GET /api/org/upload/collections"),
    tags: List[str] = Form(default=[], description="Optional metadata labels"),
    is_db: StorageMode = Form(default=StorageMode.vector_db, description="Storage target: Vector_DB | Graph_DB | both_DB | no_DB"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Accept both `files` (multi) and legacy `file` (single)
    all_files: List[UploadFile] = (files or []) + ([file] if file else [])
    if not all_files:
        raise HTTPException(status_code=422, detail={"error": "NO_FILES", "reason": "At least one file is required"})

    trace_id = str(uuid.uuid4())
    start_ts = time.monotonic()

    log = logger.bind(trace_id=trace_id, user_id=str(current_user.id))
    log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    log.info("  UPLOAD REQUEST  |  user={}  collection={}  files={}", current_user.id, collection_name, len(all_files))
    log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    # ------------------------------------------------------------------
    # Guards that apply to the whole batch
    # ------------------------------------------------------------------
    uploads_today = crud.get_daily_file_usage(db, current_user.id)
    if uploads_today >= DAILY_UPLOAD_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={"error": "UPLOAD_LIMIT_REACHED", "reason": f"Daily upload limit of {DAILY_UPLOAD_LIMIT} files reached"},
        )

    collection = crud.get_collection_by_name(db, current_user.org_id, collection_name)
    if not collection or not collection.is_active:
        raise HTTPException(
            status_code=404,
            detail={"error": "COLLECTION_NOT_FOUND", "reason": f"Collection '{collection_name}' not found in your organisation"},
        )

    limits    = crud.get_org_limits(db, current_user.org_id)
    succeeded: list[UploadResponse] = []
    failed:    list[dict]           = []

    for file in all_files:
        doc_id: Optional[str] = None
        file_log = log.bind(filename=file.filename)

        # stop if daily limit reached mid-batch
        if uploads_today + len(succeeded) >= DAILY_UPLOAD_LIMIT:
            failed.append({"filename": file.filename, "error": "UPLOAD_LIMIT_REACHED",
                           "reason": "Daily upload limit reached"})
            continue

        try:
            data = await file.read()

            async def check_hash(sha256: str):
                import asyncio
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, lambda: crud.get_document_by_hash(db, sha256))

            validated, existing_doc = await validate_upload(
                filename=file.filename,
                data=data,
                check_hash_fn=check_hash,
                log=file_log,
                content_length=len(data),
            )

            is_reupload = existing_doc is not None
            doc_id      = existing_doc["doc_id"] if is_reupload else str(uuid.uuid4())
            stored      = store_uploaded_file(doc_id, validated)

            if is_reupload:
                crud.update_document_paths(db, doc_id, stored.output_dir, stored.pdf_path)
                row_data = db.execute(
                    text("SELECT doc_id, created_at FROM documents WHERE doc_id = CAST(:id AS uuid)"),
                    {"id": doc_id},
                ).fetchone()
                row = {"doc_id": str(row_data.doc_id), "created_at": row_data.created_at}
            else:
                row = crud.insert_document(
                    db,
                    user_id=current_user.id,
                    collection_id=collection.id,
                    filename=file.filename,
                    original_extension=validated.extension.lstrip("."),
                    output_dir=stored.output_dir,
                    pdf_path=stored.pdf_path,
                    sha256_hash=validated.sha256_hash,
                    mime_type=validated.mime_type,
                    size_bytes=validated.size_bytes,
                    tags=tags,
                    storage_mode=is_db.value,
                )

            if not crud.try_increment_doc_count(db, collection.id, limits.max_docs_per_collection):
                delete_doc_dir(doc_id)
                if not is_reupload:
                    db.execute(text("DELETE FROM documents WHERE doc_id = CAST(:id AS uuid)"), {"id": row["doc_id"]})
                    db.commit()
                failed.append({"filename": file.filename, "error": "DOC_LIMIT_REACHED",
                               "reason": f"Collection document limit of {limits.max_docs_per_collection} reached"})
                continue

            crud.increment_file_usage(db, current_user.id, current_user.org_id)
            file_log.info("  QUEUED  |  doc_id={}", row["doc_id"])

            succeeded.append(UploadResponse(
                doc_id=row["doc_id"],
                filename=file.filename,
                status="QUEUED",
                created_at=row["created_at"],
                size_bytes=validated.size_bytes,
                mime_type=validated.mime_type,
                original_extension=validated.extension.lstrip("."),
                output_dir=stored.output_dir,
                pdf_path=stored.pdf_path,
                collection_id=str(collection.id),
                collection_name=collection_name,
                tags=tags,
                user_id=str(current_user.id),
                uploads_used_today=uploads_today + len(succeeded),
                uploads_remaining_today=max(0, DAILY_UPLOAD_LIMIT - uploads_today - len(succeeded)),
                storage_mode=is_db.value,
            ))

        except ValidationError as exc:
            if doc_id:
                delete_doc_dir(doc_id)
            file_log.warning("  FAILED — stage: {}  reason: {}", exc.stage, exc.reason)
            failed.append({"filename": file.filename, "error": "VALIDATION_FAILED",
                           "reason": exc.reason, "stage": exc.stage})

        except StorageError as exc:
            if doc_id:
                delete_doc_dir(doc_id)
            file_log.error("  FAILED — STORAGE_ERROR: {}", exc)
            failed.append({"filename": file.filename, "error": "STORAGE_ERROR", "reason": str(exc)})

        except Exception as exc:
            if doc_id:
                delete_doc_dir(doc_id)
            file_log.exception("  FAILED — INTERNAL_ERROR: {}", exc)
            failed.append({"filename": file.filename, "error": "INTERNAL_ERROR",
                           "reason": "An unexpected error occurred"})

    uploads_used = uploads_today + len(succeeded)
    latency_ms   = int((time.monotonic() - start_ts) * 1000)
    log.info("  BATCH DONE  |  ok={}  failed={}  latency={}ms", len(succeeded), len(failed), latency_ms)
    log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    return MultiUploadResponse(
        uploaded=succeeded,
        failed=failed,
        uploads_used_today=uploads_used,
        uploads_remaining_today=max(0, DAILY_UPLOAD_LIMIT - uploads_used),
    )


@router.post("/api/user/change-password", response_model=schemas.MessageResponse)
def change_password(
    body: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.auth import verify_password
    if not verify_password(body.old_password, current_user.password):
        raise HTTPException(status_code=401, detail="Old password is incorrect")
    crud.update_user_password(db, current_user, body.new_password)
    crud.delete_all_sessions_for_user(db, current_user.id)
    return schemas.MessageResponse(message="Password changed successfully. Please log in again.")
