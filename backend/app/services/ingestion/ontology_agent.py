"""
Ontology Agent — determines the knowledge graph schema for a document.

Flow:
  1. Get domain from summarizer result (or classify from chunks as fallback)
  2. Load existing ontology for that domain
  3. If domain is saturated → run drift check (LLM compares doc vs corpus)
       drift detected  → run full extraction, reset saturation
       no drift        → reuse existing ontology (skip pipeline)
  4. If not saturated → run batch extraction + reconcile
  5. Update saturation window, regenerate corpus summary if new types added
  6. Save updated ontology YAML, return resolved schema

Entry point:
    ontology = run(chunks_payload, summary_result)
    # returns {"entity_types": [...], "relationship_types": [...]}
"""
from __future__ import annotations

import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

from app.core.telemetry import emit_event

import yaml
from loguru import logger

from app.services.ingestion.config import (
    GRAPH_MODEL,
    ONTOLOGY_DIR,
    ONTOLOGY_BATCH_SIZE,
    ONTOLOGY_MAX_ENTITY_TYPES,
    ONTOLOGY_MAX_REL_TYPES,
    ONTOLOGY_WORKERS,
    SATURATION_WINDOW,
    SATURATION_THRESHOLD,
)
from app.services.llm_client import call_text

_PROMPTS = Path(__file__).parent / "prompts"
_lock = threading.Lock()


# ── LLM helper ───────────────────────────────────────────────────────────────

def _call(prompt: str, timeout: int = 300, stage: str = "ontology") -> str:
    return call_text([{"role": "user", "content": prompt}], model=GRAPH_MODEL, timeout=timeout, stage=stage)


def _parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        return json.loads(m.group())
    raise ValueError(f"No JSON in response: {text[:200]}")


def _load_prompt(name: str) -> str:
    return yaml.safe_load((_PROMPTS / name).read_text())["system"]


# ── Ontology file helpers ─────────────────────────────────────────────────────

def _ontology_path(domain: str) -> Path:
    return Path(ONTOLOGY_DIR) / f"{domain}.yaml"


def _load_ontology(domain: str) -> dict | None:
    p = _ontology_path(domain)
    return yaml.safe_load(p.read_text()) if p.exists() else None


def _save_ontology(domain: str, doc_name: str, data: dict) -> None:
    Path(ONTOLOGY_DIR).mkdir(parents=True, exist_ok=True)
    p = _ontology_path(domain)
    existing = yaml.safe_load(p.read_text()) if p.exists() else {}
    data["version"] = existing.get("version", 0) + 1
    data["domain"] = domain
    data["updated_at"] = datetime.now().strftime("%Y-%m-%d")
    data["last_document"] = doc_name
    p.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))


# ── Saturation helpers ────────────────────────────────────────────────────────

def _is_saturated(ontology: dict) -> bool:
    sat = ontology.get("saturation", {})
    window = sat.get("window", [])
    if len(window) < SATURATION_WINDOW:
        return False
    return sum(window[-SATURATION_WINDOW:]) <= SATURATION_THRESHOLD


def _update_saturation(ontology: dict, new_type_count: int, existing: dict | None) -> dict:
    old_window = (existing or {}).get("saturation", {}).get("window", [])
    docs_processed = (existing or {}).get("saturation", {}).get("docs_processed", 0)
    new_window = (old_window + [new_type_count])[-SATURATION_WINDOW:]
    is_sat = len(new_window) >= SATURATION_WINDOW and sum(new_window) <= SATURATION_THRESHOLD
    ontology["saturation"] = {
        "window": new_window,
        "docs_processed": docs_processed + 1,
        "is_saturated": is_sat,
    }
    if is_sat:
        logger.info("OntologyAgent: domain '{}' reached saturation (window={}, sum={})",
                    ontology.get("domain"), new_window, sum(new_window))
    return ontology


# ── Corpus summary ────────────────────────────────────────────────────────────

