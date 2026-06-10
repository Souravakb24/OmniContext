"""
Ingestion pipeline — adapts the standalone injestion+chunking_multi.py script
into a callable service function used by the background worker.

Entry point:
    result = run(doc_id, pdf_path, output_dir, db, skip_vlm, n_workers)

Pipeline stages and matching document statuses:
    CONVERTING  — render page PNGs, parallel Docling OCR, reading-order sort
    PARSING     — VLM enrichment, save page images as WebP to document_pages
    CHUNKING    — fast Docling pass, build chunks + figure chunks, save to DB
"""
from __future__ import annotations

import io
import json
import math
import os
import uuid
import re
import shutil
import tempfile
import time
from collections import defaultdict
import multiprocessing as _mp
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from dataclasses import asdict, is_dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import fitz
from loguru import logger
from PIL import Image
from sqlalchemy.orm import Session

from app.config import settings
from app.services.ingestion.config import (
    PAGE_RENDER_DPI,
    DOCLING_WORKERS,
    VLM_WORKERS,
    PAGE_IMAGE_MAX_DIM,
    PAGE_IMAGE_WEBP_QUALITY,
    CHUNKER_TYPE,
    TOKENIZER,
    MAX_TOKENS,
    MERGE_PEERS,
    INCLUDE_RAW_TEXT,
)
from app.services.ingestion.prompts import IMAGE_DESCRIPTION_PROMPT, FORMULA_EXTRACTION_PROMPT
from app.services.llm_client import call_vision


# ── Process group / child lifecycle ──────────────────────────────────────────

def _child_init() -> None:
    """Initializer for ProcessPoolExecutor workers.

    Sets PR_SET_PDEATHSIG so that if the parent process (uvicorn) is killed
    by any signal — including SIGKILL — the kernel automatically sends SIGKILL
    to this child, preventing orphaned GPU/CPU worker processes.
    """
    import ctypes, signal as _sig
    PR_SET_PDEATHSIG = 1
    try:
        ctypes.CDLL("libc.so.6").prctl(PR_SET_PDEATHSIG, _sig.SIGKILL, 0, 0, 0)
    except Exception:
        pass  # non-Linux or prctl unavailable — best-effort only


# ── VLM helpers ───────────────────────────────────────────────────────────────

def _image_to_b64(img: Image.Image, fmt: str = "PNG") -> str:
    import base64
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _path_to_b64(path: Path) -> str:
    import base64
    return base64.b64encode(path.read_bytes()).decode("utf-8")


def describe_image(b64: str) -> str:
    return call_vision(b64, IMAGE_DESCRIPTION_PROMPT)


# ── Step 1: render pages → PNG ────────────────────────────────────────────────

def render_pages(pdf_path: Path, out_dir: Path, dpi: int = 300) -> dict[int, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    scale = dpi / 72.0
    mat   = fitz.Matrix(scale, scale)
    paths: dict[int, Path] = {}
    with fitz.open(str(pdf_path)) as pdf:
        for i, page in enumerate(pdf, start=1):
            pix = page.get_pixmap(matrix=mat, alpha=False)
            p   = out_dir / f"page_{i}.png"
            pix.save(str(p))
            paths[i] = p
    return paths


# ── Step 2: Docling passes ────────────────────────────────────────────────────

def run_docling(pdf_path: Path):
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
    from docling.document_converter import DocumentConverter, PdfFormatOption

    opts = PdfPipelineOptions()
    opts.do_ocr                                   = True
    opts.do_table_structure                       = True
    opts.table_structure_options.do_cell_matching = True
    opts.table_structure_options.mode             = TableFormerMode.FAST
    opts.generate_page_images                     = False
    opts.generate_picture_images                  = True
    opts.images_scale                             = 3.0
    opts.do_formula_enrichment                    = True
    converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})
    return converter.convert(str(pdf_path))


