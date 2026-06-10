"""
GET /api/user/dashboard  — org-scoped analytics for all authenticated users.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app import crud

router = APIRouter(tags=["dashboard"])


# ── Response schemas ──────────────────────────────────────────────────────────

class CollectionStat(BaseModel):
    collection_id:    str
    name:             str
    doc_count:        int
    ready_count:      int
    processing_count: int
    failed_count:     int
    chunk_count:      int
    total_pages:      int
    tables:           int
    figures:          int
    size_bytes:       int


class DomainStat(BaseModel):
    domain: str
    count:  int


class KGCoverage(BaseModel):
    needs_graph:   int
    total_indexed: int


class ChatStats(BaseModel):
    total_conversations: int
    total_turns:         int
    avg_score:           Optional[float]
    pass_rate:           Optional[float]
    graph_sessions:      int
    avg_iterations:      Optional[float]
    simple_queries:      int
    complex_queries:     int


class DashboardResponse(BaseModel):
    collections:          List[CollectionStat]
    domains:              List[DomainStat]
    kg_coverage:          KGCoverage
    chat_stats:           ChatStats
    total_storage_bytes:  int


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get(
    "/api/user/dashboard",
    response_model=DashboardResponse,
    summary="Org-scoped analytics dashboard",
)
def get_dashboard(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    data = crud.get_dashboard(db, current_user.org_id)

    return DashboardResponse(
        collections=[
            CollectionStat(
                collection_id=str(c["collection_id"]),
                name=c["name"],
                doc_count=c["doc_count"],
                ready_count=c["ready_count"],
                processing_count=c["processing_count"],
                failed_count=c["failed_count"],
                chunk_count=c["chunk_count"],
                total_pages=c["total_pages"],
                tables=c["tables"],
                figures=c["figures"],
                size_bytes=c["size_bytes"],
            )
            for c in data["collections"]
        ],
        domains=[DomainStat(**d) for d in data["domains"]],
        kg_coverage=KGCoverage(**data["kg_coverage"]),
        chat_stats=ChatStats(**data["chat_stats"]),
        total_storage_bytes=data["total_storage_bytes"],
    )
