#!/usr/bin/env bash
source /storage/sourava/RAG_Pipeline/FInal/ragenv/bin/activate
LIB=/storage/sourava/RAG_Pipeline/FInal/ragenv/lib/python3.12/site-packages/nvidia/nccl/lib/libnccl.so.2

for ver in 2.28.9 2.29.3 2.29.7 2.30.3 2.30.4; do
    echo "=== Testing nvidia-nccl-cu12==$ver ==="
    pip install "nvidia-nccl-cu12==$ver" -q
    if python3 -c "import torch; print('torch OK')" 2>&1 | grep -q "torch OK"; then
        echo "SUCCESS: torch imports cleanly with nvidia-nccl-cu12==$ver"
        python3 -c "import torch; print('Version:', torch.__version__)"
        break
    else
        ERR=$(python3 -c "import torch" 2>&1 | grep "undefined symbol" | head -1)
        echo "FAILED in $ver — $ERR"
    fi
done
