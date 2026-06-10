"""
Shared embedding model singleton for the retrieval pipeline.
Both vector_store.py and graph_store.py import from here so the model
is loaded once and reused — not duplicated in GPU memory.
"""
from __future__ import annotations

from loguru import logger
from app.services.retrieval.config import EMBED_MODEL, EMBED_DEVICE

_embed_model = None


def get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        logger.info("Embedder: loading {} on {}", EMBED_MODEL, EMBED_DEVICE)
        _embed_model = SentenceTransformer(EMBED_MODEL, device=EMBED_DEVICE)
    return _embed_model
