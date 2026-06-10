"""
Document summarizer + domain classifier — two-pass system.

Pass 1: Summarize + classify against existing domain.yaml
        If no match → propose new domain name + definition
Pass 2: (only when Pass 1 proposes new domain)
        Normalize proposed name to field-level, check for subdomain overlap,
        update existing definition if needed, or confirm new domain.

Called by the worker after indexing completes. Writes one row to doc_summary.
Retries up to 3 times on Ollama failure; on permanent failure writes a null row
so the doc_summary entry still exists (with nulls) and can be re-triggered later.
"""
from __future__ import annotations

import json
import random
import re
import time
from pathlib import Path
from typing import Optional

from loguru import logger
from sqlalchemy.orm import Session

from app.services.llm_client import call_text

PROMPT1_YAML = Path(__file__).parent / "prompts" / "summarizer_pass1.yaml"
PROMPT2_YAML = Path(__file__).parent / "prompts" / "summarizer_pass2.yaml"
DOMAIN_YAML  = Path(__file__).parent / "domain.yaml"
MAX_CHUNKS   = 20
MAX_RETRIES  = 3


# ── Domain file helpers ───────────────────────────────────────────────────────

def _load_domains() -> dict:
    import yaml
    if not DOMAIN_YAML.exists():
        return {}
    with open(DOMAIN_YAML) as f:
        data = yaml.safe_load(f) or {}
    return data.get("domains", {})


def _save_domains(domains: dict) -> None:
    import yaml
    with open(DOMAIN_YAML, "w") as f:
        yaml.dump({"domains": domains}, f,
                  default_flow_style=False, allow_unicode=True, sort_keys=False)


def _add_domain(domains: dict, name: str, definition: str) -> dict:
    from datetime import datetime, timezone
    if name not in domains:
        domains[name] = {
            "definition": definition,
            "added_at":   datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "doc_count":  1,
        }
    else:
        domains[name]["doc_count"] = domains[name].get("doc_count", 0) + 1
    return domains


def _increment_count(domains: dict, name: str) -> dict:
    if name in domains:
        domains[name]["doc_count"] = domains[name].get("doc_count", 0) + 1
    return domains


def _update_definition(domains: dict, name: str, new_definition: str) -> dict:
    if name in domains:
        domains[name]["definition"] = new_definition
    return domains


# ── Prompt / context helpers ──────────────────────────────────────────────────

def _build_domain_list(domains: dict) -> str:
    if not domains:
        return "(none)"
    return "\n".join(f"{name}: {info['definition']}" for name, info in domains.items())


def _build_domain_instruction(domains: dict) -> str:
    if not domains:
        return (
            "No known domains exist yet. Since the domain list is empty, "
            "set \"assigned_domain\" to null, \"is_new_domain\" to true, "
            "and propose a new domain name and definition."
        )
    return (
        "You are given a list of known domains, each with a definition. "
        "Assign the document to the SINGLE most relevant domain."
    )


def _get_heading(chunk: dict) -> str:
    headings = (chunk.get("meta") or {}).get("headings") or []
    if headings:
        return headings[0]
    breadcrumb = chunk.get("section_breadcrumb") or chunk.get("section") or ""
    if isinstance(breadcrumb, list):
        breadcrumb = breadcrumb[0] if breadcrumb else ""
    return breadcrumb or "__no_heading__"


def _sample_chunks(chunks: list, max_chunks: int = MAX_CHUNKS) -> list:
    groups: dict[str, list] = {}
    for chunk in chunks:
        groups.setdefault(_get_heading(chunk), []).append(chunk)
    candidates = [random.choice(group) for group in groups.values()]
    if len(candidates) > max_chunks:
        candidates = random.sample(candidates, max_chunks)
    return candidates


def _build_context(selected: list) -> str:
    parts = []
    for chunk in selected:
        heading = _get_heading(chunk).replace("__no_heading__", "No heading")
        parts.append(f"[{heading}]\n{chunk.get('text', '').strip()}")
    return "\n\n---\n\n".join(parts)


# ── LLM ──────────────────────────────────────────────────────────────────────


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


def _call_with_retry(model: str, prompt: str, log, label: str) -> Optional[dict]:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            raw = call_text([{"role": "user", "content": prompt}], model=model)
            return _parse_json(raw)
        except Exception as exc:
            log.error("{} attempt {}/{} failed — {}", label, attempt, MAX_RETRIES, exc)
            if attempt < MAX_RETRIES:
                time.sleep(2 ** attempt)
    return None


# ── Pass 2 ────────────────────────────────────────────────────────────────────

def _run_pass2(
    model: str,
    domains: dict,
    proposed_domain: str,
    proposed_definition: str,
    log,
) -> Optional[dict]:
    import yaml
    try:
        with open(PROMPT2_YAML) as f:
            template = yaml.safe_load(f)["system"]
    except Exception as exc:
        log.error("Summarizer Pass 2: failed to load prompt_pass2.yaml — {}", exc)
        return None

    prompt = (
        template
        .replace("{domain_list}",         _build_domain_list(domains))
        .replace("{proposed_domain}",     proposed_domain)
        .replace("{proposed_definition}", proposed_definition or "")
    )

    log.info("Summarizer Pass 2: normalizing proposed domain '{}'", proposed_domain)
    result = _call_with_retry(model, prompt, log, "Summarizer Pass 2")
    if result:
        log.info("Summarizer Pass 2: action='{}' final_domain='{}'",
                 result.get("action"), result.get("final_domain"))
    return result


# ── Null writer ───────────────────────────────────────────────────────────────

