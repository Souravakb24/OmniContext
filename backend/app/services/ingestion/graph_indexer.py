"""
Graph DB indexer — extracts entities and relationships from document chunks
using the resolved ontology schema, then pushes them to Memgraph and indexes
entity embeddings into ChromaDB.

Entity identity:
    Each entity gets a deterministic UUID derived from its normalised name and
    the collection it belongs to:
        entity_uuid = uuid5(NAMESPACE_DNS, f"{name.lower().strip()}:{collection_id}")

    This guarantees that the same real-world entity (e.g. "Alan Turing") always
    maps to the same UUID within a collection, enabling cross-document dedup in
    both Memgraph (MERGE) and ChromaDB (upsert).

Entry point:
    run(doc_id, chunks_payload, ontology, db, collection_id, collection_name)
"""
from __future__ import annotations

import json
import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import yaml
from loguru import logger
from neo4j import GraphDatabase
from sqlalchemy.orm import Session

from app.services.ingestion.config import (
    GRAPH_MODEL,
    MEMGRAPH_HOST,
    MEMGRAPH_PORT,
    MEMGRAPH_USER,
    MEMGRAPH_PASSWORD,
    GRAPH_EXTRACTION_WORKERS,
    EMBED_MODEL,
    CHROMA_DB_PATH,
)
from app.services.chroma_naming import to_chroma_name
from app.services.llm_client import call_text
from app.core.telemetry import emit_event

_PROMPTS   = Path(__file__).parent / "prompts"
_prog_lock = threading.Lock()


# ── LLM helper ───────────────────────────────────────────────────────────────

def _call(prompt: str, timeout: int = 300) -> str:
    return call_text([{"role": "user", "content": prompt}], model=GRAPH_MODEL, timeout=timeout, stage="graph_extraction")


def _parse_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        return json.loads(m.group())
    raise ValueError(f"No JSON in response: {text[:200]}")


# ── Extraction prompt ─────────────────────────────────────────────────────────

def _build_extraction_prompt(entity_types: list, rel_types: list, chunk_text: str) -> str:
    template = yaml.safe_load((_PROMPTS / "graph_extraction.yaml").read_text())["system"]
    return (
        template
        .replace("{entity_types}",        ", ".join(entity_types))
        .replace("{relationship_types}",  ", ".join(rel_types))
        .replace("{chunk_text}",          chunk_text[:1500])
    )


# ── Entity UUID ───────────────────────────────────────────────────────────────

