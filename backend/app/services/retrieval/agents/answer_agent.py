"""
Agent 4: synthesizes an answer from retrieved chunks + graph context.

On iteration > 0, the previous answer and verification feedback are injected
so the agent can build on and improve the prior response.
"""
from __future__ import annotations

import re

from app.services.retrieval.agents.base_agent import BaseAgent
from app.services.retrieval.services.llm import call_llm


def _normalise_math_delimiters(text: str) -> str:
    """Convert LaTeX delimiters to Markdown math format.

    Models trained on LaTeX output \[...\] and \(...\) regardless of prompt
    instructions. This post-processing step is deterministic and model-agnostic.

    \[ ... \]  →  $$\n...\n$$    (display block)
    \( ... \)  →  $...$           (inline)
    """
    # Display math: \[ ... \] → $$...$$  (preserve internal newlines)
    text = re.sub(
        r'\\\[\s*(.*?)\s*\\\]',
        lambda m: f'$$\n{m.group(1).strip()}\n$$',
        text,
        flags=re.DOTALL,
    )
    # Inline math: \( ... \) → $...$
    text = re.sub(
        r'\\\((.*?)\\\)',
        lambda m: f'${m.group(1)}$',
        text,
        flags=re.DOTALL,
    )
    return text


def _format_chunks(chunks: list[dict]) -> str:
    if not chunks:
        return "No relevant context retrieved."
    parts = []
    for c in chunks:
        source  = c.get("document_name", "document")
        pages   = c.get("page_numbers", "")
        heading = c.get("headings", "")
        header  = f"[{source}" + (f", p.{pages}" if pages else "") + (f" — {heading}" if heading else "") + "]"
        parts.append(f"{header}\n{c['text']}")
    return "\n\n---\n\n".join(parts)


class AnswerAgent(BaseAgent):

    async def node(self, state: dict) -> dict:
        self._emit("start", {"status": "Generating answer..."})

        chunks          = state.get("retrieved_chunks", [])
        graph_context   = state.get("graph_context", "")
        rewritten_query = state["rewritten_query"]
        iteration       = state.get("iteration", 0)
        previous_answer = state.get("current_answer", "")
        feedback        = state.get("verification_feedback", "")

        chunks_text = _format_chunks(chunks)

        graph_section = (
            f"Additional context:\n{graph_context}"
            if graph_context else ""
        )

        previous_answer_section = (
            f"Previous answer (iteration {iteration}):\n{previous_answer}"
            if previous_answer else ""
        )

        verification_feedback_section = (
            f"Verification feedback on previous answer:\n{feedback}"
            if feedback else ""
        )

        user_content = self.user_template.format(
            rewritten_query=rewritten_query,
            chunks_text=chunks_text,
            graph_section=graph_section,
            previous_answer_section=previous_answer_section,
            verification_feedback_section=verification_feedback_section,
        )

        answer = _normalise_math_delimiters(await call_llm(
            self._build_messages(user_content), stage="answer",
            query_id=state.get("query_id", ""),
            session_id=state.get("session_id", ""),
        ))

        # Grounded refusal: the agent emits NO_ANSWER on the first line when the
        # context lacks the info. Strip the sentinel and flag the turn so citations
        # and the knowledge graph are suppressed downstream.
        answer_found = True
        stripped = answer.lstrip()
        if stripped.startswith("NO_ANSWER"):
            answer_found = False
            answer = stripped[len("NO_ANSWER"):].lstrip("\n").lstrip()
            if not answer:
                answer = "I couldn't find information about this in the available documents."

        self._emit("done", {"answer_length": len(answer)})

        return {"current_answer": answer, "answer_found": answer_found}
