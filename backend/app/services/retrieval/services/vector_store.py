"""
ChromaDB vector search for retrieval pipeline.
Uses the same BAAI/bge-large-en-v1.5 embedding model as the ingestion indexer.
Collection naming: {collection_name}_vector  (matches indexer.py convention).
"""
from __future__ import annotations

import asyncio
from functools import lru_cache

from loguru import logger

from app.services.retrieval.config import CHROMA_DB_PATH, RETRIEVAL_TOP_K
from app.services.retrieval.services.embedder import get_embed_model
from app.services.chroma_naming import to_chroma_name
from app.core.telemetry import emit_event


def _sync_query(
    queries: list[str],
    collection_name: str,
    top_k: int,
    doc_id: str | None = None,
    query_id: str = "",
) -> list[dict]:
    """Run ChromaDB queries synchronously (called in thread executor)."""
    import chromadb

    chroma_collection_name = to_chroma_name(collection_name, "vector")
    client     = chromadb.PersistentClient(path=CHROMA_DB_PATH)

    try:
        collection = client.get_collection(chroma_collection_name)
    except Exception:
        logger.warning("VectorStore: collection '{}' not found", chroma_collection_name)
        return []

    # Scope retrieval to a single document when requested (single-doc chat).
    where = {"doc_id": str(doc_id)} if doc_id else None

    model      = get_embed_model()
    seen_ids   = set()
    all_chunks = []

    for query in queries:
        embedding = model.encode(query, normalize_embeddings=True).tolist()
        n_results = min(top_k, collection.count())
        if n_results == 0:
            continue

        results = collection.query(
            query_embeddings=[embedding],
            n_results=n_results,
            where=where,
            include=["documents", "metadatas", "distances"],
        )

        for chunk_id, doc, meta, dist in zip(
            results["ids"][0],
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            if chunk_id in seen_ids:
                continue
            seen_ids.add(chunk_id)
            all_chunks.append({
                "id":            chunk_id,
                "text":          doc,
                "doc_id":        meta.get("doc_id", ""),
                "document_name": meta.get("document_name", ""),
                "chunk_index":   meta.get("chunk_index", -1),
                "chunk_type":    meta.get("chunk_type", "text"),
                "headings":      meta.get("headings", ""),
                "page_numbers":  meta.get("page_numbers", ""),
                "provenance":    meta.get("provenance", "[]"),
                "vector_score":  1.0 - float(dist),
                "query":         query,
            })

    # Resolve doc_id → filename via a single batch DB query
    from app.database import engine as _engine
    from sqlalchemy import text as _text
    doc_ids = list({c["doc_id"] for c in all_chunks if c.get("doc_id")})
    filename_map: dict[str, str] = {}
    if doc_ids:
        with _engine.connect() as _conn:
            rows = _conn.execute(
                _text("SELECT doc_id::text, filename FROM documents WHERE doc_id::text = ANY(:ids)"),
                {"ids": doc_ids},
            ).fetchall()
            filename_map = {r[0]: r[1] for r in rows}

    for c in all_chunks:
        c["document_name"] = filename_map.get(str(c.get("doc_id", "")), c.get("document_name", ""))

    chunk_previews = [
        {
            "id":            c["id"],
            "document_name": c.get("document_name", ""),
            "chunk_index":   c.get("chunk_index", -1),
            "chunk_type":    c.get("chunk_type", "text"),
            "text_snippet":  c["text"][:150],
            "score":         round(c.get("vector_score", 0.0), 4),
            "page_numbers":  c.get("page_numbers", ""),
        }
        for c in all_chunks[:10]
    ]
    emit_event("store_result", stage="vector", status="success",
               query_id=query_id, hit_count=len(all_chunks),
               was_empty=len(all_chunks) == 0, chunks=chunk_previews)
    return all_chunks


async def query_vector_store(
    queries: list[str],
    collection_name: str,
    top_k: int = RETRIEVAL_TOP_K,
    doc_id: str | None = None,
    query_id: str = "",
) -> list[dict]:
    """Async wrapper — runs blocking ChromaDB I/O in a thread executor."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _sync_query, queries, collection_name, top_k, doc_id, query_id
    )
