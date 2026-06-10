"""
OpenRouter parallel throughput tester.
Tests 5, 10, 20 concurrent workers and reports RPM + latency per round.
Usage: python test_parallel_throughput.py
"""
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from joblib import Parallel, delayed
from openai import OpenAI

API_KEY  = os.environ["OPENROUTER_API_KEY"]
BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
MODEL    = "google/gemma-4-31b-it:free"  # multimodal: handles both text and vision

PROMPT = (
    "Summarize the following text in 2 sentences:\n\n"
    "Artificial intelligence is transforming industries by automating complex tasks, "
    "enabling smarter decision-making, and creating new opportunities for innovation. "
    "Machine learning models can now process vast amounts of data to identify patterns "
    "that would take humans years to discover."
)

client = OpenAI(base_url=BASE_URL, api_key=API_KEY)


def _single_call(worker_id: int) -> dict:
    t0 = time.perf_counter()
    status = "ok"
    error  = ""
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": PROMPT}],
            temperature=0.1,
            timeout=60,
        )
        _ = resp.choices[0].message.content
    except Exception as exc:
        status = "fail"
        error  = str(exc)[:80]
    latency = time.perf_counter() - t0
    return {"id": worker_id, "status": status, "latency": latency, "error": error}


def run_round(n_workers: int) -> None:
    print(f"\n── Workers: {n_workers} {'─' * (40 - len(str(n_workers)))}")
    t_start = time.perf_counter()

    results = Parallel(n_jobs=n_workers, backend="threading")(
        delayed(_single_call)(i) for i in range(n_workers)
    )

    elapsed  = time.perf_counter() - t_start
    success  = [r for r in results if r["status"] == "ok"]
    failed   = [r for r in results if r["status"] != "ok"]
    rpm      = (len(success) / elapsed) * 60 if elapsed > 0 else 0
    avg_lat  = sum(r["latency"] for r in success) / len(success) if success else 0
    min_lat  = min((r["latency"] for r in success), default=0)
    max_lat  = max((r["latency"] for r in success), default=0)

    print(f"  Sent:        {n_workers}")
    print(f"  Success:     {len(success)}   Failed: {len(failed)}")
    print(f"  Total time:  {elapsed:.2f}s")
    print(f"  RPM:         {rpm:.0f}")
    print(f"  Avg latency: {avg_lat:.2f}s   Min: {min_lat:.2f}s   Max: {max_lat:.2f}s")
    if failed:
        for r in failed:
            print(f"  [FAIL worker-{r['id']}] {r['error']}")


if __name__ == "__main__":
    print(f"Model : {MODEL}")
    print(f"Target: {BASE_URL}")
    print("Warming up with 1 request …", end=" ", flush=True)
    warmup = _single_call(0)
    if warmup["status"] != "ok":
        print(f"FAILED — {warmup['error']}")
        sys.exit(1)
    print(f"ok ({warmup['latency']:.2f}s)\n")

    for n in [5, 10, 20]:
        run_round(n)

    print("\n── Done ─────────────────────────────────────")
