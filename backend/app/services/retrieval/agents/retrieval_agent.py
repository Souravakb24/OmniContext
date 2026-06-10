"""
Agent 3: retrieves and reranks chunks from ChromaDB + PostgreSQL BM25 + Memgraph.

For each planned query:
  - Fetch top RETRIEVAL_TOP_K chunks from vector store (ChromaDB)
  - Fetch top RETRIEVAL_TOP_K chunks from BM25 store (PostgreSQL FTS)
  - Deduplicate by chunk_id, tagging retrieval_source: "vector" / "bm25" / "both"
  - Rerank merged pool against rewritten_query → keep top RERANK_TOP_K

If is_graph is True, also query the graph store using the rewritten_query.
"""
from __future__ import annotations

import asyncio

from loguru import logger

from app.services.retrieval.agents.base_agent import BaseAgent
from app.services.retrieval.services.vector_store import query_vector_store
from app.services.retrieval.services.bm25_store import query_bm25_store
from app.services.retrieval.services.graph_store import query_graph_store
from app.services.retrieval.services.reranker import rerank
from app.services.retrieval.config import RETRIEVAL_TOP_K, RERANK_TOP_K


class RetrievalAgent(BaseAgent):

    async def node(self, state: dict) -> dict:
        self._emit("start", {"status": "Retrieving relevant chunks..."})

        planned_queries = state.get("planned_queries", [state["rewritten_query"]])
        rewritten_query = state["rewritten_query"]
        collection_id   = state.get("collection_id", "")
        collection_name = state["collection_name"]
        doc_id          = state.get("doc_id") or None
        is_graph        = state.get("is_graph", False)
        query_id        = state.get("query_id", "")

        # ── Parallel vector + BM25 retrieval ──────────────────────────────────
        vector_chunks, bm25_chunks = await asyncio.gather(
            query_vector_store(planned_queries, collection_name, top_k=RETRIEVAL_TOP_K, doc_id=doc_id, query_id=query_id),
            query_bm25_store(planned_queries, collection_name, top_k=RETRIEVAL_TOP_K, doc_id=doc_id, query_id=query_id),
        )

        # ── Deduplicate and tag retrieval_source ──────────────────────────────
        bm25_ids = {c["id"] for c in bm25_chunks}
        for c in vector_chunks:
            c["retrieval_source"] = "both" if c["id"] in bm25_ids else "vector"

        vector_ids = {c["id"] for c in vector_chunks}
        for c in bm25_chunks:
            if c["id"] not in vector_ids:
                c["retrieval_source"] = "bm25"

        merged = vector_chunks + [c for c in bm25_chunks if c["id"] not in vector_ids]

        both_count = sum(1 for c in merged if c.get("retrieval_source") == "both")
        logger.info(
            "RetrievalAgent: vector={} bm25={} merged={} both={}",
            len(vector_chunks), len(bm25_chunks), len(merged), both_count,
        )

        # ── Rerank merged pool per planned query ──────────────────────────────
        if merged:
            query_to_chunks: dict[str, list] = {}
            for chunk in merged:
                q = chunk.get("query", planned_queries[0])
                query_to_chunks.setdefault(q, []).append(chunk)

            reranked: list[dict] = []
            for q, chunks in query_to_chunks.items():
                top = rerank(rewritten_query, chunks, top_k=RERANK_TOP_K, query_id=query_id)
                reranked.extend(top)

            seen_ids: set = set()
            final_chunks: list[dict] = []
            for c in reranked:
                if c["id"] not in seen_ids:
                    seen_ids.add(c["id"])
                    final_chunks.append(c)
        else:
            final_chunks = []

        # ── Graph store (optional) ────────────────────────────────────────────
        graph_context = ""
        graph_ui      = {}
        if is_graph:
            self._emit("progress", {"status": "Querying knowledge graph..."})
            graph_context, graph_ui = await query_graph_store(
                rewritten_query, collection_name, collection_id=collection_id, query_id=query_id
            )

        no_context = len(final_chunks) == 0 and not graph_context

        logger.info(
            "RetrievalAgent: {} chunks after rerank, graph_edges={}, no_context={}",
            len(final_chunks), len(graph_ui.get("edges", [])), no_context,
        )

        self._emit("done", {
            "chunk_count":  len(final_chunks),
            "graph_found":  bool(graph_context),
            "graph_nodes":  len(graph_ui.get("nodes", [])),
            "graph_edges":  len(graph_ui.get("edges", [])),
        })

        return {
            "retrieved_chunks": final_chunks,
            "graph_context":    graph_context,
            "graph_ui":         graph_ui,
            "no_context":       no_context,
        }
