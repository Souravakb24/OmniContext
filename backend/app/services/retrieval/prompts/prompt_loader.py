"""
YAML-based versioned prompt loader.

Each agent has its own YAML file under agent_prompt_configs/.
Format:
    current_version: "v1"
    versions:
      v1:
        system: |
          ...
        user: |
          ...

To switch prompt version for an agent: change current_version in its YAML (no code change).
"""
from __future__ import annotations

from pathlib import Path

import yaml

_CONFIGS_DIR = Path(__file__).parent / "agent_prompt_configs"


def load_prompt_config(agent_name: str) -> dict:
    """Load the prompt config for agent_name and return the active version's prompts.

    Returns:
        {
          "system": str,
          "user": str,
          "version": str,
          "agent": str,
        }
    """
    config_path = _CONFIGS_DIR / f"{agent_name}.yaml"
    if not config_path.exists():
        raise FileNotFoundError(f"Prompt config not found: {config_path}")

    data            = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    current_version = data["current_version"]
    version_data    = data["versions"][current_version]

    return {
        "system":  version_data["system"],
        "user":    version_data["user"],
        "version": current_version,
        "agent":   agent_name,
    }
