"""Agent 2: decomposes complex queries into focused sub-queries."""
from __future__ import annotations

import json

from loguru import logger

from app.services.retrieval.agents.base_agent import BaseAgent
from app.services.retrieval.services.llm import call_llm

_MAX_SUB_QUERIES = 3


class QueryPlannerAgent(BaseAgent):

    async def node(self, state: dict) -> dict:
        self._emit("start", {"status": "Planning sub-queries..."})

        complexity      = state.get("query_complexity", "simple")
        rewritten_query = state["rewritten_query"]

        if complexity == "simple":
            planned = [rewritten_query]
            self._emit("done", {"planned_queries": planned})
            return {"planned_queries": planned}

        user_content = self.user_template.format(
            rewritten_query=rewritten_query,
            complexity=complexity,
            max_sub_queries=_MAX_SUB_QUERIES,
        )

        try:
            response = await call_llm(self._build_messages(user_content), stage="query_plan",
                                      query_id=state.get("query_id", ""),
                                      session_id=state.get("session_id", ""))
            data     = json.loads(response)
            queries  = [q.strip() for q in data.get("queries", []) if q.strip()]
            if not queries:
                queries = [rewritten_query]
            queries = queries[:_MAX_SUB_QUERIES]
        except Exception as exc:
            logger.warning("QueryPlanner: parse failed ({}), using rewritten query", exc)
            queries = [rewritten_query]

        self._emit("done", {"planned_queries": queries})
        return {"planned_queries": queries}
