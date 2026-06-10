"""
Background demo session cleanup worker.

Runs hourly. Finds expired demo_sessions and purges:
  - Files from disk
  - ChromaDB collections (vector + graph)
  - Memgraph nodes (by doc_id)
  - Postgres rows (cascades through collections → documents)

The frontend's DELETE /demo/session/{session_id} calls cleanup_session() directly
for the happy-path (user finishes 3rd query, waits 5 min, redirects).
This worker is the safety net for abandoned / crashed sessions.
"""
from __future__ import annotations

import shutil
import threading
import traceback

from loguru import logger

_stop_event = threading.Event()
CLEANUP_INTERVAL_SECONDS = 3600  # 1 hour


def cleanup_session(session_id: str, collection_name: str) -> None:
    """Delete all resources for one demo session. Safe to call from any thread."""
    from app.database import SessionLocal
    from app import crud
    from app.config import settings

    db = SessionLocal()
    try:
        doc_ids = crud.get_demo_session_doc_ids(db, session_id)

        # Delete Postgres rows (cascades to documents, document_pages, doc_summary)
        crud.delete_demo_session_data(db, session_id)
        logger.info("Demo cleanup: postgres rows deleted for session={} ({} docs)",
                    session_id[:8], len(doc_ids))
    except Exception as exc:
        logger.error("Demo cleanup: postgres delete failed session={} — {}", session_id[:8], exc)
        db.close()
        return
    finally:
        db.close()

    # Delete files from disk
    for doc_id in doc_ids:
        doc_root = settings.STORAGE_ROOT / doc_id
        if doc_root.exists():
            shutil.rmtree(str(doc_root), ignore_errors=True)

    # Delete ChromaDB collections: {collection_name} and {collection_name}_graph
    try:
        import chromadb
        client = chromadb.PersistentClient(path=str(settings.CHROMA_DB_PATH))
        for chroma_name in [collection_name, f"{collection_name}_graph"]:
            try:
                client.delete_collection(chroma_name)
                logger.info("Demo cleanup: ChromaDB '{}' deleted", chroma_name)
            except Exception:
                pass  # collection may not exist if ingestion didn't reach indexing
    except Exception as exc:
        logger.warning("Demo cleanup: ChromaDB cleanup failed session={} — {}",
                       session_id[:8], exc)

    # Delete Memgraph nodes — MATCH (n:Entity {doc_id: $id}) DETACH DELETE n
    if doc_ids:
        try:
            from neo4j import GraphDatabase
            from app.services.ingestion.config import (
                MEMGRAPH_HOST, MEMGRAPH_PORT, MEMGRAPH_USER, MEMGRAPH_PASSWORD,
            )
            driver = GraphDatabase.driver(
                f"bolt://{MEMGRAPH_HOST}:{MEMGRAPH_PORT}",
                auth=(MEMGRAPH_USER, MEMGRAPH_PASSWORD),
            )
            try:
                with driver.session() as mg_session:
                    for doc_id in doc_ids:
                        mg_session.run(
                            "MATCH (n:Entity {doc_id: $doc_id}) DETACH DELETE n",
                            doc_id=doc_id,
                        )
                logger.info("Demo cleanup: Memgraph nodes deleted for {} docs", len(doc_ids))
            finally:
                driver.close()
        except Exception as exc:
            logger.warning("Demo cleanup: Memgraph cleanup failed session={} — {}\n{}",
                           session_id[:8], exc, traceback.format_exc())

    logger.info("Demo cleanup: session={} fully cleaned up", session_id[:8])


def _cleanup_loop() -> None:
    logger.info("Demo cleanup worker started (interval={}s)", CLEANUP_INTERVAL_SECONDS)
    # Wait first, then clean — avoids running on startup before the server is ready
    while not _stop_event.wait(timeout=CLEANUP_INTERVAL_SECONDS):
        from app.database import SessionLocal
        from app import crud

        db = SessionLocal()
        try:
            expired = crud.get_expired_demo_sessions(db)
        except Exception as exc:
            logger.error("Demo cleanup: failed to query expired sessions — {}", exc)
            expired = []
        finally:
            db.close()

        if expired:
            logger.info("Demo cleanup: {} expired session(s) to purge", len(expired))
        for s in expired:
            cleanup_session(s["session_id"], s["collection_name"])

    logger.info("Demo cleanup worker stopped")


def start_cleanup_worker() -> None:
    _stop_event.clear()
    t = threading.Thread(target=_cleanup_loop, daemon=True, name="demo-cleanup")
    t.start()
    logger.info("Demo cleanup worker thread launched")


def stop_cleanup_worker() -> None:
    _stop_event.set()
