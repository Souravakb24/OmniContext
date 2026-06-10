"""
Per-chat-turn figure storage.

When the citation agent cites figure chunks, the original figure images (already
produced by ingestion at ``documents.output_dir / document_chunks.image_ref``) are
copied into a per-turn folder:

    {STORAGE_ROOT}/chat_figures/{conversation_id}/turn_{turn_index}/fig_{i}.png

The relative paths (``{conversation_id}/turn_{turn_index}/fig_{i}.png``) are stored on
``conversation_turns.figure_paths`` (NULL when no figures) and also tagged onto the
matching figure citation as ``figure_path``. The image bytes themselves are not stored
in the DB — they are read back from disk and base64-inlined only when a turn is served.
"""
from __future__ import annotations

import base64
import shutil
from pathlib import Path
from uuid import UUID

from loguru import logger
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings

CHAT_FIGURES_ROOT = Path(settings.STORAGE_ROOT) / "chat_figures"


def _mime_for(suffix: str) -> str:
    return "image/png" if suffix.lower() == ".png" else "image/jpeg"


def resolve_figure_source(db: Session, chunk_id: str) -> dict | None:
    """Return {abs_path, caption} for a figure chunk's original image, else None.

    Shared by the evidence route and the per-turn copy step so the
    image_ref → output_dir resolution lives in one place.
    """
    row = db.execute(
        text(
            """
            SELECT dc.chunk_type, dc.caption, dc.image_ref, d.output_dir
            FROM document_chunks dc
            JOIN documents d ON d.doc_id = dc.doc_id
            WHERE dc.chunk_id = :cid
            LIMIT 1
            """
        ),
        {"cid": chunk_id},
    ).fetchone()

    if not row or row.chunk_type != "figure" or not row.image_ref or not row.output_dir:
        return None

    abs_path = Path(row.output_dir) / row.image_ref
    if not abs_path.exists():
        return None
    return {"abs_path": abs_path, "caption": row.caption}


def figure_to_b64(abs_path: Path) -> str:
    """Read an image file and return a base64 data URI."""
    raw = abs_path.read_bytes()
    return f"data:{_mime_for(abs_path.suffix)};base64," + base64.b64encode(raw).decode()


def _turn_dir(conversation_id: UUID | str, turn_index: int) -> Path:
    return CHAT_FIGURES_ROOT / str(conversation_id) / f"turn_{turn_index}"


def copy_figures_for_turn(
    db: Session,
    conversation_id: UUID | str,
    turn_index: int,
    citations: list | None,
) -> list[str] | None:
    """Copy each cited figure into the turn folder.

    Mutates ``citations`` in place — each figure citation gets ``figure_path`` (relative)
    and ``caption`` set. Returns the ordered list of relative paths, or None if the turn
    cited no figures.
    """
    if not citations:
        return None

    dest_dir = _turn_dir(conversation_id, turn_index)
    rel_paths: list[str] = []
    idx = 0

    for cite in citations:
        if not isinstance(cite, dict):
            continue
        if cite.get("chunk_type") != "figure":
            continue
        chunk_id = cite.get("chunk_id")
        if not chunk_id:
            continue
        src = resolve_figure_source(db, chunk_id)
        if not src:
            continue

        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
            filename = f"fig_{idx}{src['abs_path'].suffix.lower()}"
            shutil.copy2(src["abs_path"], dest_dir / filename)
        except Exception as exc:
            logger.warning("copy_figures_for_turn: failed to copy {} ({})", chunk_id, exc)
            continue

        rel_path = f"{conversation_id}/turn_{turn_index}/{filename}"
        cite["figure_path"] = rel_path
        if src["caption"] and not cite.get("caption"):
            cite["caption"] = src["caption"]
        rel_paths.append(rel_path)
        idx += 1

    return rel_paths or None


def load_figure_b64(rel_path: str) -> str | None:
    """Read a previously copied turn figure and return it as a base64 data URI."""
    if not rel_path:
        return None
    abs_path = CHAT_FIGURES_ROOT / rel_path
    if not abs_path.exists():
        return None
    try:
        return figure_to_b64(abs_path)
    except Exception as exc:
        logger.warning("load_figure_b64: failed to read {} ({})", rel_path, exc)
        return None


def delete_turn_figures(conversation_id: UUID | str, turn_index: int) -> None:
    """Remove a single turn's figure folder (used when pruning a superseded turn)."""
    shutil.rmtree(_turn_dir(conversation_id, turn_index), ignore_errors=True)


def delete_conversation_figures(conversation_id: UUID | str) -> None:
    """Remove all figure files for a conversation."""
    shutil.rmtree(CHAT_FIGURES_ROOT / str(conversation_id), ignore_errors=True)
