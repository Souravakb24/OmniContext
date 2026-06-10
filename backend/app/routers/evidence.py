"""
GET /api/evidence/{chunk_id}

Returns annotated page images (WebP, base64) with bbox coordinates in image space
(y=0 top-left) for the given chunk. Bboxes are y-flipped from PDF space using
the page height stored in documents.layout_json.

For figure chunks, also returns the extracted figure image as figure_image_b64.
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.services.figure_store import resolve_figure_source, figure_to_b64

router = APIRouter()


def _page_dims_pts(layout_json: dict | None, page_no: int) -> tuple[float | None, float | None]:
    """Return (width_pts, height_pts) for the given page from layout_json."""
    if not layout_json:
        return None, None
    for page in layout_json.get("pages", []):
        if page.get("page_no") == page_no:
            return page.get("width"), page.get("height")
    return None, None


def _to_pixel_bbox(bbox: dict, page_h_pts: float, scale_x: float, scale_y: float) -> dict:
    """Y-flip from PDF space and scale to image pixel coordinates."""
    return {
        "x0": bbox["x0"] * scale_x,
        "y0": (page_h_pts - bbox["y1"]) * scale_y,
        "x1": bbox["x1"] * scale_x,
        "y1": (page_h_pts - bbox["y0"]) * scale_y,
    }


@router.get("/evidence/{chunk_id}")
def get_evidence(
    chunk_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # ── Fetch chunk ───────────────────────────────────────────────────────────
    chunk_row = db.execute(
        text("""
            SELECT dc.chunk_id, dc.doc_id::text, dc.chunk_type,
                   dc.headings, dc.provenance, dc.caption, dc.image_ref
            FROM document_chunks dc
            WHERE dc.chunk_id = :chunk_id
            LIMIT 1
        """),
        {"chunk_id": chunk_id},
    ).fetchone()

    if not chunk_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chunk not found")

    # ── Fetch document ────────────────────────────────────────────────────────
    doc_row = db.execute(
        text("""
            SELECT filename, output_dir, layout_json
            FROM documents
            WHERE doc_id = CAST(:doc_id AS uuid)
            LIMIT 1
        """),
        {"doc_id": chunk_row.doc_id},
    ).fetchone()

    if not doc_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # ── Parse provenance ──────────────────────────────────────────────────────
    provenance = chunk_row.provenance
    if isinstance(provenance, str):
        provenance = json.loads(provenance)
    provenance = provenance or []

    layout_json = doc_row.layout_json or {}

    # Group bboxes by page_no (PDF space)
    bboxes_by_page: dict[int, list[dict]] = {}
    for entry in provenance:
        pg = entry.get("page_no")
        if pg is None:
            continue
        bboxes_by_page.setdefault(pg, []).append({
            "x0": entry.get("x0", 0),
            "y0": entry.get("y0", 0),
            "x1": entry.get("x1", 0),
            "y1": entry.get("y1", 0),
        })

    # ── Fetch page images and apply y-flip ────────────────────────────────────
    pages_out = []
    for page_no in sorted(bboxes_by_page.keys()):
        page_row = db.execute(
            text("""
                SELECT image_path, width_px, height_px
                FROM document_pages
                WHERE doc_id = CAST(:doc_id AS uuid) AND page_no = :page_no
                LIMIT 1
            """),
            {"doc_id": chunk_row.doc_id, "page_no": page_no},
        ).fetchone()

        if not page_row or not page_row.image_path:
            continue

        img_file = Path(doc_row.output_dir) / page_row.image_path
        if not img_file.exists():
            continue

        image_b64 = "data:image/webp;base64," + base64.b64encode(img_file.read_bytes()).decode()

        page_w_pts, page_h_pts = _page_dims_pts(layout_json, page_no)
        raw_bboxes = bboxes_by_page[page_no]

        if page_h_pts and page_w_pts and page_row.width_px and page_row.height_px:
            scale_x = page_row.width_px / page_w_pts
            scale_y = page_row.height_px / page_h_pts
            flipped_bboxes = [_to_pixel_bbox(b, page_h_pts, scale_x, scale_y) for b in raw_bboxes]
        else:
            # No page dims available — return raw coords as fallback
            flipped_bboxes = raw_bboxes

        pages_out.append({
            "page_no":   page_no,
            "image_b64": image_b64,
            "width_px":  page_row.width_px,
            "height_px": page_row.height_px,
            "bboxes":    flipped_bboxes,
        })

    # ── Figure image ──────────────────────────────────────────────────────────
    figure_image_b64 = None
    src = resolve_figure_source(db, chunk_id)
    if src:
        figure_image_b64 = figure_to_b64(src["abs_path"])

    return {
        "chunk_id":        chunk_row.chunk_id,
        "chunk_type":      chunk_row.chunk_type,
        "doc_name":        doc_row.filename,
        "headings":        chunk_row.headings,
        "pages":           pages_out,
        "figure_image_b64": figure_image_b64,
        "caption":         chunk_row.caption,
    }