def _write_null(db: Session, doc_id: str, file_name: str, model_used: str, sampled_indices) -> None:
    from app import crud
    crud.save_doc_summary(
        db, doc_id, file_name,
        summary=None, assigned_domain=None, is_new_domain=None,
        proposed_domain=None, confidence=None,
        needs_graph=None, graph_reason=None,
        model_used=model_used, sampled_chunk_indices=sampled_indices,
    )


# ── Main entry point ──────────────────────────────────────────────────────────

def run(doc_id: str, file_name: str, chunks_payload: dict, db: Session) -> dict | None:
    from app import crud
    from app.services.ingestion.config import SUMMARIZER_MODEL

    log = logger.bind(doc_id=doc_id)
    log.info("Summarizer ▶ '{}' using {}", file_name, SUMMARIZER_MODEL)

    text_chunks = [c for c in chunks_payload.get("chunks", []) if c.get("text", "").strip()]
    if not text_chunks:
        log.warning("Summarizer: no text chunks — writing null row")
        _write_null(db, doc_id, file_name, SUMMARIZER_MODEL, None)
        return None

    selected        = _sample_chunks(text_chunks)
    sampled_indices = [c.get("chunk_index") for c in selected]

    # ── Load prompt + domains ─────────────────────────────────────────────────
    try:
        import yaml
        with open(PROMPT1_YAML) as f:
            template = yaml.safe_load(f)["system"]
    except Exception as exc:
        log.error("Summarizer: failed to load prompt.yaml — {}", exc)
        _write_null(db, doc_id, file_name, SUMMARIZER_MODEL, sampled_indices)
        return

    domains = _load_domains()
    log.info("Summarizer: {} domain(s) in registry", len(domains))

    prompt = (
        template
        .replace("{domain_instruction}",           _build_domain_instruction(domains))
        .replace("{domain_list_with_definitions}",  _build_domain_list(domains))
        .replace("{summary_context}",              _build_context(selected))
    )

    # ── Pass 1 ────────────────────────────────────────────────────────────────
    p1 = _call_with_retry(SUMMARIZER_MODEL, prompt, log, "Summarizer Pass 1")
    if p1 is None:
        log.error("Summarizer Pass 1: all retries exhausted — writing null row")
        _write_null(db, doc_id, file_name, SUMMARIZER_MODEL, sampled_indices)
        return None

    log.info("Summarizer Pass 1: assigned='{}' is_new={} proposed='{}' confidence={}",
             p1.get("assigned_domain"), p1.get("is_new_domain"),
             p1.get("proposed_domain"), p1.get("confidence"))

    # ── Determine final domain ────────────────────────────────────────────────
    final_domain     = p1.get("assigned_domain")
    final_is_new     = p1.get("is_new_domain", False)

    if p1.get("is_new_domain") and p1.get("proposed_domain"):
        # ── Pass 2 ────────────────────────────────────────────────────────────
        p2 = _run_pass2(
            SUMMARIZER_MODEL,
            domains,
            p1["proposed_domain"],
            p1.get("proposed_definition") or "",
            log,
        )

        if p2 is None:
            # Pass 2 failed — fall back to Pass 1 proposed domain as-is
            log.warning("Summarizer Pass 2 failed — falling back to Pass 1 proposal")
            domains = _add_domain(domains, p1["proposed_domain"],
                                  p1.get("proposed_definition") or "")
            _save_domains(domains)
            final_domain = p1["proposed_domain"]
            final_is_new = True
        else:
            action       = p2.get("action", "confirm_new")
            p2_domain    = p2.get("final_domain")

            # Hallucination guard: Pass 2 claims map_to_existing but domain not in registry
            if action == "map_to_existing" and p2_domain not in domains:
                log.warning(
                    "Summarizer Pass 2: '{}' not in registry — treating as confirm_new",
                    p2_domain,
                )
                action = "confirm_new"

            if action == "map_to_existing":
                # Check if definition needs updating
                updated_defn = p2.get("updated_definition")
                if updated_defn:
                    log.info("Summarizer Pass 2: updating definition for '{}'", p2_domain)
                    domains = _update_definition(domains, p2_domain, updated_defn)
                domains = _increment_count(domains, p2_domain)
                _save_domains(domains)
                final_domain = p2_domain
                final_is_new = False
            else:
                # confirm_new — add normalized domain
                defn = p2.get("final_definition") or p1.get("proposed_definition") or ""
                domains = _add_domain(domains, p2_domain, defn)
                _save_domains(domains)
                final_domain = p2_domain
                final_is_new = True

    else:
        # Pass 1 matched existing domain directly
        domains = _increment_count(domains, final_domain)
        _save_domains(domains)

    # ── Save to DB ────────────────────────────────────────────────────────────
    needs_graph  = bool(p1.get("needs_graph", True))
    graph_reason = p1.get("graph_reason", "")

    crud.save_doc_summary(
        db, doc_id, file_name,
        summary=p1.get("summary"),
        assigned_domain=final_domain,
        is_new_domain=final_is_new,
        proposed_domain=p1.get("proposed_domain"),
        confidence=p1.get("confidence"),
        needs_graph=needs_graph,
        graph_reason=graph_reason,
        model_used=SUMMARIZER_MODEL,
        sampled_chunk_indices=sampled_indices,
    )
    log.info("Summarizer ✓ done for '{}' → domain='{}' needs_graph={}",
             file_name, final_domain, needs_graph)
    log.info("Summarizer: graph_reason='{}'", graph_reason)

    return {
        "summary":         p1.get("summary"),
        "key_concepts":    p1.get("key_concepts") or [],
        "assigned_domain": final_domain,
        "is_new_domain":   final_is_new,
        "confidence":      p1.get("confidence"),
        "needs_graph":     needs_graph,
        "graph_reason":    graph_reason,
    }
