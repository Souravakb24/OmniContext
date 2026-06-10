from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class StorageMode(str, Enum):
    vector_db = "Vector_DB"
    graph_db  = "Graph_DB"
    both_db   = "both_DB"
    no_db     = "no_DB"


class CollectionItem(BaseModel):
    collection_id: str
    name: str


class UploadResponse(BaseModel):
    doc_id: UUID
    filename: str
    status: str = "QUEUED"
    created_at: Optional[datetime] = None
    size_bytes: int
    mime_type: str
    original_extension: str
    output_dir: str
    pdf_path: str
    collection_id: str
    collection_name: str
    tags: List[str]
    user_id: str
    uploads_used_today: int
    uploads_remaining_today: int
    storage_mode: str


class MultiUploadResponse(BaseModel):
    uploaded: List[UploadResponse]
    failed: List[dict]
    uploads_used_today: int
    uploads_remaining_today: int


class UploadErrorResponse(BaseModel):
    error: str
    reason: str


class ValidationErrorResponse(BaseModel):
    error: str = "VALIDATION_FAILED"
    reason: str
    stage: str


class ValidatedFile(BaseModel):
    filename: str
    extension: str
    mime_type: str
    size_bytes: int
    sha256_hash: str
    content: bytes
    needs_conversion: bool

    model_config = {"arbitrary_types_allowed": True}


class StoredFile(BaseModel):
    doc_id: str
    output_dir: str
    original_path: str
    pdf_path: str