def _generate_corpus_summary(domain: str, ontology: dict) -> str:
    template = _load_prompt("ontology_corpus_summary.yaml")
    prompt = (
        template
        .replace("{domain}", domain)
        .replace("{entity_types}", ", ".join(ontology.get("entity_types", [])))
        .replace("{relationship_types}", ", ".join(ontology.get("relationship_types", [])))
    )
    try:
        return _call(prompt).strip()
    except Exception as exc:
        logger.warning("OntologyAgent: corpus summary generation failed — {}", exc)
        return ""


# ── Domain drift check ────────────────────────────────────────────────────────

def _has_domain_drift(existing: dict, summary_result: dict) -> bool:
    corpus_summary = existing.get("corpus_summary", "")
    if not corpus_summary:
        return False

    doc_summary  = summary_result.get("summary", "")
    key_concepts = summary_result.get("key_concepts", [])
    if not doc_summary:
        return False

    template = _load_prompt("ontology_drift_check.yaml")
    prompt = (
        template
        .replace("{corpus_summary}", corpus_summary)
        .replace("{doc_summary}", doc_summary)
        .replace("{key_concepts}", ", ".join(key_concepts) if key_concepts else "N/A")
    )
    try:
        result = _parse_json(_call(prompt))
        is_drift = result.get("is_drift", False)
        logger.info("OntologyAgent: drift_check is_drift={} reason='{}'",
                    is_drift, result.get("reason", ""))
        return bool(is_drift)
    except Exception as exc:
        logger.warning("OntologyAgent: drift check failed ({}) — assuming no drift", exc)
        return False


# ── Domain classification fallback ───────────────────────────────────────────

