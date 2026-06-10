"""
Static constants for the retrieval pipeline.
All tunable values come from app.config.settings.
"""
from app.config import settings

from app.services.llm_client import active_summarizer_model
SUMMARIZER_MODEL = active_summarizer_model()
OLLAMA_URL       = settings.OLLAMA_URL

EMBED_MODEL      = "BAAI/bge-large-en-v1.5"
EMBED_DEVICE     = settings.EMBED_DEVICE or "cuda:0"

RERANKER_MODEL   = settings.RERANKER_MODEL
RERANKER_DEVICE  = settings.RERANKER_DEVICE

RETRIEVAL_TOP_K  = settings.RETRIEVAL_TOP_K
RERANK_TOP_K     = settings.RERANK_TOP_K
MAX_ITERATIONS   = settings.MAX_ITERATIONS
GRAPH_HOPS       = settings.GRAPH_HOPS

VERIFY_PASS_SIMPLE          = settings.VERIFY_PASS_SIMPLE
VERIFY_PASS_COMPLEX_EARLY   = settings.VERIFY_PASS_COMPLEX_EARLY
VERIFY_PASS_COMPLEX_FALLBACK = settings.VERIFY_PASS_COMPLEX_FALLBACK

CHROMA_DB_PATH   = str(settings.CHROMA_DB_PATH)

MEMGRAPH_HOST     = settings.MEMGRAPH_HOST
MEMGRAPH_PORT     = settings.MEMGRAPH_PORT
MEMGRAPH_USER     = settings.MEMGRAPH_USER
MEMGRAPH_PASSWORD = settings.MEMGRAPH_PASSWORD

PROMPTS_DIR = "app/services/retrieval/prompts/agent_prompt_configs"
