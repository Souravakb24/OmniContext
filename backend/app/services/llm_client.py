"""
Central LLM client — routes all calls to either OpenRouter (cloud) or Ollama (local)
based on the LLM_PROVIDER setting in .env.

To switch providers, change LLM_PROVIDER in .env and update the three model names:
  LLM_PROVIDER=openrouter   OLLAMA_MODEL / SUMMARIZER_MODEL / GRAPH_MODEL = OpenRouter model IDs
  LLM_PROVIDER=ollama       OLLAMA_MODEL / SUMMARIZER_MODEL / GRAPH_MODEL = Ollama model names
"""
from __future__ import annotations

import time

from openai import OpenAI, AsyncOpenAI
from loguru import logger

from app.config import settings


def active_vlm_model() -> str:
    if settings.LLM_PROVIDER == "openrouter":
        return settings.OPENROUTER_VLM_MODEL
    return settings.OLLAMA_VLM_MODEL


def active_summarizer_model() -> str:
    if settings.LLM_PROVIDER == "openrouter":
        return settings.OPENROUTER_SUMMARIZER_MODEL
    return settings.OLLAMA_SUMMARIZER_MODEL


def active_graph_model() -> str:
    if settings.LLM_PROVIDER == "openrouter":
        return settings.OPENROUTER_GRAPH_MODEL
    return settings.OLLAMA_GRAPH_MODEL


def _make_client() -> OpenAI:
    if settings.LLM_PROVIDER == "ollama":
        return OpenAI(base_url=settings.OLLAMA_BASE_URL, api_key="ollama")
    return OpenAI(base_url=settings.OPENROUTER_BASE_URL, api_key=settings.OPENROUTER_API_KEY)


def _make_async_client() -> AsyncOpenAI:
    if settings.LLM_PROVIDER == "ollama":
        return AsyncOpenAI(base_url=settings.OLLAMA_BASE_URL, api_key="ollama")
    return AsyncOpenAI(base_url=settings.OPENROUTER_BASE_URL, api_key=settings.OPENROUTER_API_KEY)


def _input_preview(messages: list[dict]) -> str:
    """Full last user message — stored as input_text in telemetry. No truncation."""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
            return str(content)
    return ""


def call_text(
    messages: list[dict],
    model: str,
    temperature: float = 0.1,
    timeout: int = 300,
    retries: int = 3,
    stage: str = "",
    query_id: str = "",
    session_id: str = "",
) -> str:
    """Synchronous text LLM call. Used by ingestion pipeline."""
    from app.core.telemetry import emit_event

    client = _make_client()
    for attempt in range(1, retries + 1):
        try:
            _t0 = time.perf_counter()
            resp = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                timeout=timeout,
            )
            _dur = int((time.perf_counter() - _t0) * 1000)
            _u = resp.usage
            _out = resp.choices[0].message.content.strip()
            emit_event(
                "llm_call", stage=stage, status="success",
                query_id=query_id, session_id=session_id,
                duration_ms=_dur,
                input_tokens=_u.prompt_tokens if _u else None,
                output_tokens=_u.completion_tokens if _u else None,
                input_text=_input_preview(messages),
                output_text=_out,
                model=model,
            )
            return _out
        except Exception as exc:
            logger.error("call_text attempt {}/{} failed: {}", attempt, retries, exc)
            if attempt < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"LLM call failed after {retries} attempts")


async def call_text_async(
    messages: list[dict],
    model: str,
    temperature: float = 0.1,
    timeout: int = 120,
    stage: str = "",
    query_id: str = "",
    session_id: str = "",
) -> str:
    """Async text LLM call. Used by retrieval pipeline."""
    import time as _time
    from app.core.telemetry import emit_event

    client = _make_async_client()
    try:
        _t0 = _time.perf_counter()
        resp = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            timeout=timeout,
        )
        _dur = int((_time.perf_counter() - _t0) * 1000)
        _u = resp.usage
        _out = resp.choices[0].message.content.strip()
        emit_event(
            "llm_call", stage=stage, status="success",
            query_id=query_id, session_id=session_id,
            duration_ms=_dur,
            input_tokens=_u.prompt_tokens if _u else None,
            output_tokens=_u.completion_tokens if _u else None,
            input_text=_input_preview(messages),
            output_text=_out[:500],
            model=model,
        )
        return _out
    except Exception as exc:
        logger.error("call_text_async failed: {}", exc)
        raise


def call_vision(
    b64_image: str,
    prompt: str,
    model: str | None = None,
    timeout: int = 120,
    retries: int = 2,
) -> str:
    """Synchronous vision/VLM call with a base64-encoded image."""
    client = _make_client()
    vlm_model = model or active_vlm_model()
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_image}"}},
                {"type": "text", "text": prompt},
            ],
        }
    ]
    for attempt in range(retries + 1):
        try:
            resp = client.chat.completions.create(
                model=vlm_model,
                messages=messages,
                timeout=timeout,
            )
            return resp.choices[0].message.content.strip()
        except Exception as exc:
            logger.error("call_vision attempt {}/{} failed: {}", attempt, retries, exc)
            if attempt < retries:
                time.sleep(2 ** attempt)
    return f"ERROR: vision call failed after {retries + 1} attempts"
