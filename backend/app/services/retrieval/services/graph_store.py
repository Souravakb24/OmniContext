"""
Memgraph + ChromaDB entity store for graph-augmented retrieval.

New flow for a given query:
  1. Load ontology from collections.ontologies DB column (for LLM-guided entity extraction)
  2. LLM extracts entities from the query using the ontology as context
  3. Embed extracted entity names → vector-search {collection_name}_graph (top 20)
  4. Collect entity UUIDs from ChromaDB metadata
  5. 2-hop Memgraph traversal using entity_id UUIDs → up to 300 triplets
  6. Return formatted triples + graph UI dict
"""
from __future__ import annotations

import asyncio
import json
import re

import time as _time

from loguru import logger

from app.services.retrieval.config import (
    CHROMA_DB_PATH,
    MEMGRAPH_HOST,
    MEMGRAPH_PORT,
    MEMGRAPH_USER,
    MEMGRAPH_PASSWORD,
    GRAPH_HOPS,
    SUMMARIZER_MODEL,
)
from app.services.retrieval.services.embedder import get_embed_model
from app.services.chroma_naming import to_chroma_name
from app.services.llm_client import call_text
from app.core.telemetry import emit_event

_ENTITY_TOP_K = 20
_TRIPLE_LIMIT = 300


# ── Ontology loader ────────────────────────────────────────────────────────────

def _load_ontology_from_db(collection_id: str) -> dict:
    """Load ontology from collections.ontologies column. Returns {} if missing."""
    if not collection_id:
        return {}
    try:
        from app.database import SessionLocal
        from sqlalchemy import text as sa_text
        db = SessionLocal()
        try:
            row = db.execute(
                sa_text("SELECT ontologies FROM collections WHERE id = CAST(:cid AS uuid)"),
                {"cid": collection_id},
            ).fetchone()
            if row and row.ontologies:
                data = row.ontologies
                if isinstance(data, str):
                    data = json.loads(data)
                return data
        finally:
            db.close()
    except Exception as exc:
        logger.warning("GraphStore: failed to load ontology from DB — {}", exc)
    return {}


# ── LLM entity extraction ─────────────────────────────────────────────────────

def _extract_entities_from_query(query: str, ontology: dict) -> list[str]:
    """Ask the LLM to extract entity names from the query, guided by the ontology."""
    entity_types = ontology.get("entity_types", [])
    type_hint = (
        f"Focus on these entity types: {', '.join(entity_types)}." if entity_types
        else "Extract all named entities."
    )
    prompt = (
        f"Extract the key named entities from this query that would be found in a knowledge graph.\n"
        f"{type_hint}\n\n"
        f"Query: {query}\n\n"
        f"Return ONLY a JSON array of entity name strings, e.g. [\"Alan Turing\", \"Cambridge\"]. "
        f"No explanation."
    )
    try:
        raw = call_text([{"role": "user", "content": prompt}], model=SUMMARIZER_MODEL, timeout=60, stage="graph_entity_extraction")
        raw = raw.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
        m = re.search(r"\[.*\]", raw, re.DOTALL)
        if m:
            entities = json.loads(m.group())
            return [str(e).strip() for e in entities if str(e).strip()]
    except Exception as exc:
        logger.warning("GraphStore: entity extraction failed — {}", exc)
    return []


# ── ChromaDB entity search ────────────────────────────────────────────────────

def _vector_search_entities(entity_names: list[str], collection_name: str) -> list[dict]:
    """
    Embed each extracted entity name, query the _graph ChromaDB collection,
    return up to _ENTITY_TOP_K unique results with entity_id in metadata.
    """
    import chromadb

    if not entity_names:
        return []

    chroma_collection_name = to_chroma_name(collection_name, "graph")
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)

    try:
        collection = client.get_collection(chroma_collection_name)
    except Exception:
        logger.warning("GraphStore: entity collection '{}' not found", chroma_collection_name)
        return []

    n_in_collection = collection.count()
    if n_in_collection == 0:
        return []

    model = get_embed_model()

    seen_ids: dict[str, dict] = {}
    n_per_query = min(10, n_in_collection)

    for name in entity_names:
        if len(seen_ids) >= _ENTITY_TOP_K:
            break
        try:
            embedding = model.encode(name, normalize_embeddings=True).tolist()
            results   = collection.query(
                query_embeddings=[embedding],
                n_results=n_per_query,
                include=["documents", "metadatas"],
            )
            for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
                entity_id = meta.get("entity_id", "")
                if entity_id and entity_id not in seen_ids:
                    seen_ids[entity_id] = {"entity_id": entity_id, "name": doc, "meta": meta}
                if len(seen_ids) >= _ENTITY_TOP_K:
                    break
        except Exception as exc:
            logger.warning("GraphStore: embedding search failed for '{}' — {}", name, exc)

    return list(seen_ids.values())


# ── Memgraph 2-hop traversal ─────────────────────────────────────────────────

