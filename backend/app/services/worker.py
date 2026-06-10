"""
Background ingestion worker — runs in a daemon thread started at app startup.

Loop:
  1. Claim the oldest UPLOADED document atomically (UPDATE ... FOR UPDATE SKIP LOCKED).
  2. Run the pipeline (CONVERTING → PARSING → CHUNKING).
  3. Run the indexer (EMBEDDING → INDEXING → COMPLETED).
  4. On any exception → set FAILED with truncated error message.
  5. If no document found → sleep WORKER_POLL_INTERVAL seconds and repeat.

Only one document is processed at a time. The pipeline itself is already
parallel internally (ProcessPoolExecutor for Docling workers).
"""
from __future__ import annotations

import threading
import time
import traceback

from app.services.ingestion import graph_indexer, indexer, ontology_agent, pipeline
from loguru import logger
from app.core.telemetry import emit_event

from app.services.ingestion.config import SKIP_VLM, WORKER_POLL_INTERVAL

_stop_event = threading.Event()


def _process_one(doc: dict) -> None:
    from app.database import SessionLocal
    from app import crud
    from app.services.ingestion import summarizer

    doc_id          = doc["doc_id"]
    log             = logger.bind(doc_id=doc_id, filename=doc.get("filename", ""))
    file_name       = doc.get("filename", "")
    collection_id   = doc.get("collection_id", "")
    collection_name = doc.get("collection_name", "default")

    log.info("Worker ▶ starting doc_id={} collection={}", doc_id, collection_name)
    emit_event("doc_lifecycle", stage="started", doc_id=doc_id, collection_id=collection_id,
               filename=file_name, collection_name=collection_name)
    _doc_t0 = time.perf_counter()

    db = SessionLocal()
    try:
        # ── Stage 1: pipeline (CONVERTING → PARSING → CHUNKING) ──────────────
        pipeline_result = pipeline.run(
            doc_id=doc_id,
            pdf_path=doc["pdf_path"],
            output_dir=doc["output_dir"],
            db=db,
            skip_vlm=SKIP_VLM,
        )
        chunks_payload = pipeline_result["chunks_payload"]

        # ── no_DB: save chunks to disk, skip indexing entirely ───────────────
        if doc.get("storage_mode") == "no_DB":
            from app.services.ingestion import json_storage
            json_storage.save(doc_id, file_name, chunks_payload)
            crud.mark_document_completed(db, doc_id)
            log.info("Worker ✓ completed doc_id={} (no_DB — chunks saved to disk)", doc_id)
            return

        # ── Stage 2: summarize + classify domain ─────────────────────────────
        summary_result = summarizer.run(
            doc_id=doc_id,
            file_name=file_name,
            chunks_payload=chunks_payload,
            db=db,
        )

        # ── Stage 3: resolve ontology + Stage 4: index ───────────────────────
        # User choice is authoritative. Summarizer is advisory — graph only runs
        # when the user explicitly opted in (Graph_DB or both_DB) AND the
        # summarizer also thinks the doc warrants it.
        user_wants_graph = doc.get("storage_mode") in ("Graph_DB", "both_DB")
        needs_graph      = (summary_result or {}).get("needs_graph", False)
        run_graph        = user_wants_graph and needs_graph

        log.info(
            "Worker: storage_mode={} summarizer_needs_graph={} → run_graph={}",
            doc.get("storage_mode"), needs_graph, run_graph,
        )

        if run_graph:
            ontology = ontology_agent.run(
                chunks_payload=chunks_payload,
                summary_result=summary_result,
                collection_id=collection_id,
                db=db,
            )
            _run_parallel_indexing(doc_id, chunks_payload, ontology, collection_id, collection_name, log)
        else:
            from app.services.ingestion import indexer as _indexer
            db2 = SessionLocal()
            try:
                _indexer.run(doc_id=doc_id, chunks_payload=chunks_payload,
                             db=db2, collection_name=collection_name)
            finally:
                db2.close()

        crud.mark_document_completed(db, doc_id)
        _doc_dur = int((time.perf_counter() - _doc_t0) * 1000)
        log.info("Worker ✓ completed doc_id={}", doc_id)
        emit_event("doc_lifecycle", stage="completed", status="success",
                   doc_id=doc_id, collection_id=collection_id,
                   duration_ms=_doc_dur, filename=file_name)

    except Exception as exc:
        _doc_dur = int((time.perf_counter() - _doc_t0) * 1000)
        error_msg = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"
        log.error("Worker ✗ FAILED doc_id={} — {}", doc_id, exc)
        emit_event("doc_lifecycle", stage="failed", status="error",
                   doc_id=doc_id, collection_id=collection_id,
                   duration_ms=_doc_dur,
                   error_type=type(exc).__name__,
                   error_message=str(exc),
                   error_traceback=traceback.format_exc())
        try:
            crud.mark_document_failed(db, doc_id, error_msg[:4000])
        except Exception:
            pass

    finally:
        db.close()