def run_docling_fast(pdf_path: Path):
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, TableFormerMode
    from docling.document_converter import DocumentConverter, PdfFormatOption

    opts = PdfPipelineOptions()
    opts.do_ocr                                   = False
    opts.do_table_structure                       = True
    opts.table_structure_options.do_cell_matching = False
    opts.table_structure_options.mode             = TableFormerMode.FAST
    opts.generate_page_images                     = False
    opts.generate_picture_images                  = False
    opts.do_formula_enrichment                    = False
    converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=opts)})
    return converter.convert(str(pdf_path))


# ── Step 3: build per-page element map ───────────────────────────────────────

def _bbox_dict(bbox) -> dict:
    return {
        "x0": round(float(bbox.l), 2), "y0": round(float(bbox.t), 2),
        "x1": round(float(bbox.r), 2), "y1": round(float(bbox.b), 2),
    }


def _normalize_bbox(b: Any) -> Optional[dict]:
    if not b or not isinstance(b, dict):
        return None
    if "x0" in b:
        return {k: round(float(b[k]), 2) for k in ("x0", "y0", "x1", "y1")}
    if "l" in b:
        return {"x0": round(float(b["l"]), 2), "y0": round(float(b["t"]), 2),
                "x1": round(float(b["r"]), 2), "y1": round(float(b["b"]), 2)}
    return None


def _normalize_chunk_bboxes(chunk_payload: dict) -> None:
    first_bbox: Optional[dict] = None
    first_page: Optional[int]  = None
    for item in chunk_payload.get("meta", {}).get("doc_items", []):
        for prov in item.get("prov", []):
            raw = prov.get("bbox")
            if raw:
                normed = _normalize_bbox(raw)
                if normed:
                    prov["bbox"] = normed
                    if first_bbox is None:
                        first_bbox = normed
            if first_page is None:
                page_no = prov.get("page_no")
                if page_no is not None:
                    first_page = page_no
    if first_bbox is not None:
        chunk_payload.setdefault("bbox", first_bbox)
    if first_page is not None:
        chunk_payload.setdefault("page", first_page)


def build_page_element_map(doc, images_dir: Path, page_offset: int = 0) -> dict[int, list[dict]]:
    from docling_core.types.doc import DocItemLabel, PictureItem, TableItem

    page_elements: dict[int, list[dict]] = defaultdict(list)
    pic_counters:  dict[int, int]        = defaultdict(int)

    for item, level in doc.iterate_items():
        if not getattr(item, "prov", None):
            continue
        for prov in item.prov:
            page_no = prov.page_no + page_offset
            label   = item.label
            elem: dict[str, Any] = {
                "type":  label.value if hasattr(label, "value") else str(label),
                "bbox":  _bbox_dict(prov.bbox),
                "level": level,
            }
            if hasattr(item, "text") and item.text:
                elem["content"] = item.text

            if isinstance(item, TableItem):
                elem["type"] = "table"
                try:
                    elem["content"] = item.export_to_markdown()
                except Exception:
                    elem["content"] = ""
                try:
                    df = item.export_to_dataframe()
                    elem["table_data"] = df.to_dict(orient="records")
                    elem["columns"]    = df.columns.tolist()
                    elem["rows"]       = len(df)
                    elem["cols"]       = len(df.columns)
                except Exception:
                    pass

            elif isinstance(item, PictureItem):
                elem["type"] = "picture"
                pic_counters[page_no] += 1
                idx          = pic_counters[page_no]
                pic_filename = f"page_{page_no}_pic_{idx}.png"
                abs_pic_path = images_dir / pic_filename
                try:
                    img = item.get_image(doc)
                    if img is not None:
                        img.save(str(abs_pic_path))
                        elem["image_ref"] = f"images/{pic_filename}"
                        elem["image_abs"] = str(abs_pic_path)
                except Exception:
                    pass
                try:
                    elem["caption"] = item.caption_text(doc)
                except Exception:
                    pass
                elem["description"] = ""

            elif label == DocItemLabel.FORMULA:
                elem["type"] = "equation"
                text_val = (getattr(item, "text", "") or "").strip()
                if text_val:
                    elem["latex"] = text_val
                else:
                    elem["_needs_vlm"] = True
                elem["latex_vlm"] = ""

            page_elements[page_no].append(elem)

    return dict(page_elements)


# ── Step 3: reading order + page sizes ───────────────────────────────────────

