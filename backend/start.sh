#!/usr/bin/env bash
# ContextFlow API launcher
#   GPU 0  — Ollama VLM  (qwen3-vl:30b)
#   GPU 1  — Embedding   (BAAI/bge-large-en-v1.5)
#
# Usage:
#   ./start.sh                  # production
#   ./start.sh --reload         # dev (hot-reload)
#   SKIP_VLM=true ./start.sh    # skip VLM enrichment

set -e
cd "$(dirname "$0")"

# ── Activate virtualenv if present ───────────────────────────────────────────
VENV_ACTIVATE="/storage/sourava/RAG_Pipeline/FInal/ragenv/bin/activate"
if [ -f "$VENV_ACTIVATE" ]; then
    # shellcheck disable=SC1090
    source "$VENV_ACTIVATE"
fi

# ── Start Ollama on GPU 0 (if not already running) ───────────────────────────
if ! curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "[start.sh] Starting Ollama on GPU 0 …"
    CUDA_VISIBLE_DEVICES=0 OLLAMA_HOST=0.0.0.0 ollama serve &
    OLLAMA_PID=$!
    echo "[start.sh] Ollama PID=$OLLAMA_PID — waiting for it to be ready …"
    for i in $(seq 1 30); do
        sleep 2
        if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "[start.sh] Ollama ready"
            break
        fi
    done
else
    echo "[start.sh] Ollama already running — skipping start"
fi

# ── Expose GPUs 1,2,5,7 to our process ──────────────────────────────────────
# GPU 0 is reserved for Ollama VLM.
# GPUs 3,4,6 are in use by other workloads.
# GPUs 1,2,5,7 are free — expose all four so Docling workers can spread across them.
# Inside the process: cuda:0=GPU1, cuda:1=GPU2, cuda:2=GPU5, cuda:3=GPU7
# Embedding model pins to cuda:0 (GPU 1) via EMBED_DEVICE in .env.
export CUDA_VISIBLE_DEVICES=1,2,5,7

# ── Launch uvicorn ────────────────────────────────────────────────────────────
echo "[start.sh] Starting ContextFlow API …"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 "$@"
