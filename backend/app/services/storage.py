"""
Storage service — creates <doc_id>/ folder and saves <doc_id>.pdf inside it.
"""
from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from app.config import settings
from app.upload_schemas import StoredFile, ValidatedFile


class StorageError(Exception):
    pass


def store_uploaded_file(doc_id: str, validated: ValidatedFile) -> StoredFile:
    doc_root = settings.STORAGE_ROOT / doc_id
    pdf_dest = doc_root / f"{doc_id}.pdf"

    try:
        doc_root.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        raise StorageError(f"Failed to create directory for {doc_id}: {e}")

    if not validated.needs_conversion:
        try:
            pdf_dest.write_bytes(validated.content)
        except OSError as e:
            raise StorageError(f"Failed to write PDF for {doc_id}: {e}")
    else:
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(
                suffix=validated.extension, delete=False, dir=doc_root
            ) as tmp:
                tmp.write(validated.content)
                tmp_path = Path(tmp.name)

            from app.services.converter import ConversionError, convert_to_pdf
            convert_to_pdf(doc_id, str(tmp_path))
        except Exception as e:
            raise StorageError(f"Conversion failed for {doc_id}: {e}")
        finally:
            if tmp_path and tmp_path.exists():
                tmp_path.unlink(missing_ok=True)

    return StoredFile(
        doc_id=doc_id,
        output_dir=str(doc_root) + "/",
        original_path=str(pdf_dest),
        pdf_path=str(pdf_dest),
    )


def delete_doc_dir(doc_id: str) -> None:
    doc_root = settings.STORAGE_ROOT / doc_id
    if doc_root.exists():
        shutil.rmtree(str(doc_root), ignore_errors=True)
