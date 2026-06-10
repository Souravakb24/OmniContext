"""
Embedding + ChromaDB indexer — adapts the standalone 2_indexing.py script
into a callable service function used by the background worker.

Entry point:
    run(doc_id, chunks_payload, db)

Stages and matching document statuses:
    EMBEDDING  — SentenceTransformer encodes all chunk texts
    INDEXING   — upsert embeddings into ChromaDB + insert into document_chunks
    COMPLETED  — set when indexing succeeds
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional

from loguru import logger
from sqlalchemy.orm import Session
from app.core.telemetry import emit_event

from app.services.ingestion.config import (
    EMBED_MODEL,
    EMBED_DEVICE,
    EMBED_FP16,
    BATCH_SIZE_CUDA,
    BATCH_SIZE_CPU,
    VRAM_BATCH,
    CHROMA_DB_PATH,
)
from app.services.chroma_naming import to_chroma_name


# ── Device helpers ────────────────────────────────────────────────────────────

def _resolve_device(requested: Optional[str]) -> str:
    import torch

    if requested:
        if requested.startswith("cuda"):
            if not torch.cuda.is_available():
                raise RuntimeError("CUDA requested but no CUDA GPU is available.")
            idx = int(requested.split(":")[-1]) if ":" in requested else 0
            if idx >= torch.cuda.device_count():
                raise RuntimeError(f"cuda:{idx} requested but only {torch.cuda.device_count()} GPU(s) found.")
        elif requested == "mps":
            if not (hasattr(torch.backends, "mps") and torch.backends.mps.is_available()):
                raise RuntimeError("MPS requested but not available.")
        return requested

    if torch.cuda.is_available():
        return "cuda:1" if torch.cuda.device_count() > 1 else "cuda:0"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _auto_batch_size(device: str) -> int:
    if not device.startswith("cuda"):
        return BATCH_SIZE_CPU
    import torch
    dev_idx = int(device.split(":")[-1]) if ":" in device else 0
    try:
        total_vram = torch.cuda.get_device_properties(dev_idx).total_memory
        for vram_threshold, bs in VRAM_BATCH:
            if total_vram >= vram_threshold:
                return bs
    except Exception:
        pass
    return BATCH_SIZE_CUDA


def _load_model(device: str, fp16: bool):
    from sentence_transformers import SentenceTransformer
    import torch

    model = SentenceTransformer(EMBED_MODEL, device=device)
    if fp16:
        model = model.half()
    if device.startswith("cuda"):
        model.encode(["warmup"], batch_size=1, show_progress_bar=False)
        torch.cuda.synchronize()
    return model


# ── Provenance extraction ─────────────────────────────────────────────────────

def _extract_provenance(chunk: dict) -> list[dict]:
    provenance: list[dict] = []
    if chunk.get("chunker") == "figure":
        bbox = chunk.get("bbox")
        page = chunk.get("page")
        if bbox and page is not None:
            provenance.append({"page_no": page, "x0": bbox.get("x0"),
                               "y0": bbox.get("y0"), "x1": bbox.get("x1"), "y1": bbox.get("y1")})
        return provenance
    for item in chunk.get("meta", {}).get("doc_items", []):
        for prov in item.get("prov", []):
            bbox = prov.get("bbox")
            page = prov.get("page_no")
            if bbox and page is not None:
                provenance.append({"page_no": page, "x0": bbox.get("x0"),
                                   "y0": bbox.get("y0"), "x1": bbox.get("x1"), "y1": bbox.get("y1")})
    return provenance


def _unique_page_numbers(provenance: list[dict]) -> list[int]:
    return sorted({p["page_no"] for p in provenance if p.get("page_no") is not None})


def _build_chroma_metadata(file_meta: dict, chunk: dict, provenance: list[dict]) -> dict:
    chunk_type   = chunk.get("type") or chunk.get("chunker", "text")
    headings_raw = (chunk.get("meta") or {}).get("headings") or []
    headings     = " > ".join(headings_raw) if isinstance(headings_raw, list) else str(headings_raw)

    meta = {
        "doc_id":        file_meta.get("doc_id", ""),
        "source":        file_meta.get("source", ""),
        "document_name": file_meta.get("document_name", ""),
        "chunk_index":   chunk.get("chunk_index", -1),
        "chunk_type":    chunk_type,
        "chunker":       chunk.get("chunker", ""),
        "headings":      headings,
        "page_numbers":  ",".join(str(p) for p in _unique_page_numbers(provenance)),
        "provenance":    json.dumps(provenance),
    }

    raw = chunk.get("raw_text")
    if raw:
        meta["raw_text"] = raw

    if chunk_type == "figure":
        meta["caption"]        = chunk.get("caption", "")
        meta["parent_heading"] = chunk.get("parent_heading", "")
        meta["image_ref"]      = chunk.get("image_ref", "")

    return meta


# ── document_chunks helpers ───────────────────────────────────────────────────

def _upsert_document_chunks(
    db: Session,
    doc_id: str,
    collection_id: str,
    chunks: list[dict],
    is_indexed: bool = False,
) -> None:
    """
    Delete existing rows for doc_id then bulk-insert all chunks with full metadata.
    search_vec TSVECTOR is populated automatically by the DB trigger on INSERT.
    Set is_indexed=True after ChromaDB upsert succeeds.
    """
    from sqlalchemy import text as sa_text
    from app.models import DocumentChunk

    db.execute(
        sa_text("DELETE FROM document_chunks WHERE doc_id = CAST(:doc_id AS uuid)"),
        {"doc_id": doc_id},
    )

    rows = []
    for chunk in chunks:
        rows.append({
            "doc_id":         doc_id,
            "collection_id":  collection_id,
            "chunk_index":    chunk["chunk_index"],
            "chunk_id":       chunk["chunk_id"],
            "chunk_type":     chunk["chunk_type"],
            "chunker":        chunk.get("chunker"),
            "text":           chunk["text"],
            "raw_text":       chunk.get("raw_text"),
            "headings":       chunk.get("headings"),
            "page_numbers":   chunk.get("page_numbers"),
            "provenance":     json.dumps(chunk.get("provenance", [])),
            "caption":        chunk.get("caption"),
            "parent_heading": chunk.get("parent_heading"),
            "image_ref":      chunk.get("image_ref"),
            "is_indexed":     is_indexed,
        })

    db.bulk_insert_mappings(DocumentChunk, rows)
    db.commit()


def _mark_indexed(db: Session, doc_id: str) -> None:
    from sqlalchemy import text as sa_text
    db.execute(
        sa_text("UPDATE document_chunks SET is_indexed = TRUE WHERE doc_id = CAST(:doc_id AS uuid)"),
        {"doc_id": doc_id},
    )
    db.commit()


# ── Main entry point ──────────────────────────────────────────────────────────

def run(doc_id: str, chunks_payload: dict, db: Session,
        collection_name: str = "default") -> None:
    """
    Embed all chunks and upsert them into ChromaDB + document_chunks.

    Collection used: {collection_name}_vector  (ChromaDB)
    Updates document status: EMBEDDING → INDEXING.
    Note: COMPLETED is set by the worker after both indexer and graph_indexer finish.
    """
    import torch
    import chromadb
    from sqlalchemy import text as sa_text
    from app import crud

    log = logger.bind(doc_id=doc_id)

    chunks = chunks_payload.get("chunks", [])
    if not chunks:
        log.warning("Indexer: no chunks to index for doc_id={}", doc_id)
        return

    # ── Resolve collection_id from collection_name ────────────────────────────
    row = db.execute(
        sa_text("SELECT id FROM collections WHERE name = :name LIMIT 1"),
        {"name": collection_name},
    ).fetchone()
    if not row:
        raise RuntimeError(f"Collection '{collection_name}' not found in database")
    collection_id = str(row.id)

    # ── Build per-chunk data ──────────────────────────────────────────────────
    chroma_ids:       list[str]  = []
    chroma_documents: list[str]  = []
    chroma_metadatas: list[dict] = []
    chunk_rows:       list[dict] = []

    file_meta = {
        "doc_id":        doc_id,
        "source":        chunks_payload.get("source", ""),
        "document_name": chunks_payload.get("document_name", doc_id),
    }

    for chunk in chunks:
        text = chunk.get("text", "").strip()
        if not text:
            continue

        provenance   = _extract_provenance(chunk)
        page_numbers = _unique_page_numbers(provenance)
        chunk_type   = chunk.get("type") or chunk.get("chunker", "text")
        headings_raw = (chunk.get("meta") or {}).get("headings") or []
        headings     = " > ".join(headings_raw) if isinstance(headings_raw, list) else str(headings_raw)

        # chunk_id uses doc_id (UUID) — no collision across documents
        chunk_id = f"{doc_id}_chunk_{chunk['chunk_index']}"

        chroma_ids.append(chunk_id)
        chroma_documents.append(text)
        chroma_metadatas.append(_build_chroma_metadata(file_meta, chunk, provenance))

        chunk_rows.append({
            "chunk_index":    chunk["chunk_index"],
            "chunk_id":       chunk_id,
            "chunk_type":     chunk_type,
            "chunker":        chunk.get("chunker"),
            "text":           text,
            "raw_text":       chunk.get("raw_text"),
            "headings":       headings or None,
            "page_numbers":   page_numbers or None,
            "provenance":     provenance,
            "caption":        chunk.get("caption") if chunk_type == "figure" else None,
            "parent_heading": chunk.get("parent_heading") if chunk_type == "figure" else None,
            "image_ref":      chunk.get("image_ref") if chunk_type == "figure" else None,
        })

    if not chroma_ids:
        log.warning("Indexer: all chunks empty for doc_id={}", doc_id)
        return

    # ── EMBEDDING stage ───────────────────────────────────────────────────────
    crud.update_document_status(db, doc_id, "EMBEDDING")

    device     = _resolve_device(EMBED_DEVICE)
    batch_size = _auto_batch_size(device)
    log.info("Indexer: embedding {} chunks on {} (batch={})", len(chroma_ids), device, batch_size)

    model = _load_model(device, EMBED_FP16)

    t0 = time.perf_counter()
    encode_kwargs: dict = dict(
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    if device.startswith("cuda"):
        encode_kwargs["device"] = device

    embeddings = model.encode(chroma_documents, **encode_kwargs)

    if device.startswith("cuda"):
        torch.cuda.synchronize()

    elapsed_embed = time.perf_counter() - t0
    log.info("Indexer: encoded {} chunks in {:.1f}s ({:.0f} chunks/s)",
             len(chroma_ids), elapsed_embed, len(chroma_ids) / elapsed_embed)
    emit_event("ingestion_stage", stage="embedding", status="success",
               doc_id=doc_id, duration_ms=int(elapsed_embed * 1000),
               chunk_count=len(chroma_ids))

    # ── INDEXING stage ────────────────────────────────────────────────────────
    crud.update_document_status(db, doc_id, "INDEXING")

    # Insert into document_chunks (is_indexed=False) before ChromaDB upsert
    _upsert_document_chunks(db, doc_id, collection_id, chunk_rows, is_indexed=False)
    log.info("Indexer: {} chunks inserted into document_chunks for doc_id={}", len(chunk_rows), doc_id)

    # Guard: abort if document was deleted while ingestion was running
    still_exists = db.execute(
        sa_text("SELECT 1 FROM documents WHERE doc_id = CAST(:doc_id AS uuid)"),
        {"doc_id": doc_id},
    ).fetchone()
    if not still_exists:
        log.warning("Indexer: doc_id={} deleted during ingestion — rolling back document_chunks", doc_id)
        db.execute(
            sa_text("DELETE FROM document_chunks WHERE doc_id = CAST(:doc_id AS uuid)"),
            {"doc_id": doc_id},
        )
        db.commit()
        return

    # ChromaDB upsert
    chroma_collection_name = to_chroma_name(collection_name, "vector")
    Path(CHROMA_DB_PATH).mkdir(parents=True, exist_ok=True)
    client     = chromadb.PersistentClient(path=str(CHROMA_DB_PATH))
    collection = client.get_or_create_collection(
        name=chroma_collection_name,
        metadata={"hnsw:space": "cosine"},
    )
    log.info("Indexer: using ChromaDB collection '{}'", chroma_collection_name)

    for start in range(0, len(chroma_ids), batch_size):
        end = start + batch_size
        collection.upsert(
            ids=chroma_ids[start:end],
            documents=chroma_documents[start:end],
            embeddings=embeddings[start:end].tolist(),
            metadatas=chroma_metadatas[start:end],
        )

    if device.startswith("cuda"):
        torch.cuda.empty_cache()

    # Mark all chunks as indexed now that ChromaDB upsert succeeded
    _mark_indexed(db, doc_id)
    log.info("Indexer: {} chunks fully indexed for doc_id={}", len(chroma_ids), doc_id)
    emit_event("ingestion_stage", stage="bm25_indexing", status="success",
               doc_id=doc_id, chunk_count=len(chroma_ids))
