import atexit
import ctypes
import os
import signal
from contextlib import asynccontextmanager

from app.routers import auth, collections, org, upload
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from loguru import logger

from app.routers import users
from app.routers import ingestion
from app.routers import retrieval
from app.routers import dashboard
from app.routers import demo
from app.routers import evidence
from app.routers import management
from app.routers import super_admin
from sqlalchemy import text
from app.database import SessionLocal
from app.services.worker import start_worker, stop_worker
from app.services.retrieval.services.reranker import init_reranker
from app.services.demo_cleanup import start_cleanup_worker, stop_cleanup_worker
from app.core.logging import setup_logging
from app.core.telemetry import emit_event


def _apply_schema_additions() -> None:
    """Safe ADD COLUMN / CREATE TABLE IF NOT EXISTS for post-migration schema changes."""
    db = SessionLocal()
    try:
        db.execute(text(
            "ALTER TABLE conversation_turns "
            "ADD COLUMN IF NOT EXISTS query_complexity VARCHAR(20) DEFAULT 'simple'"
        ))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS demo_sessions (
                id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
                collection_name  VARCHAR(100) NOT NULL,
                doc_count        INTEGER      NOT NULL DEFAULT 0,
                query_count      INTEGER      NOT NULL DEFAULT 0,
                status           VARCHAR(20)  NOT NULL DEFAULT 'active',
                created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
                expires_at       TIMESTAMP    NOT NULL
            )
        """))
        db.commit()
        logger.info("Schema additions applied (query_complexity, demo_sessions)")
    except Exception as exc:
        logger.warning("Schema addition skipped: {}", exc)
        db.rollback()
    finally:
        db.close()


def _ensure_demo_fixtures() -> None:
    """Create the fixed demo org + user once at startup (idempotent)."""
    db = SessionLocal()
    try:
        from app import crud
        crud.ensure_demo_org_and_user(db)
        logger.info("Demo org and user verified")
    except Exception as exc:
        logger.warning("Demo fixture setup failed (non-fatal): {}", exc)
    finally:
        db.close()

# ── Process-group cleanup ─────────────────────────────────────────────────────

def _set_parent_death_signal() -> None:
    """Make this process die if its parent (the shell/tmux) is killed."""
    PR_SET_PDEATHSIG = 1
    try:
        ctypes.CDLL("libc.so.6").prctl(PR_SET_PDEATHSIG, signal.SIGKILL, 0, 0, 0)
    except Exception:
        pass


def _kill_own_process_group(signum=None, frame=None) -> None:
    """Kill every process in our group — Docling workers, embedding procs, etc."""
    pgid = os.getpgrp()
    logger.info("Shutdown signal {} — killing process group {}", signum, pgid)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Become process-group leader so killpg covers all children we spawn.
    try:
        os.setpgrp()
    except PermissionError:
        pass  # already a leader (launched inside tmux pane)

    # Catch graceful shutdown signals and forward to the whole group.
    signal.signal(signal.SIGTERM, _kill_own_process_group)
    signal.signal(signal.SIGINT,  _kill_own_process_group)

    # Also register with atexit so interpreter-exit cleans up.
    atexit.register(_kill_own_process_group)

    # Configure loguru sinks before anything else logs.
    from app.config import settings
    setup_logging(
        log_dir=settings.LOG_DIR,
        log_level=settings.LOG_LEVEL,
        retention_days=settings.LOG_RETENTION_DAYS,
    )

    # Apply any pending safe schema additions before starting workers.
    _apply_schema_additions()
    _ensure_demo_fixtures()
    start_worker()
    start_cleanup_worker()
    init_reranker()
    emit_event("system", stage="startup", status="success")
    yield

    # Graceful stop: let current doc finish, flush GPU caches.
    stop_worker()
    stop_cleanup_worker()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.info("CUDA cache cleared on shutdown")
    except Exception:
        pass


app = FastAPI(
    title="ContextFlow Authentication API",
    version="1.0.0",
    description="Multi-tenant authentication system with encrypted storage and JWT sessions",
    lifespan=lifespan,
)

app.include_router(org.router)
app.include_router(users.router)
app.include_router(auth.router)
app.include_router(upload.router)
app.include_router(collections.router)
app.include_router(ingestion.router)
app.include_router(retrieval.router)
app.include_router(dashboard.router)
app.include_router(demo.router)
app.include_router(evidence.router, prefix="/api", tags=["evidence"])
app.include_router(management.router, tags=["management"])
app.include_router(super_admin.router)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
def health():
    return {"status": "ok"}
