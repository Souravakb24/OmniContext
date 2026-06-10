"""
PostgreSQL FTS-based BM25 retrieval.
Queries document_chunks using ts_rank_cd against the tsvector GIN index.
Collection resolved by name via JOIN with collections table.

Query preprocessing:
  Long planned queries sent by the query planner contain many content words.
  plainto_tsquery uses AND logic — all terms must appear in one chunk — so
  long queries almost always return 0 results.
  Instead we tokenize in Python, strip English stopwords, then build an OR
  tsquery (term1 | term2 | ...) so any chunk matching ANY content word ranks.
"""
from __future__ import annotations

import asyncio
import json
import re

import time as _time

from loguru import logger
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from sqlalchemy import text

from app.database import engine
from app.services.retrieval.config import RETRIEVAL_TOP_K
from app.core.telemetry import emit_event

STOPWORDS = set(ENGLISH_STOP_WORDS)


def _build_or_tsquery(query: str) -> str | None:
    """
    Tokenize query, remove stopwords, return an OR tsquery string.
    Returns None if no content tokens remain.
    """
    tokens = re.findall(r"[a-zA-Z0-9]+", query.lower())
    content = [t for t in tokens if t not in STOPWORDS and len(t) > 2]
    if not content:
        return None
    return " | ".join(content)


def _sync_query(
    queries: list[str],
    collection_name: str,
    top_k: int,
    doc_id: str | None = None,
    query_id: str = "",
) -> list[dict]:
    """Run PostgreSQL FTS queries synchronously (called in thread executor)."""
    seen_ids   = set()
    all_chunks = []

    doc_filter = "AND dc.doc_id = CAST(:doc_id AS uuid)" if doc_id else ""

    with engine.connect() as conn:
        for query in queries:
            tsquery = _build_or_tsquery(query)
            if not tsquery:
                logger.debug("BM25Store: query has no content tokens after stopword removal — skipping")
                continue

            rows = conn.execute(
                text(f"""
                    SELECT
                        dc.chunk_id,
                        dc.doc_id::text,
                        dc.chunk_index,
                        dc.chunk_type,
                        dc.text,
                        dc.headings,
                        dc.page_numbers,
                        dc.provenance,
                        dc.caption,
                        dc.image_ref,
                        d.filename,
                        ts_rank_cd(dc.search_vec, to_tsquery('english', :tsquery)) AS bm25_score
                    FROM document_chunks dc
                    JOIN collections c ON c.id = dc.collection_id
                    JOIN documents d   ON d.doc_id = dc.doc_id
                    WHERE
                        c.name = :collection
                        {doc_filter}
                        AND dc.search_vec @@ to_tsquery('english', :tsquery)
                    ORDER BY bm25_score DESC
                    LIMIT :top_k
                """),
                {"tsquery": tsquery, "collection": collection_name, "top_k": top_k, "doc_id": doc_id},
            ).fetchall()

            for row in rows:
                if row.chunk_id in seen_ids:
                    continue
                seen_ids.add(row.chunk_id)

                page_numbers = row.page_numbers or []
                provenance   = row.provenance if isinstance(row.provenance, list) else (
                    json.loads(row.provenance) if row.provenance else []
                )

                all_chunks.append({
                    "id":            row.chunk_id,
                    "text":          row.text,
                    "doc_id":        row.doc_id,
                    "document_name": row.filename or "",
                    "chunk_index":   row.chunk_index,
                    "chunk_type":    row.chunk_type,
                    "headings":      row.headings or "",
                    "page_numbers":  ",".join(str(p) for p in page_numbers),
                    "provenance":    json.dumps(provenance),
                    "caption":       row.caption or "",
                    "image_ref":     row.image_ref or "",
                    "bm25_score":    float(row.bm25_score),
                    "query":         query,
                })

    logger.debug("BM25Store: {} chunks for collection='{}' queries={}", len(all_chunks), collection_name, queries)
    chunk_previews = [
        {
            "id":            c["id"],
            "document_name": c.get("document_name", ""),
            "chunk_index":   c.get("chunk_index", -1),
            "chunk_type":    c.get("chunk_type", "text"),
            "text_snippet":  c["text"][:150],
            "score":         round(c.get("bm25_score", 0.0), 4),
            "page_numbers":  c.get("page_numbers", ""),
        }
        for c in all_chunks[:10]
    ]
    emit_event("store_result", stage="bm25", status="success",
               query_id=query_id, hit_count=len(all_chunks),
               was_empty=len(all_chunks) == 0, chunks=chunk_previews)
    return all_chunks


async def query_bm25_store(
    queries: list[str],
    collection_name: str,
    top_k: int = RETRIEVAL_TOP_K,
    doc_id: str | None = None,
    query_id: str = "",
) -> list[dict]:
    """Async wrapper — runs blocking PostgreSQL I/O in a thread executor."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _sync_query, queries, collection_name, top_k, doc_id, query_id
    )