def sort_elements_reading_order(page_elements: dict[int, list[dict]], page_sizes: dict[int, dict]) -> None:
    for page_no, elements in page_elements.items():
        pw = (page_sizes.get(page_no) or {}).get("width", 600)
        elements.sort(key=lambda e, _pw=pw: (
            0 if (e.get("bbox") or {}).get("x0", 0) < _pw / 2 else 1,
            -(e.get("bbox") or {}).get("y0", 0),
        ))


def get_page_sizes(doc, page_offset: int = 0) -> dict[int, dict]:
    sizes: dict[int, dict] = {}
    if not hasattr(doc, "pages"):
        return sizes
    for key, page in doc.pages.items():
        try:
            local_page_no = int(key)
        except (TypeError, ValueError):
            local_page_no = getattr(page, "page_no", None)
        if local_page_no and hasattr(page, "size") and page.size:
            sizes[local_page_no + page_offset] = {
                "width":  round(float(page.size.width),  2),
                "height": round(float(page.size.height), 2),
            }
    return sizes


# ── Step 2: PDF splitting + parallel Docling workers ─────────────────────────

def _split_pdf(pdf_path: Path, n_workers: int, tmp_dir: Path) -> list[tuple[str, int]]:
    tmp_dir.mkdir(parents=True, exist_ok=True)
    chunks: list[tuple[str, int]] = []
    with fitz.open(str(pdf_path)) as src:
        total    = src.page_count
        chunk_sz = max(1, math.ceil(total / n_workers))
        for i in range(n_workers):
            start = i * chunk_sz
            end   = min(start + chunk_sz, total)
            if start >= total:
                break
            sub = fitz.open()
            sub.insert_pdf(src, from_page=start, to_page=end - 1)
            sub_path = tmp_dir / f"chunk_{i:02d}.pdf"
            sub.save(str(sub_path))
            sub.close()
            chunks.append((str(sub_path), start))
    return chunks


def _docling_worker(args: tuple) -> tuple[dict, dict]:
    sub_pdf_str, page_offset, images_dir_str, gpu_id = args
    import os as _os
    _os.environ["CUDA_VISIBLE_DEVICES"] = str(gpu_id)
    result        = run_docling(Path(sub_pdf_str))
    doc           = result.document
    page_elements = build_page_element_map(doc, Path(images_dir_str), page_offset=page_offset)
    page_sizes    = get_page_sizes(doc, page_offset=page_offset)
    return page_elements, page_sizes


# ── Step 4: VLM enrichment ────────────────────────────────────────────────────

def _render_bbox_crop(page_path: Path, bbox: dict, page_size: dict) -> Optional[str]:
    try:
        img        = Image.open(page_path)
        w_px, h_px = img.size
        pw = page_size.get("width")  or 595
        ph = page_size.get("height") or 842
        sx, sy = w_px / pw, h_px / ph
        pad    = 4
        pdf_top = max(bbox["y0"], bbox["y1"])
        pdf_bot = min(bbox["y0"], bbox["y1"])
        x0 = max(0,    int(bbox["x0"] * sx) - pad)
        x1 = min(w_px, int(bbox["x1"] * sx) + pad)
        y0 = max(0,    int((ph - pdf_top) * sy) - pad)
        y1 = min(h_px, int((ph - pdf_bot) * sy) + pad)
        if x1 <= x0 or y1 <= y0:
            return None
        return _image_to_b64(img.crop((x0, y0, x1, y1)))
    except Exception:
        return None


