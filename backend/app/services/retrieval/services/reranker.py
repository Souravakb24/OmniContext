"""
BGE CrossEncoder reranker — singleton loaded once at server startup via init_reranker().
All retrieval agent calls use rerank() which is synchronous (CrossEncoder.predict is sync).
"""
from __future__ import annotations

import time as _time

from loguru import logger

from app.services.retrieval.config import RERANKER_MODEL, RERANKER_DEVICE, RERANK_TOP_K
from app.core.telemetry import emit_event

_reranker = None


def init_reranker() -> None:
    global _reranker
    if _reranker is not None:
        return
    from sentence_transformers import CrossEncoder
    logger.info("Reranker: loading {} on {}", RERANKER_MODEL, RERANKER_DEVICE)
    _reranker = CrossEncoder(RERANKER_MODEL, device=RERANKER_DEVICE)
    logger.info("Reranker: ready")


def rerank(query: str, chunks: list[dict], top_k: int = RERANK_TOP_K,
           query_id: str = "") -> list[dict]:
    """Score (query, chunk_text) pairs and return top_k sorted by rerank score."""
    if not chunks:
        return []
    if _reranker is None:
        raise RuntimeError("Reranker not initialized — call init_reranker() at startup")

    _t0 = _time.perf_counter()
    pairs = [(query, c["text"]) for c in chunks]
    scores = _reranker.predict(pairs)

    for chunk, score in zip(chunks, scores):
        chunk["rerank_score"] = float(score)

    ranked = sorted(chunks, key=lambda x: x["rerank_score"], reverse=True)[:top_k]
    _dur = int((_time.perf_counter() - _t0) * 1000)
    top_score = ranked[0]["rerank_score"] if ranked else 0.0
    scored_chunks = [
        {
            "id":            c["id"],
            "document_name": c.get("document_name", ""),
            "chunk_index":   c.get("chunk_index", -1),
            "chunk_type":    c.get("chunk_type", "text"),
            "page_numbers":  c.get("page_numbers", ""),
            "text_snippet":  c["text"][:150],
            "rerank_score":  round(c["rerank_score"], 4),
            "source":        c.get("retrieval_source", ""),
        }
        for c in ranked
    ]
    emit_event("reranker_result", status="success",
               query_id=query_id, duration_ms=_dur,
               input_count=len(chunks), output_count=len(ranked),
               top_score=round(top_score, 4), scored_chunks=scored_chunks)
    return ranked
