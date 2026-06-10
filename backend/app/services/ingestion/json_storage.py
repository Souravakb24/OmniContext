"""
Fallback storage for no_DB mode.
Saves the chunks payload as JSON under:
  CHUNKS_STORAGE_ROOT / {doc_id} / {file_name} / chunks.json
"""
from __future__ import annotations

import json
from pathlib import Path

from loguru import logger

from app.config import settings


def save(doc_id: str, file_name: str, chunks_payload: dict) -> str:
    dest = settings.CHUNKS_STORAGE_ROOT / doc_id / file_name
    dest.mkdir(parents=True, exist_ok=True)
    out_path = dest / "chunks.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(chunks_payload, f, ensure_ascii=False, indent=2)
    logger.bind(doc_id=doc_id).info(
        "json_storage: chunks saved → {}", out_path
    )
    return str(out_path)
