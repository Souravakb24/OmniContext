"""
Agent 7: extracts citations from the final answer and source chunks.

Also resolves the final_answer:
  - For complex queries that did not pass the threshold, uses best_answer
  - Otherwise uses current_answer
"""
from __future__ import annotations

import json

from loguru import logger

from app.services.retrieval.agents.base_agent import BaseAgent
from app.services.retrieval.services.llm import call_llm
from app.services.retrieval.config import VERIFY_PASS_COMPLEX_FALLBACK


class CitationAgent(BaseAgent):

    async def node(self, state: dict) -> dict:
        self._emit("start", {"status": "Extracting citations..."})

        complexity      = state.get("query_complexity", "simple")
        current_answer  = state.get("current_answer", "")
        best_answer     = state.get("best_answer", "")
        best_score      = state.get("best_score", 0.0)

        # Resolve which answer becomes the final answer
        if complexity == "complex":
            # Use best_answer if it meets fallback threshold; otherwise current_answer
            if best_score >= VERIFY_PASS_COMPLEX_FALLBACK and best_answer:
                final_answer = best_answer
            else:
                final_answer = current_answer
        else:
            final_answer = current_answer

        # Grounded refusal — no answer was found in the context, so there is
        # nothing to cite. Skip the citation LLM call entirely.
        if not state.get("answer_found", True):
            self._emit("done", {"citation_count": 0})
            return {"final_answer": final_answer, "citations": []}

        chunks = state.get("retrieved_chunks", [])

        chunks_with_metadata = "\n\n".join(
            f"[Chunk {i}] chunk_id={c.get('id', '')} doc={c.get('document_name', '')} "
            f"page={c.get('page_numbers', '')} "
            f"section={c.get('headings', '')} "
            f"chunk_index={c.get('chunk_index', '')}\n{c['text'][:400]}"
            for i, c in enumerate(chunks, 1)
        )

        user_content = self.user_template.format(
            final_answer=final_answer,
            chunks_with_metadata=chunks_with_metadata,
        )

        citations = []
        try:
            response = await call_llm(self._build_messages(user_content), stage="citation",
                                      query_id=state.get("query_id", ""),
                                      session_id=state.get("session_id", ""))
            data     = json.loads(response)
            citations = data.get("citations", [])
        except Exception as exc:
            logger.warning("CitationAgent: parse failed ({}), returning empty citations", exc)

        # Set chunk_type authoritatively from the retrieved chunks rather than
        # trusting the LLM to label figures — the inline-figure UI depends on it.
        chunk_type_by_id = {c.get("id"): c.get("chunk_type", "text") for c in chunks}
        for cite in citations:
            if isinstance(cite, dict):
                cite["chunk_type"] = chunk_type_by_id.get(cite.get("chunk_id"), cite.get("chunk_type", "text"))

        self._emit("done", {"citation_count": len(citations)})

        return {
            "final_answer": final_answer,
            "citations":    citations,
        }