def _entity_uuid(name: str, collection_id: str) -> str:
    """Deterministic UUID for an entity within a collection."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"{name.lower().strip()}:{collection_id}"))


# ── Per-chunk extraction ──────────────────────────────────────────────────────

_chunks_done  = 0
_chunks_total = 0


def _extract_chunk(chunk_idx: int, chunk: dict,
                   entity_types: list, rel_types: list) -> dict | None:
    global _chunks_done
    text = chunk.get("text", "").strip()
    if not text:
        return None
    prompt = _build_extraction_prompt(entity_types, rel_types, text)
    try:
        result = _parse_json(_call(prompt))
        with _prog_lock:
            _chunks_done += 1
            print(f"  graph extract {_chunks_done}/{_chunks_total}", end="\r")
        return {
            "entities":      result.get("entities", []),
            "relationships": result.get("relationships", []),
            "chunk_id":      chunk.get("chunk_id", ""),
        }
    except Exception as exc:
        logger.warning("GraphIndexer: chunk {} extraction failed — {}", chunk_idx, exc)
        with _prog_lock:
            _chunks_done += 1
        return None


# ── Memgraph push ─────────────────────────────────────────────────────────────

def _push_to_memgraph(doc_id: str, doc_name: str, collection_id: str,
                      entities: list[dict], relationships: list[dict]) -> None:
    uri    = f"bolt://{MEMGRAPH_HOST}:{MEMGRAPH_PORT}"
    driver = GraphDatabase.driver(uri, auth=(MEMGRAPH_USER, MEMGRAPH_PASSWORD))
    try:
        with driver.session() as session:
            for ent in entities:
                eid = ent["entity_id"]
                session.run(
                    """
                    MERGE (n:Entity {entity_id: $entity_id})
                    SET n.name          = $name,
                        n.type          = $type,
                        n.collection_id = $collection_id,
                        n.doc_id        = $doc_id,
                        n.source        = $source
                    """,
                    entity_id=eid,
                    name=ent["name"],
                    type=ent["type"],
                    collection_id=collection_id,
                    doc_id=doc_id,
                    source=doc_name,
                )

            for rel in relationships:
                rel_type = re.sub(r"[^A-Z0-9_]", "", rel["rel"].upper())
                if not rel_type:
                    continue
                cypher = f"""
                    MATCH (s:Entity {{entity_id: $src_id}})
                    MATCH (t:Entity {{entity_id: $tgt_id}})
                    MERGE (s)-[r:{rel_type}]->(t)
                    SET r.doc_id = $doc_id,
                        r.collection_id = $collection_id
                """
                try:
                    session.run(cypher,
                                src_id=rel["src_id"], tgt_id=rel["tgt_id"],
                                doc_id=doc_id, collection_id=collection_id)
                except Exception as exc:
                    logger.warning("GraphIndexer: rel '{}' failed — {}", rel, exc)
    finally:
        driver.close()


# ── ChromaDB entity indexing ──────────────────────────────────────────────────

def _index_entities_chromadb(doc_id: str, doc_name: str, collection_id: str,
                              entities: list[dict], collection_name: str, log) -> None:
    """Embed entity names and upsert into {collection_name}_graph ChromaDB collection."""
    if not entities:
        return
    try:
        import traceback as _tb
        import chromadb
        from sentence_transformers import SentenceTransformer

        chroma_collection_name = to_chroma_name(collection_name, "graph")
        client     = chromadb.PersistentClient(path=str(CHROMA_DB_PATH))
        collection = client.get_or_create_collection(
            name=chroma_collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        embed_model = SentenceTransformer(EMBED_MODEL, device="cpu")

        ids        = [e["entity_id"] for e in entities]
        names      = [e["name"] for e in entities]
        metadatas  = [
            {
                "entity_id":     e["entity_id"],
                "collection_id": collection_id,
                "doc_id":        doc_id,
                "chunk_id":      e.get("chunk_id", ""),
                "type":          e.get("type", ""),
                "source":        doc_name,
            }
            for e in entities
        ]
        embeddings = embed_model.encode(
            names, normalize_embeddings=True, show_progress_bar=False
        ).tolist()

        collection.upsert(ids=ids, embeddings=embeddings,
                          documents=names, metadatas=metadatas)
        log.info("GraphIndexer: {} entities indexed in '{}'", len(ids), chroma_collection_name)
    except Exception as exc:
        import traceback as _tb
        log.error("GraphIndexer: ChromaDB entity indexing failed — {}\n{}",
                  exc, _tb.format_exc())


# ── Main entry point ──────────────────────────────────────────────────────────

def run(doc_id: str, chunks_payload: dict, ontology: dict, db: Session,
        collection_id: str = "", collection_name: str = "default") -> None:
    """
    Extract entities + relationships from chunks, push to Memgraph,
    and index entity embeddings into ChromaDB ({collection_name}_graph).

    Entity UUIDs are deterministic: uuid5(NAMESPACE_DNS, name.lower() + ":" + collection_id).
    MERGE in Memgraph and upsert in ChromaDB provide cross-document deduplication.

    Args:
        doc_id:           document UUID
        chunks_payload:   pipeline output with "chunks" list
        ontology:         {"entity_types": [...], "relationship_types": [...]}
        db:               SQLAlchemy session (unused here, kept for interface consistency)
        collection_id:    collection UUID string (used for entity UUID derivation)
        collection_name:  used to name ChromaDB collection as {collection_name}_graph
    """
    global _chunks_done, _chunks_total

    log = logger.bind(doc_id=doc_id)

    text_chunks = [
        c for c in chunks_payload.get("chunks", [])
        if c.get("text", "").strip() and c.get("type", "text") != "figure"
    ]
    if not text_chunks:
        log.warning("GraphIndexer: no text chunks for doc_id={}", doc_id)
        return

    entity_types = ontology.get("entity_types", [])
    rel_types    = ontology.get("relationship_types", [])

    if not entity_types:
        log.warning("GraphIndexer: ontology has no entity types — skipping")
        return

    _chunks_total = len(text_chunks)
    _chunks_done  = 0
    _gi_t0 = time.perf_counter()
    log.info("GraphIndexer: extracting from {} chunks ({} workers)", _chunks_total, GRAPH_EXTRACTION_WORKERS)

    # Parallel extraction
    all_entities: list[dict]      = []
    all_relationships: list[dict] = []

    with ThreadPoolExecutor(max_workers=GRAPH_EXTRACTION_WORKERS) as pool:
        futures = {
            pool.submit(_extract_chunk, i, chunk, entity_types, rel_types): i
            for i, chunk in enumerate(text_chunks)
        }
        for future in as_completed(futures):
            result = future.result()
            if result:
                chunk_id = result.get("chunk_id", "")
                for e in result.get("entities", []):
                    e["chunk_id"] = chunk_id
                all_entities.extend(result.get("entities", []))
                all_relationships.extend(result.get("relationships", []))
    print()

    # Deduplicate entities by deterministic UUID (cross-doc dedup via uuid5)
    seen_ids: dict[str, dict] = {}
    for e in all_entities:
        eid = _entity_uuid(e.get("name", ""), collection_id)
        if eid not in seen_ids:
            e["entity_id"] = eid
            seen_ids[eid]  = e
    unique_entities = list(seen_ids.values())

    log.info("GraphIndexer: {} raw entities → {} unique after UUID dedup",
             len(all_entities), len(unique_entities))

    # Build entity lookup {name_lower → entity_id} for relationship resolution
    ent_id_lookup: dict[str, str] = {
        e["name"].lower().strip(): e["entity_id"]
        for e in unique_entities
    }

    # Enrich relationships with resolved UUIDs, deduplicate
    seen_rel: set[tuple] = set()
    unique_rels: list[dict] = []
    for r in all_relationships:
        src_name = r.get("src", "").strip()
        tgt_name = r.get("tgt", "").strip()
        rel_type = r.get("rel", "").strip()
        if not (src_name and tgt_name and rel_type):
            continue
        src_id = ent_id_lookup.get(src_name.lower())
        tgt_id = ent_id_lookup.get(tgt_name.lower())
        if not src_id or not tgt_id:
            continue
        key = (src_id, rel_type.upper(), tgt_id)
        if key in seen_rel:
            continue
        seen_rel.add(key)
        unique_rels.append({
            "src_id":  src_id,
            "tgt_id":  tgt_id,
            "rel":     rel_type.upper(),
        })

    log.info("GraphIndexer: {} entities, {} relationships → pushing to Memgraph",
             len(unique_entities), len(unique_rels))

    doc_name = chunks_payload.get("document_name", doc_id)
    _push_to_memgraph(doc_id, doc_name, collection_id, unique_entities, unique_rels)

    # Index entity embeddings into ChromaDB ({collection_name}_graph)
    _index_entities_chromadb(doc_id, doc_name, collection_id, unique_entities, collection_name, log)

    _gi_dur = int((time.perf_counter() - _gi_t0) * 1000)
    emit_event("ingestion_stage", stage="graph_indexing", status="success",
               doc_id=doc_id, collection_id=collection_id,
               duration_ms=_gi_dur,
               entity_count=len(unique_entities),
               edge_count=len(unique_rels))
    log.info("GraphIndexer ✓ completed doc_id={}", doc_id)