def _classify_domain_from_chunks(chunks: list[dict]) -> str:
    step = max(1, len(chunks) // 5)
    samples = "\n\n---\n\n".join(chunks[i]["text"][:300] for i in range(0, len(chunks), step))[:5]
    prompt = (
        "Given these text samples, identify the domain in ONE word from: "
        "academic_research, nonfiction_book, technical_documentation, legal, medical_clinical, "
        "financial, business_corporate, news_journalism, biography_memoir, study_material, general\n\n"
        f"TEXT SAMPLES:\n{samples}\n\nReturn ONLY the domain name."
    )
    try:
        domain = _call(prompt).strip().lower().split()[0]
        domain = re.sub(r"[^a-z_]", "", domain)
        return domain or "general"
    except Exception:
        return "general"


# ── Batch extraction ──────────────────────────────────────────────────────────

_batch_done  = 0
_batch_total = 0
_prog_lock   = threading.Lock()

SAMPLE_PCT   = 0.25
SAMPLE_CAP   = 100
SAMPLE_FLOOR = 20


def _sample_chunks(chunks: list) -> list:
    n = len(chunks)
    target = min(SAMPLE_CAP, max(SAMPLE_FLOOR, int(n * SAMPLE_PCT)))
    if target >= n:
        return chunks
    step = n / target
    return [chunks[int(i * step)] for i in range(target)]


def _extract_batch(batch_idx: int, batch: list[dict]) -> dict | None:
    global _batch_done
    chunks_text = "\n\n---\n\n".join(
        f"[chunk {c['chunk_index']}]\n{c['text'][:600]}" for c in batch
    )
    template = _load_prompt("ontology_batch.yaml")
    prompt   = template.replace("{chunks_text}", chunks_text)
    try:
        result = _parse_json(_call(prompt))
        with _prog_lock:
            _batch_done += 1
            print(f"  ontology batch {_batch_done}/{_batch_total}", end="\r")
        return {
            "entity_types":        result.get("entity_types", []),
            "relationship_types":  result.get("relationship_types", []),
        }
    except Exception as exc:
        logger.warning("OntologyAgent: batch {} failed — {}", batch_idx, exc)
        with _prog_lock:
            _batch_done += 1
        return None


def _extract_all_batches(chunks: list[dict]) -> list[dict]:
    global _batch_done, _batch_total
    batches = [chunks[i:i+ONTOLOGY_BATCH_SIZE] for i in range(0, len(chunks), ONTOLOGY_BATCH_SIZE)]
    _batch_total = len(batches)
    _batch_done  = 0
    logger.info("OntologyAgent: {} batches × ~{} chunks ({} workers)",
                len(batches), ONTOLOGY_BATCH_SIZE, ONTOLOGY_WORKERS)
    results = []
    with ThreadPoolExecutor(max_workers=ONTOLOGY_WORKERS) as pool:
        futures = {pool.submit(_extract_batch, i, b): i for i, b in enumerate(batches)}
        for future in as_completed(futures):
            r = future.result()
            if r:
                results.append(r)
    print()
    return results


# ── Reconcile ─────────────────────────────────────────────────────────────────

def _reconcile(proposals: list[dict], domain: str, existing: dict | None) -> dict:
    new_ent = sorted(set(t for p in proposals for t in p.get("entity_types", [])))
    new_rel = sorted(set(t for p in proposals for t in p.get("relationship_types", [])))

    if existing:
        template = _load_prompt("ontology_reconcile_update.yaml")
        prompt = (
            template
            .replace("{domain}", domain)
            .replace("{existing_entity_types}", ", ".join(existing["entity_types"]))
            .replace("{existing_rel_types}",    ", ".join(existing["relationship_types"]))
            .replace("{n_batches}",             str(len(proposals)))
            .replace("{new_entity_types}",      ", ".join(new_ent))
            .replace("{new_rel_types}",         ", ".join(new_rel))
            .replace("{max_ent}",               str(ONTOLOGY_MAX_ENTITY_TYPES))
            .replace("{max_rel}",               str(ONTOLOGY_MAX_REL_TYPES))
        )
    else:
        template = _load_prompt("ontology_reconcile.yaml")
        prompt = (
            template
            .replace("{domain}",            domain)
            .replace("{n_batches}",         str(len(proposals)))
            .replace("{all_entity_types}",  ", ".join(new_ent))
            .replace("{all_rel_types}",     ", ".join(new_rel))
            .replace("{max_ent}",           str(ONTOLOGY_MAX_ENTITY_TYPES))
            .replace("{max_rel}",           str(ONTOLOGY_MAX_REL_TYPES))
        )

    result     = _parse_json(_call(prompt))
    entity_types = sorted(set(result.get("entity_types", [])))
    rel_types    = sorted(set(result.get("relationship_types", [])))

    # safety net: existing types are never dropped
    if existing:
        entity_types = sorted(set(entity_types) | set(existing["entity_types"]))
        rel_types    = sorted(set(rel_types)    | set(existing["relationship_types"]))

    return {"entity_types": entity_types, "relationship_types": rel_types}


# ── Main entry point ──────────────────────────────────────────────────────────

def _upsert_ontology_to_db(collection_id: str, ontology: dict, db) -> None:
    """Store ontology entity/rel types in collections.ontologies JSONB column."""
    try:
        from sqlalchemy import text as sa_text
        db.execute(
            sa_text(
                "UPDATE collections SET ontologies = CAST(:data AS jsonb) "
                "WHERE id = CAST(:cid AS uuid)"
            ),
            {
                "data": json.dumps({
                    "entity_types":       ontology.get("entity_types", []),
                    "relationship_types": ontology.get("relationship_types", []),
                }),
                "cid": collection_id,
            },
        )
        db.commit()
        logger.info("OntologyAgent: ontology persisted to collections.ontologies for collection_id={}", collection_id)
    except Exception as exc:
        logger.warning("OntologyAgent: failed to persist ontology to DB — {}", exc)


def run(chunks_payload: dict, summary_result: dict | None,
        collection_id: str | None = None, db=None) -> dict:
    """
    Resolve and return the ontology for a document.

    Args:
        chunks_payload:  pipeline output (must contain "chunks" list)
        summary_result:  dict from summarizer with keys:
                         summary, key_concepts, assigned_domain,
                         is_new_domain, confidence
        collection_id:   UUID string of the collection (used to persist ontology to DB)
        db:              SQLAlchemy session (optional, used alongside collection_id)

    Returns:
        {"entity_types": [...], "relationship_types": [...]}
    """
    chunks   = [c for c in chunks_payload.get("chunks", []) if c.get("text", "").strip()]
    doc_name = chunks_payload.get("document_name", "unknown")

    # Step 1: resolve domain
    domain = None
    if summary_result:
        domain = summary_result.get("assigned_domain")
    if not domain:
        logger.info("OntologyAgent: no domain from summarizer — classifying from chunks")
        domain = _classify_domain_from_chunks(chunks)
    logger.info("OntologyAgent: domain='{}' doc='{}'", domain, doc_name)

    existing = _load_ontology(domain)

    # Step 2: saturation check
    if existing and _is_saturated(existing):
        if summary_result and not _has_domain_drift(existing, summary_result):
            logger.info("OntologyAgent: saturated + no drift — reusing existing ontology")
            result = {
                "entity_types":       existing["entity_types"],
                "relationship_types": existing["relationship_types"],
            }
            if collection_id and db:
                _upsert_ontology_to_db(collection_id, result, db)
            emit_event("ingestion_stage", stage="ontology", status="success",
                       collection_id=collection_id or "",
                       reused=True, domain=domain,
                       entity_type_count=len(result["entity_types"]),
                       rel_type_count=len(result["relationship_types"]))
            return result
        logger.info("OntologyAgent: saturated but drift detected — running extraction")

    # Step 3: sample + batch extract
    extraction_chunks = _sample_chunks(chunks)
    logger.info("OntologyAgent: extracting from {}/{} chunks", len(extraction_chunks), len(chunks))
    proposals = _extract_all_batches(extraction_chunks)
    if not proposals:
        if existing:
            logger.warning("OntologyAgent: no proposals — reusing existing ontology")
            return {
                "entity_types":       existing["entity_types"],
                "relationship_types": existing["relationship_types"],
            }
        raise RuntimeError("OntologyAgent: extraction produced no proposals and no existing ontology")

    # Step 4: reconcile
    logger.info("OntologyAgent: reconciling {} proposals", len(proposals))
    ontology = _reconcile(proposals, domain, existing=existing)

    # Step 5: count new types for saturation tracking
    if existing:
        added_ent = len(set(ontology["entity_types"]) - set(existing["entity_types"]))
        added_rel = len(set(ontology["relationship_types"]) - set(existing["relationship_types"]))
        new_type_count = added_ent + added_rel
        logger.info("OntologyAgent: +{} entity types, +{} rel types", added_ent, added_rel)
    else:
        new_type_count = len(ontology["entity_types"]) + len(ontology["relationship_types"])

    ontology = _update_saturation(ontology, new_type_count, existing)

    # Step 6: regenerate corpus summary when types change
    if not existing or new_type_count > 0:
        logger.info("OntologyAgent: regenerating corpus summary")
        ontology["corpus_summary"] = _generate_corpus_summary(domain, ontology)
    else:
        ontology["corpus_summary"] = existing.get("corpus_summary", "")

    # Step 7: save YAML
    _save_ontology(domain, doc_name, ontology)
    logger.info("OntologyAgent: saved ontology for domain='{}' v{}", domain, ontology.get("version"))

    result = {
        "entity_types":       ontology["entity_types"],
        "relationship_types": ontology["relationship_types"],
    }

    # Step 8: persist to collections.ontologies in DB
    if collection_id and db:
        _upsert_ontology_to_db(collection_id, result, db)

    emit_event("ingestion_stage", stage="ontology", status="success",
               collection_id=collection_id or "",
               reused=False, domain=domain,
               entity_type_count=len(result["entity_types"]),
               rel_type_count=len(result["relationship_types"]))

    return result
