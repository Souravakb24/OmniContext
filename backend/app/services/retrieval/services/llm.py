"""
Async LLM caller — wraps the central llm_client for retrieval agents.
All retrieval agents call call_llm(); the model is always SUMMARIZER_MODEL.
"""
from __future__ import annotations

from app.services.llm_client import call_text_async
from app.services.retrieval.config import SUMMARIZER_MODEL


async def call_llm(
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.1,
    timeout: int = 120,
    stage: str = "",
    query_id: str = "",
    session_id: str = "",
) -> str:
    return await call_text_async(
        messages=messages,
        model=model or SUMMARIZER_MODEL,
        temperature=temperature,
        timeout=timeout,
        stage=stage,
        query_id=query_id,
        session_id=session_id,
    )
