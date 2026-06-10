"""
Abstract base class for all retrieval agents.

Each agent:
  - Receives a prompt config dict (loaded by prompt_loader.py at startup)
  - Implements the async node() method for LangGraph
  - Uses get_stream_writer() to push SSE progress events to the client
"""
from __future__ import annotations

from abc import ABC, abstractmethod

from langgraph.config import get_stream_writer


class BaseAgent(ABC):
    def __init__(self, prompt_config: dict) -> None:
        self.system_prompt = prompt_config["system"]
        self.user_template = prompt_config["user"]
        self.version       = prompt_config["version"]
        self.agent_name    = prompt_config["agent"]

    def _emit(self, event_type: str, data: dict) -> None:
        """Push a custom SSE event via LangGraph's stream writer."""
        try:
            writer = get_stream_writer()
            writer({"agent": self.agent_name, "event": event_type, **data})
        except Exception:
            pass

    def _build_messages(self, user_content: str) -> list[dict]:
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "user",   "content": user_content},
        ]

    @abstractmethod
    async def node(self, state: dict) -> dict:
        """LangGraph node function. Receives full state, returns state patch."""
        ...
