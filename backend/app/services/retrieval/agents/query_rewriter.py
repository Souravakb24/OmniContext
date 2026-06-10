"""Agent 1: rewrites the raw query and classifies its complexity."""
from __future__ import annotations

import json

from loguru import logger

from app.services.retrieval.agents.base_agent import BaseAgent
from app.services.retrieval.services.llm import call_llm


class QueryRewriterAgent(BaseAgent):

    async def node(self, state: dict) -> dict:
        self._emit("start", {"status": "Rewriting query..."})

        history = state.get("conversation_history", [])
        history_text = (
            "\n".join(f"Q: {t['query']}\nA: {t['answer']}" for t in history)
            if history else "None"
        )

        user_content = self.user_template.format(
            conversation_history=history_text,
            raw_query=state["raw_query"],
        )

        try:
            response = await call_llm(self._build_messages(user_content), stage="rewrite",
                                  query_id=state.get("query_id", ""),
                                  session_id=state.get("session_id", ""))
            data = json.loads(response)
            rewritten = data.get("rewritten_query", state["raw_query"]).strip()
            complexity = data.get("complexity", "simple").lower()
            if complexity not in ("simple", "complex"):
                complexity = "simple"
        except Exception as exc:
            logger.warning("QueryRewriter: parse failed ({}), using raw query", exc)
            rewritten  = state["raw_query"]
            complexity = "simple"

        self._emit("done", {
            "rewritten_query": rewritten,
            "complexity": complexity,
        })

        return {
            "rewritten_query":  rewritten,
            "query_complexity": complexity,
        }
