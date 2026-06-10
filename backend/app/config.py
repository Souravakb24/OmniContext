from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "ContextFlow"
    POSTGRES_USER: str = "postgres_sourava"
    POSTGRES_PASSWORD: str = "contextflow123"
    DATABASE_URL: str = "postgresql://postgres_sourava:contextflow123@localhost:5432/ContextFlow"

    ENCRYPTION_KEY: str
    HASH_SECRET: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRES_MINUTES: int = 1440

    SUPER_ADMIN_SECRET: str

    # ── Upload settings ───────────────────────────────────────────────────────
    STORAGE_ROOT: Path = Path("/storage/sourava/RAG_Pipeline/SD/upload_api/storage")
    CHUNKS_STORAGE_ROOT: Path = Path("/storage/sourava/RAG_Pipeline/SD/upload_api/chunks_storage")
    MAX_UPLOAD_SIZE_MB: int = 500
    MIN_FILE_SIZE_BYTES: int = 4096
    ALLOWED_EXTENSIONS: str = ".pdf,.docx,.ppt,.pptx"
    CONVERTIBLE_EXTENSIONS: str = ".docx,.ppt,.pptx"
    MIME_MAP: str = (
        ".pdf=application/pdf"
        "|.docx=application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        "|.ppt=application/vnd.ms-powerpoint"
        "|.pptx=application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    LIBREOFFICE_BIN: str = "soffice"
    LIBREOFFICE_TIMEOUT: int = 120
    CLAMAV_ENABLED: bool = False
    CLAMD_HOST: str = "localhost"
    CLAMD_PORT: int = 3310
    VALIDATION_PARALLEL_TIMEOUT: int = 30

    # ── LLM provider ─────────────────────────────────────────────────────────
    # Set LLM_PROVIDER=ollama to use local Ollama instead of OpenRouter
    LLM_PROVIDER: str = "openrouter"
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_API_KEY: str = ""
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"

    # ── Model names — OpenRouter ──────────────────────────────────────────────
    OPENROUTER_VLM_MODEL: str = "google/gemma-4-31b-it:free"
    OPENROUTER_SUMMARIZER_MODEL: str = "openai/gpt-oss-20b:free"
    OPENROUTER_GRAPH_MODEL: str = "openai/gpt-oss-20b:free"

    # ── Model names — Ollama ──────────────────────────────────────────────────
    OLLAMA_VLM_MODEL: str = "qwen3-vl:30b"
    OLLAMA_SUMMARIZER_MODEL: str = "gpt-oss:20b"
    OLLAMA_GRAPH_MODEL: str = "gemma4:e4b"

    # ── Ingestion settings ────────────────────────────────────────────────────
    OLLAMA_URL: str = "http://localhost:11434/v1/chat/completions"
    OLLAMA_CUDA_DEVICE: str = "0"      # GPU for Ollama VLM (used in start.sh)
    SKIP_VLM: bool = False
    VLM_WORKERS: int = 5               # parallel VLM image calls (capped for free-tier rate limit)
    DOCLING_WORKERS: int = 32
    EMBED_DEVICE: str = "cuda:0"       # cuda:0 inside server process == physical GPU 1
    EMBED_FP16: bool = False
    CHROMA_DB_PATH: Path = Path("/storage/sourava/RAG_Pipeline/SD/vector/chroma_db")
    CHROMA_COLLECTION: str = "rag_chunks"
    WORKER_POLL_INTERVAL: int = 5      # seconds between polls when queue is empty

    # ── Memgraph ──────────────────────────────────────────────────────────────
    MEMGRAPH_HOST: str = "localhost"
    MEMGRAPH_PORT: int = 7688
    MEMGRAPH_USER: str = "rahul1"
    MEMGRAPH_PASSWORD: str = "pass1234"

    # ── Retrieval settings ────────────────────────────────────────────────────
    RERANKER_MODEL: str = "BAAI/bge-reranker-v2-m3"
    RERANKER_DEVICE: str = "cuda:0"
    RETRIEVAL_TOP_K: int = 5           # chunks fetched per query from vector store
    RERANK_TOP_K: int = 3              # chunks kept after reranking
    MAX_ITERATIONS: int = 3            # max refinement iterations
    GRAPH_HOPS: int = 2                # memgraph traversal hops
    VERIFY_PASS_SIMPLE: float = 0.70
    VERIFY_PASS_COMPLEX_EARLY: float = 0.85    # early exit if score >= this
    VERIFY_PASS_COMPLEX_FALLBACK: float = 0.70  # use best answer if >= this

    # ── Logging / telemetry ───────────────────────────────────────────────────
    LOG_LEVEL:          str  = "INFO"
    LOG_DIR:            str  = "logs"
    LOG_RETENTION_DAYS: int  = 14

    # ── Ontology agent ────────────────────────────────────────────────────────
    ONTOLOGY_BATCH_SIZE:        int = 10
    ONTOLOGY_MAX_ENTITY_TYPES:  int = 15
    ONTOLOGY_MAX_REL_TYPES:     int = 20
    ONTOLOGY_WORKERS:           int = 1
    GRAPH_EXTRACTION_WORKERS:   int = 1
    SATURATION_WINDOW:          int = 5
    SATURATION_THRESHOLD:       int = 15

    class Config:
        env_file = ".env"


settings = Settings()
