"""
Single source of truth for deriving ChromaDB collection names.

ChromaDB only accepts names matching [a-zA-Z0-9._-], length 3-512, starting and
ending with an alphanumeric. Human collection names can contain spaces and other
characters, so we sanitize here.

Sanitization replaces only disallowed characters with '_' and leaves already-valid
names unchanged — so existing collections (e.g. "RAG_Research" -> "RAG_Research_vector")
keep their exact Chroma names and need no re-indexing, while names with spaces
(e.g. "Legal Papers" -> "Legal_Papers_vector") become valid.

Both ingestion (indexer / graph_indexer) and retrieval (vector_store / graph_store)
must import this so the write side and read side always agree on the name.
"""
from __future__ import annotations

import re


def to_chroma_name(collection_name: str, suffix: str) -> str:
    """Return a ChromaDB-valid collection name for `{collection_name}` + `{suffix}`.

    `suffix` is "vector" or "graph". The trailing suffix guarantees the name
    ends with an alphanumeric and meets the 3-character minimum.
    """
    safe = re.sub(r"[^a-zA-Z0-9._-]", "_", collection_name).strip("._-")
    if not safe:
        safe = "collection"
    return f"{safe}_{suffix}"