def enrich_elements_with_vlm(
    page_elements: dict[int, list[dict]],
    pages_dir: Path,
    page_sizes: dict[int, dict],
) -> None:
    work_items: list[tuple[int, int, str]] = []
    for page_no, elements in page_elements.items():
        page_img_path = pages_dir / f"page_{page_no}.png"
        psize         = page_sizes.get(page_no, {})
        for idx, elem in enumerate(elements):
            if elem.get("type") != "picture":
                continue
            b64: Optional[str] = None
            abs_path = elem.get("image_abs")
            if abs_path and Path(abs_path).exists():
                try:
                    b64 = _path_to_b64(Path(abs_path))
                except Exception:
                    pass
            if b64 is None and page_img_path.exists():
                b64 = _render_bbox_crop(page_img_path, elem["bbox"], psize)
            if b64:
                work_items.append((page_no, idx, b64))

    if not work_items:
        logger.info("    (no pictures to enrich with VLM)")
        return

    logger.info("    → {} VLM tasks ({} workers)", len(work_items), VLM_WORKERS)

    def _process_image(item: tuple[int, int, str]) -> tuple[int, int, str]:
        page_no, idx, b64 = item
        for attempt in range(3):
            try:
                value = describe_image(b64)
                if not value.startswith("ERROR:"):
                    return page_no, idx, value
                if attempt < 2:
                    time.sleep(2 ** attempt)
            except Exception as exc:
                if attempt < 2:
                    time.sleep(2 ** attempt)
                else:
                    return page_no, idx, f"ERROR: {exc}"
        return page_no, idx, "ERROR: max retries exceeded"

    with ThreadPoolExecutor(max_workers=VLM_WORKERS) as pool:
        futures = {pool.submit(_process_image, item): item for item in work_items}
        for done, future in enumerate(as_completed(futures), 1):
            page_no, idx, value = future.result()
            page_elements[page_no][idx]["description"] = value
            logger.debug("    [{}/{}] p{}: {}", done, len(work_items), page_no,
                         value[:70].replace("\n", " "))


# ── Page image → WebP ─────────────────────────────────────────────────────────

def _convert_page_to_webp(
    page_path: Path,
    max_dim: int,
    quality: int,
) -> tuple[bytes, int, int]:
    img = Image.open(page_path).convert("RGB")
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img   = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        w, h  = img.size
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=quality, method=4)
    return buf.getvalue(), w, h


# ── Layout dict (in-memory, goes to DB as JSONB) ──────────────────────────────

def build_layout_dict(
    page_elements: dict[int, list[dict]],
    page_sizes: dict[int, dict],
    pdf_name: str,
) -> dict:
    all_pages: list[dict] = []
    for page_no, elements in sorted(page_elements.items()):
        clean = [{k: v for k, v in e.items() if k not in ("image_abs", "_needs_vlm")}
                 for e in elements]
        all_pages.append({
            "pdf_name":      pdf_name,
            "page_no":       page_no,
            **page_sizes.get(page_no, {}),
            "element_count": len(clean),
            "elements":      clean,
        })
    return {"pages": all_pages, "total_pages": len(all_pages)}


# ── Markdown export ───────────────────────────────────────────────────────────

def _extract_fig_id(caption: str) -> str:
    m = re.match(r"(Fig(?:ure)?\.?\s*\d+[a-zA-Z]?)", caption, re.IGNORECASE)
    return m.group(1) if m else ""


def _picture_md_block(elem: dict) -> list[str]:
    ref  = elem.get("image_ref", "")
    cap  = (elem.get("caption") or "").strip()
    desc = (elem.get("description") or "").strip()
    img_type = (desc.split("\n")[0].strip().rstrip(" —:-") if desc else None) or cap or "figure"
    fig_id   = _extract_fig_id(cap)
    lines: list[str] = []
    lines.append(f"\n![{img_type}]({ref})\n" if ref else "\n<!-- figure: image not extracted -->\n")
    if fig_id:
        lines.append(f"\n**Figure:** {fig_id}")
    if cap:
        lines.append(f"**Caption:** {cap}")
    if desc:
        lines.append(f"**Description:**\n{desc}")
    lines.append("")
    return lines


