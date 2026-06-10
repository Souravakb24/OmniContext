"""
Static constants and derived settings for the ingestion pipeline.
Env-configurable values are pulled from app.config.settings.
"""
from __future__ import annotations

import os
from pathlib import Path

from app.config import settings

# ── LLM models (resolved by active provider) ─────────────────────────────────
from app.services.llm_client import active_vlm_model, active_summarizer_model, active_graph_model
OLLAMA_URL       = settings.OLLAMA_URL
OLLAMA_MODEL     = active_vlm_model()
SUMMARIZER_MODEL = active_summarizer_model()
GRAPH_MODEL      = active_graph_model()
SKIP_VLM         = settings.SKIP_VLM
VLM_WORKERS      = settings.VLM_WORKERS

# ── Docling ───────────────────────────────────────────────────────────────────
_TOTAL_CPUS             = os.cpu_count() or 1
_DEFAULT_DOCLING_WORKERS = min(8, max(2, _TOTAL_CPUS // 4))
DOCLING_WORKERS         = settings.DOCLING_WORKERS or _DEFAULT_DOCLING_WORKERS
PAGE_RENDER_DPI         = 300
FORMULA_RENDER_DPI      = 300

# ── Page image storage (WebP) ─────────────────────────────────────────────────
PAGE_IMAGE_MAX_DIM    = 1500   # resize so longest edge ≤ this (preserves aspect ratio)
PAGE_IMAGE_WEBP_QUALITY = 85

# ── Chunking ──────────────────────────────────────────────────────────────────
CHUNKER_TYPE     = "hybrid"
TOKENIZER        = "sentence-transformers/all-MiniLM-L6-v2"
MAX_TOKENS       = None
MERGE_PEERS      = True
INCLUDE_RAW_TEXT = True

# ── Embedding ─────────────────────────────────────────────────────────────────
EMBED_MODEL  = "BAAI/bge-large-en-v1.5"
EMBED_DEVICE = settings.EMBED_DEVICE or None   # None triggers auto-detect in indexer
EMBED_FP16   = settings.EMBED_FP16

BATCH_SIZE_CUDA = 512
BATCH_SIZE_CPU  = 64

# GPU VRAM thresholds (bytes) → auto batch size
VRAM_BATCH: list[tuple[int, int]] = [
    (24 * 1024**3, 512),   # ≥ 24 GB  (A100 / 4090)
    (16 * 1024**3, 384),   # ≥ 16 GB  (3090 / A100-40G)
    (10 * 1024**3, 256),   # ≥ 10 GB  (3080 / T4)
    (6  * 1024**3, 128),   # ≥  6 GB  (2080 Ti / P40)
    (0,             64),   # <  6 GB  (low VRAM fallback)
]

# ── ChromaDB ──────────────────────────────────────────────────────────────────
CHROMA_DB_PATH    = settings.CHROMA_DB_PATH
CHROMA_COLLECTION = settings.CHROMA_COLLECTION

# ── Worker ────────────────────────────────────────────────────────────────────
WORKER_POLL_INTERVAL = settings.WORKER_POLL_INTERVAL   # seconds

# ── Memgraph ──────────────────────────────────────────────────────────────────
MEMGRAPH_HOST     = settings.MEMGRAPH_HOST
MEMGRAPH_PORT     = settings.MEMGRAPH_PORT
MEMGRAPH_USER     = settings.MEMGRAPH_USER
MEMGRAPH_PASSWORD = settings.MEMGRAPH_PASSWORD

# ── Ontology agent ────────────────────────────────────────────────────────────
from pathlib import Path as _Path
ONTOLOGY_DIR              = str(_Path(__file__).parent / "ontologies")
ONTOLOGY_BATCH_SIZE       = settings.ONTOLOGY_BATCH_SIZE
ONTOLOGY_MAX_ENTITY_TYPES = settings.ONTOLOGY_MAX_ENTITY_TYPES
ONTOLOGY_MAX_REL_TYPES    = settings.ONTOLOGY_MAX_REL_TYPES
ONTOLOGY_WORKERS          = settings.ONTOLOGY_WORKERS
GRAPH_EXTRACTION_WORKERS  = settings.GRAPH_EXTRACTION_WORKERS
SATURATION_WINDOW         = settings.SATURATION_WINDOW
SATURATION_THRESHOLD      = settings.SATURATION_THRESHOLD