def _run_parallel_indexing(doc_id: str, chunks_payload: dict,
                            ontology: dict, collection_id: str,
                            collection_name: str, log) -> None:
    """Run vector indexer and graph indexer in parallel. Raises if either fails."""
    from concurrent.futures import ThreadPoolExecutor
    from app.database import SessionLocal
    from app.services.ingestion import indexer

    def _vector():
        db = SessionLocal()
        try:
            indexer.run(doc_id=doc_id, chunks_payload=chunks_payload,
                        db=db, collection_name=collection_name)
        finally:
            db.close()

    def _graph():
        db = SessionLocal()
        try:
            graph_indexer.run(
                doc_id=doc_id,
                chunks_payload=chunks_payload,
                ontology=ontology,
                db=db,
                collection_id=collection_id,
                collection_name=collection_name,
            )
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_vec   = pool.submit(_vector)
        f_graph = pool.submit(_graph)

    exc_vec   = f_vec.exception()
    exc_graph = f_graph.exception()

    if exc_vec or exc_graph:
        parts = []
        if exc_vec:   parts.append(f"vector_db: {exc_vec}")
        if exc_graph: parts.append(f"graph_db: {exc_graph}")
        raise RuntimeError("; ".join(parts))


def _worker_loop() -> None:
    from app.database import SessionLocal
    from app import crud

    logger.info("Ingestion worker started (poll_interval={}s, embed_device=cuda:1, vlm_device=cuda:0)",
                WORKER_POLL_INTERVAL)

    # Self-heal: re-queue any document left stranded mid-ingestion by a previous
    # crash/restart so it gets reprocessed instead of being stuck forever.
    db = SessionLocal()
    try:
        requeued = crud.requeue_stuck_documents(db)
        if requeued:
            logger.warning("Worker: re-queued {} stranded document(s) on startup", requeued)
    except Exception as exc:
        logger.error("Worker: startup requeue failed — {}", exc)
    finally:
        db.close()

    while not _stop_event.is_set():
        # Outer guard: nothing inside the loop — not even acquiring a DB session —
        # may escape and kill the thread. A transient error (DB hiccup, pool
        # exhaustion) logs and backs off; the loop survives so queued documents
        # keep draining instead of sitting in QUEUED forever.
        try:
            db = SessionLocal()
            try:
                doc = crud.claim_next_document(db)
            finally:
                db.close()

            if doc:
                _process_one(doc)
            else:
                _stop_event.wait(timeout=WORKER_POLL_INTERVAL)
        except Exception as exc:
            logger.error("Worker: loop error — {} — backing off {}s", exc, WORKER_POLL_INTERVAL)
            _stop_event.wait(timeout=WORKER_POLL_INTERVAL)

    logger.info("Ingestion worker stopped")


_worker_thread: threading.Thread | None = None
_WATCHDOG_INTERVAL = 30  # seconds


def _spawn_worker_thread() -> threading.Thread:
    t = threading.Thread(target=_worker_loop, daemon=True, name="ingestion-worker")
    t.start()
    return t


def _watchdog_loop() -> None:
    """Relaunch the ingestion worker if it ever exits while the app is running.

    The hardened loop should never die, but a watchdog guarantees recovery from
    any unforeseen cause (e.g. a crash inside a C extension thread) so ingestion
    self-heals instead of silently stopping until the next server restart.
    """
    global _worker_thread
    while not _stop_event.is_set():
        if _worker_thread is None or not _worker_thread.is_alive():
            logger.error("Watchdog: ingestion worker thread is dead — relaunching")
            _worker_thread = _spawn_worker_thread()
        _stop_event.wait(timeout=_WATCHDOG_INTERVAL)


def start_worker() -> None:
    global _worker_thread
    _stop_event.clear()
    _worker_thread = _spawn_worker_thread()
    threading.Thread(target=_watchdog_loop, daemon=True, name="ingestion-watchdog").start()
    logger.info("Ingestion worker thread launched (+ watchdog)")


def stop_worker() -> None:
    """Signal the worker loop to exit after the current document finishes."""
    _stop_event.set()
    logger.info("Ingestion worker stop requested")
