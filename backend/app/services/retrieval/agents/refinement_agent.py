"""
Agent 6: generates refined search queries to fill gaps identified by the verifier.

Writes the new queries back into planned_queries so the Retrieval agent
can run again with fresh targets. Increments the iteration counter.
"""
from __future__ import annotations

import json

from loguru import logger

from app.services.retrieval.agents.base_agent import BaseAgent
from app.services.retrieval.services.llm import call_llm

_MAX_REFINED_QUERIES = 1  # keep at 1 during experiments; change here to increase


class RefinementAgent(BaseAgent):

    async def node(self, state: dict) -> dict:
        self._emit("start", {"status": "Generating refined queries..."})

        rewritten_query    = state["rewritten_query"]
        verification_feedback = state.get("verification_feedback", "")
        verification_score    = state.get("verification_score", 0.0)
        iteration             = state.get("iteration", 0)

        user_content = self.user_template.format(
            rewritten_query=rewritten_query,
            verification_feedback=verification_feedback,
            verification_score=f"{verification_score:.2f}",
            max_refined_queries=_MAX_REFINED_QUERIES,
        )

        try:
            response = await call_llm(self._build_messages(user_content), stage="refinement",
                                      query_id=state.get("query_id", ""),
                                      session_id=state.get("session_id", ""))
            data     = json.loads(response)
            queries  = [q.strip() for q in data.get("queries", []) if q.strip()]
            if not queries:
                queries = [rewritten_query]
            queries = queries[:_MAX_REFINED_QUERIES]
        except Exception as exc:
            logger.warning("RefinementAgent: parse failed ({}), using rewritten query", exc)
            queries = [rewritten_query]

        new_iteration = iteration + 1

        self._emit("done", {
            "refined_queries": queries,
            "iteration":       new_iteration,
        })

        return {
            "planned_queries": queries,
            "iteration":       new_iteration,
        }
