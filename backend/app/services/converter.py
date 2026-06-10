"""
LibreOffice headless converter — DOCX / PPT / PPTX → PDF.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from app.config import settings


class ConversionError(Exception):
    pass


def convert_to_pdf(doc_id: str, original_path: str) -> str:
    out_dir = settings.STORAGE_ROOT / doc_id
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        settings.LIBREOFFICE_BIN,
        "--headless",
        "--convert-to", "pdf",
        "--outdir", str(out_dir),
        original_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.LIBREOFFICE_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        raise ConversionError(f"LibreOffice timed out after {settings.LIBREOFFICE_TIMEOUT}s")

    if result.returncode != 0:
        raise ConversionError(
            f"LibreOffice exited with code {result.returncode}. stderr: {result.stderr.strip()}"
        )

    input_stem = Path(original_path).stem
    produced = out_dir / f"{input_stem}.pdf"
    if not produced.exists():
        raise ConversionError(f"LibreOffice succeeded but PDF not found at {produced}")

    final = out_dir / f"{doc_id}.pdf"
    produced.rename(final)
    return str(final)