def build_page_markdown(page_no: int, elements: list[dict]) -> str:
    lines: list[str] = []
    claimed_captions = {
        (e.get("caption") or "").strip()
        for e in elements if e.get("type") == "picture" and e.get("caption")
    }
    for elem in elements:
        t       = elem.get("type", "")
        content = (elem.get("content") or "").strip()
        if t in ("title", "section_header"):
            depth = 1 if t == "title" else 2
            lines.append(f"\n{'#' * depth} {content}\n")
        elif t == "table":
            lines.append(f"\n{content}\n")
        elif t == "equation":
            latex = (elem.get("latex_vlm") or elem.get("latex") or content or "").strip()
            if latex and latex.upper() != "UNREADABLE":
                lines.append(f"\n$$\n{latex}\n$$\n")
            else:
                lines.append("\n<!-- equation: LaTeX could not be extracted -->\n")
        elif t == "code":
            lines.append(f"\n```\n{content}\n```\n")
        elif t == "list_item":
            lines.append(f"- {content}")
        elif t == "caption":
            if content not in claimed_captions:
                lines.append(f"\n*{content}*\n")
        elif t == "picture":
            lines.extend(_picture_md_block(elem))
        elif content:
            lines.append(f"\n{content}\n")
    return "\n".join(lines)


def export_full_markdown(
    page_elements: dict[int, list[dict]],
    pages_md_dir: Path,
    out_dir: Path,
    pdf_name: str,
) -> None:
    parts: list[str] = []
    for page_no in sorted(page_elements.keys()):
        p = pages_md_dir / f"page_{page_no}.md"
        if p.exists():
            parts.append(p.read_text(encoding="utf-8"))
    (out_dir / f"{pdf_name}.md").write_text("\n\n---\n\n".join(parts), encoding="utf-8")


# ── Chunking ──────────────────────────────────────────────────────────────────

def _to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_to_jsonable(item) for item in value]
    if hasattr(value, "model_dump"):
        return _to_jsonable(value.model_dump(mode="json"))
    if is_dataclass(value):
        return _to_jsonable(asdict(value))
    if hasattr(value, "__dict__"):
        return _to_jsonable(vars(value))
    return str(value)


def _build_chunks(
    dl_doc,
    chunker_type: str,
    tokenizer: str,
    max_tokens: Optional[int],
    merge_peers: bool,
    include_raw_text: bool,
) -> list[dict[str, Any]]:
    from docling.chunking import HierarchicalChunker, HybridChunker

    if chunker_type == "hybrid":
        kwargs: dict[str, Any] = {"tokenizer": tokenizer, "merge_peers": merge_peers}
        if max_tokens is not None:
            kwargs["max_tokens"] = max_tokens
        chunker = HybridChunker(**kwargs)
    else:
        chunker = HierarchicalChunker()

    chunks: list[dict[str, Any]] = []
    for index, chunk in enumerate(chunker.chunk(dl_doc=dl_doc)):
        contextualized_text = chunker.contextualize(chunk=chunk)
        raw_text = getattr(chunk, "text", None)
        chunk_payload = _to_jsonable(chunk)
        chunk_payload.update({
            "chunk_index": index,
            "chunker":     chunker_type,
            "text":        contextualized_text,
        })
        if include_raw_text:
            chunk_payload["raw_text"] = raw_text
        _normalize_chunk_bboxes(chunk_payload)
        chunks.append(chunk_payload)
    return chunks


def build_figure_chunks(page_elements: dict[int, list[dict]]) -> list[dict[str, Any]]:
    figure_chunks: list[dict[str, Any]] = []
    for page_no in sorted(page_elements.keys()):
        current_heading = ""
        for elem in page_elements[page_no]:
            t = elem.get("type", "")
            if t in ("title", "section_header"):
                current_heading = (elem.get("content") or "").strip()
            elif t == "picture":
                desc = (elem.get("description") or "").strip()
                if not desc:
                    continue
                cap   = (elem.get("caption") or "").strip()
                parts = [p for p in [current_heading, cap, desc] if p]
                figure_chunks.append({
                    "chunker":        "figure",
                    "type":           "figure",
                    "page":           page_no,
                    "parent_heading": current_heading,
                    "caption":        cap,
                    "image_ref":      elem.get("image_ref", ""),
                    "bbox":           elem.get("bbox"),
                    "text":           "\n".join(parts),
                })
    return figure_chunks


# ── Main entry point ──────────────────────────────────────────────────────────

