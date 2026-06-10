"""
Agent 5: scores the current answer against the main rewritten query.

Scoring is always against the main rewritten_query (not sub-queries).
Updates best_answer/best_score if the current answer is the best seen so far.
"""
from __future__ import annotations

import json

from loguru import logger

from app.services.retrieval.agents.base_agent import BaseAgent
from app.services.retrieval.services.llm import call_llm
from app.services.retrieval.agents.answer_agent import _format_chunks
from app.services.retrieval.config import (
    VERIFY_PASS_SIMPLE,
    VERIFY_PASS_COMPLEX_EARLY,
)


class VerificationAgent(BaseAgent):

    async def node(self, state: dict) -> dict:
        self._emit("start", {"status": "Verifying answer quality..."})

        rewritten_query = state["rewritten_query"]
        current_answer  = state.get("current_answer", "")
        chunks          = state.get("retrieved_chunks", [])
        complexity      = state.get("query_complexity", "simple")

        chunks_text = _format_chunks(chunks)

        user_content = self.user_template.format(
            rewritten_query=rewritten_query,
            chunks_text=chunks_text,
            current_answer=current_answer,
        )

        score    = 0.0
        feedback = ""
        try:
            response = await call_llm(self._build_messages(user_content), stage="verification",
                                      query_id=state.get("query_id", ""),
                                      session_id=state.get("session_id", ""))
            data     = json.loads(response)
            score    = float(data.get("score", 0.0))
            score    = max(0.0, min(1.0, score))
            feedback = str(data.get("feedback", "")).strip()
        except Exception as exc:
            logger.warning("VerificationAgent: parse failed ({}), defaulting score=0", exc)

        # Track best answer seen
        best_score  = state.get("best_score", 0.0)
        best_answer = state.get("best_answer", "")
        if score > best_score:
            best_score  = score
            best_answer = current_answer

        # Determine pass
        threshold = (
            VERIFY_PASS_COMPLEX_EARLY if complexity == "complex"
            else VERIFY_PASS_SIMPLE
        )
        passed = score >= threshold

        logger.info(
            "VerificationAgent: score={:.3f} threshold={:.2f} passed={} complexity={}",
            score, threshold, passed, complexity,
        )

        self._emit("done", {
            "score":   score,
            "passed":  passed,
            "feedback": feedback,
        })

        return {
            "verification_score":    score,
            "verification_feedback": feedback,
            "verification_passed":   passed,
            "best_score":            best_score,
            "best_answer":           best_answer,
        }