def _traverse_by_uuid(entity_ids: list[str], hops: int) -> list[dict]:
    """n-hop subgraph traversal in Memgraph using entity_id UUIDs."""
    from neo4j import GraphDatabase

    if not entity_ids:
        return []

    if hops == 1:
        cypher = """
            MATCH (n:Entity)-[r]-(m:Entity)
            WHERE n.entity_id IN $ids
            RETURN n.name AS src, n.type AS src_type,
                   type(r) AS rel,
                   m.name AS tgt, m.type AS tgt_type
            LIMIT $limit
        """
    else:
        cypher = f"""
            MATCH p = (n:Entity)-[*1..{hops}]-(m:Entity)
            WHERE n.entity_id IN $ids
            UNWIND relationships(p) AS r
            WITH DISTINCT startNode(r) AS s, r, endNode(r) AS e
            RETURN s.name AS src, s.type AS src_type,
                   type(r) AS rel,
                   e.name AS tgt, e.type AS tgt_type
            LIMIT $limit
        """

    uri    = f"bolt://{MEMGRAPH_HOST}:{MEMGRAPH_PORT}"
    driver = GraphDatabase.driver(uri, auth=(MEMGRAPH_USER, MEMGRAPH_PASSWORD))
    try:
        with driver.session() as session:
            return [dict(rec) for rec in session.run(cypher, ids=entity_ids, limit=_TRIPLE_LIMIT)]
    finally:
        driver.close()


# ── Formatting ────────────────────────────────────────────────────────────────

def _format_triples(triples: list[dict]) -> str:
    if not triples:
        return ""
    lines = [
        f"({t['src']} [{t.get('src_type', '')}]) --[{t['rel']}]--> ({t['tgt']} [{t.get('tgt_type', '')}])"
        for t in triples
    ]
    return "\n".join(lines)


def _build_graph_ui(triples: list[dict]) -> dict:
    nodes: dict[str, dict] = {}
    edges: list[dict] = []
    for t in triples:
        src, tgt = t["src"], t["tgt"]
        if src not in nodes:
            nodes[src] = {"id": src, "type": t.get("src_type", "")}
        if tgt not in nodes:
            nodes[tgt] = {"id": tgt, "type": t.get("tgt_type", "")}
        edges.append({"source": src, "relation": t["rel"], "target": tgt})
    return {"nodes": list(nodes.values()), "edges": edges}


# ── Main sync entry point ─────────────────────────────────────────────────────

def _sync_graph_query(query: str, collection_name: str,
                      collection_id: str = "", hops: int = GRAPH_HOPS,
                      query_id: str = "") -> tuple[str, dict]:
    """Returns (formatted_context_string, graph_ui_dict)."""
    _gs_t0 = _time.perf_counter()

    # Step 1: load ontology
    ontology = _load_ontology_from_db(collection_id)
    logger.info("GraphStore: ontology loaded — {} entity types, {} rel types",
                len(ontology.get("entity_types", [])),
                len(ontology.get("relationship_types", [])))

    # Step 2: LLM entity extraction
    entity_names = _extract_entities_from_query(query, ontology)
    if not entity_names:
        # Fallback: use raw query tokens as entity hint
        entity_names = [query]
    logger.info("GraphStore: extracted {} entities from query: {}", len(entity_names), entity_names)

    # Step 3: embedding search → top 20 entities
    matched = _vector_search_entities(entity_names, collection_name)
    if not matched:
        logger.info("GraphStore: no matching entities in ChromaDB")
        emit_event("store_result", stage="graph", status="success",
                   query_id=query_id, entity_matches=0, traversal_hits=0,
                   was_empty=True,
                   duration_ms=int((_time.perf_counter() - _gs_t0) * 1000))
        return "", {}

    entity_ids = [m["entity_id"] for m in matched]
    logger.info("GraphStore: {} entities matched in ChromaDB → Memgraph traversal", len(entity_ids))

    # Step 4: 2-hop Memgraph traversal
    triples = _traverse_by_uuid(entity_ids, hops)
    logger.info("GraphStore: {} triples retrieved ({}-hop)", len(triples), hops)

    if not triples:
        emit_event("store_result", stage="graph", status="success",
                   query_id=query_id, entity_matches=len(entity_ids), traversal_hits=0,
                   was_empty=True,
                   duration_ms=int((_time.perf_counter() - _gs_t0) * 1000))
        return "", {}

    emit_event("store_result", stage="graph", status="success",
               query_id=query_id, entity_matches=len(entity_ids), traversal_hits=len(triples),
               was_empty=False,
               duration_ms=int((_time.perf_counter() - _gs_t0) * 1000))
    return _format_triples(triples), _build_graph_ui(triples)


# ── Async wrapper ─────────────────────────────────────────────────────────────

async def query_graph_store(
    query: str,
    collection_name: str,
    collection_id: str = "",
    hops: int = GRAPH_HOPS,
    query_id: str = "",
) -> tuple[str, dict]:
    """Async wrapper — returns (context_string, graph_ui_dict)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, _sync_graph_query, query, collection_name, collection_id, hops, query_id
    )