def run(
    doc_id: str,
    pdf_path: str,
    output_dir: str,
    db: Session,
    skip_vlm: bool = False,
    n_workers: Optional[int] = None,
) -> dict:
    """
    Run the full ingestion pipeline for one document.

    Updates document status in DB at each stage.
    Stores page images as WebP in document_pages table.
    Saves layout_json, chunks_json, ingestion_report to documents table.

    Returns dict with 'chunks_payload' key used by the indexer.
    """
    from app import crud

    pdf_path_obj = Path(pdf_path)
    out          = Path(output_dir)
    pdf_name     = pdf_path_obj.stem

    pages_dir      = out / "pages"       # temp PNG files — deleted after WebP conversion
    pages_webp_dir = out / "pages_webp"  # permanent WebP files on disk
    ocr_dir        = out / "pages_md"    # permanent per-page markdown
    images_dir     = out / "images"      # permanent figure images

    for d in (pages_dir, pages_webp_dir, ocr_dir, images_dir):
        d.mkdir(parents=True, exist_ok=True)

    log = logger.bind(doc_id=doc_id, pdf=pdf_name)
    start_ts = time.perf_counter()

    actual_workers = n_workers or DOCLING_WORKERS

    log.info("Pipeline start | workers={} vlm={}", actual_workers, not skip_vlm)

    # ── Stage CONVERTING ──────────────────────────────────────────────────────
    crud.update_document_status(db, doc_id, "CONVERTING")

    log.info("[1/6] Rendering page images …")
    page_paths = render_pages(pdf_path_obj, pages_dir, dpi=PAGE_RENDER_DPI)
    log.info("      {} pages rendered", len(page_paths))

    log.info("[2/6] Parallel Docling OCR ({} workers) …", actual_workers)
    tmp_dir = Path(tempfile.mkdtemp(prefix="docling_split_"))
    try:
        chunks_info = _split_pdf(pdf_path_obj, actual_workers, tmp_dir)
        _gpus = (os.environ.get("CUDA_VISIBLE_DEVICES") or "0").split(",")
        worker_args = [
            (sp, off, str(images_dir), _gpus[i % len(_gpus)])
            for i, (sp, off) in enumerate(chunks_info)
        ]

        page_elements: dict[int, list[dict]] = {}
        page_sizes:    dict[int, dict]       = {}

        with ProcessPoolExecutor(
            max_workers=len(chunks_info),
            initializer=_child_init,
            mp_context=_mp.get_context("spawn"),
        ) as pool:
            futures = {pool.submit(_docling_worker, a): a for a in worker_args}
            for fut in as_completed(futures):
                pe, ps = fut.result()
                page_elements.update(pe)
                page_sizes.update(ps)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    log.info("      Docling complete ({} pages)", len(page_elements))

    log.info("[3/6] Reading-order sort …")
    sort_elements_reading_order(page_elements, page_sizes)

    # ── Stage PARSING ─────────────────────────────────────────────────────────
    crud.update_document_status(db, doc_id, "PARSING")

    if skip_vlm:
        log.info("[4/6] VLM enrichment … SKIPPED")
    else:
        log.info("[4/6] VLM enrichment via {} …", settings.LLM_PROVIDER)
        enrich_elements_with_vlm(page_elements, pages_dir, page_sizes)
        log.info("      VLM enrichment complete")

    # Convert page PNGs to WebP, save to disk, store path in document_pages
    log.info("      Storing page images as WebP …")
    page_records = []
    for page_no, page_path in sorted(page_paths.items()):
        if page_path.exists():
            webp_bytes, w, h = _convert_page_to_webp(page_path, PAGE_IMAGE_MAX_DIM, PAGE_IMAGE_WEBP_QUALITY)
            webp_filename = f"page_{page_no}.webp"
            webp_file     = pages_webp_dir / webp_filename
            webp_file.write_bytes(webp_bytes)
            page_records.append({
                "page_no":    page_no,
                "image_path": f"pages_webp/{webp_filename}",
                "width_px":   w,
                "height_px":  h,
            })
    crud.insert_document_pages(db, doc_id, page_records)
    shutil.rmtree(pages_dir, ignore_errors=True)   # temp PNGs no longer needed
    log.info("      {} page images saved to disk + DB", len(page_records))

    # Write per-page markdown (permanent, on disk)
    for page_no, elements in sorted(page_elements.items()):
        md_txt = build_page_markdown(page_no, elements)
        (ocr_dir / f"page_{page_no}.md").write_text(md_txt, encoding="utf-8")

    export_full_markdown(page_elements, ocr_dir, out, pdf_name)
    log.info("      Markdown written to disk")

    # ── Stage CHUNKING ────────────────────────────────────────────────────────
    crud.update_document_status(db, doc_id, "CHUNKING")

    log.info("[5/6] Fast Docling pass for chunking …")
    fast_doc = run_docling_fast(pdf_path_obj).document

    log.info("[6/6] Building chunks ({}) …", CHUNKER_TYPE)
    chunks = _build_chunks(
        dl_doc=fast_doc,
        chunker_type=CHUNKER_TYPE,
        tokenizer=TOKENIZER,
        max_tokens=MAX_TOKENS,
        merge_peers=MERGE_PEERS,
        include_raw_text=INCLUDE_RAW_TEXT,
    )
    figure_chunks = build_figure_chunks(page_elements)

    if figure_chunks:
        def _chunk_page(c: dict) -> int:
            try:
                return c["meta"]["doc_items"][0]["prov"][0]["page_no"]
            except (KeyError, IndexError, TypeError):
                return 0

        reg_by_page: dict[int, list[dict]] = defaultdict(list)
        for c in chunks:
            reg_by_page[_chunk_page(c)].append(c)

        fig_by_page: dict[int, list[dict]] = defaultdict(list)
        for c in figure_chunks:
            fig_by_page[c["page"]].append(c)

        all_chunks: list[dict] = []
        for page_no in sorted(set(list(reg_by_page) + list(fig_by_page))):
            all_chunks.extend(reg_by_page.get(page_no, []))
            all_chunks.extend(fig_by_page.get(page_no, []))
        for i, c in enumerate(all_chunks):
            c["chunk_index"] = i
            c["chunk_id"] = str(uuid.uuid4())
        chunks = all_chunks

    log.info("      {} chunks ({} figure)", len(chunks), len(figure_chunks))

    # ── Build output dicts ────────────────────────────────────────────────────
    layout_dict = build_layout_dict(page_elements, page_sizes, pdf_name)

    chunks_payload = _to_jsonable({
        "source":             str(pdf_path_obj),
        "document_name":      pdf_name,
        "chunker":            CHUNKER_TYPE,
        "chunk_count":        len(chunks),
        "figure_chunk_count": len(figure_chunks),
        "vlm_enriched":       not skip_vlm,
        "tokenizer":          TOKENIZER,
        "max_tokens":         MAX_TOKENS,
        "merge_peers":        MERGE_PEERS,
        "chunks":             chunks,
    })

    elapsed = round(time.perf_counter() - start_ts, 2)
    type_counts: dict[str, int] = defaultdict(int)
    for elems in page_elements.values():
        for e in elems:
            type_counts[e.get("type", "other")] += 1

    ingestion_report = {
        "pdf":            str(pdf_path_obj),
        "strategy":       "parallel_hi_res",
        "vlm_model":      "disabled" if skip_vlm else settings.OPENROUTER_VLM_MODEL if settings.LLM_PROVIDER == "openrouter" else settings.OLLAMA_VLM_MODEL,
        "total_elements": sum(type_counts.values()),
        "total_pages":    max(page_elements.keys(), default=0),
        "element_counts": dict(type_counts),
        "chunker":        CHUNKER_TYPE,
        "chunk_count":    len(chunks),
        "runtime": {
            "elapsed_seconds": elapsed,
            "docling_workers": actual_workers,
            "vlm_mode":        "disabled" if skip_vlm else "sequential",
        },
        "outputs": {
            "pages_md_dir": str(ocr_dir),
            "full_md":      str(out / f"{pdf_name}.md"),
            "images_dir":   str(images_dir),
        },
    }

    # Save to DB (status stays CHUNKING — indexer will set COMPLETED)
    crud.save_pipeline_result(db, doc_id, layout_dict, chunks_payload, ingestion_report)
    log.info("Pipeline complete in {}s", elapsed)

    return {"chunks_payload": chunks_payload}
