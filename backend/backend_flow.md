# Backend Flow — End-to-End Reference

## Overview

The backend has two main paths: **Ingestion** (file → indexed chunks) and **Retrieval** (query → streamed answer). Both share the same FastAPI app on port 8000. The ingestion worker runs as a background daemon thread inside the same server process.

---

## 1. Upload

**Entry:** `POST /api/user/upload` → `routers/upload.py`

1. JWT auth resolves `user_id` and `org_id` — no UUIDs in the request.
2. Daily upload limit checked (50 files/user/day).
3. Collection resolved by name; document limit checked.
4. `services/validator.py` runs 7 checks in sequence:
   - Extension allowed → MIME type matches → file not empty → size within limit → not password-protected → PDF parseable → SHA-256 duplicate check.
   - Duplicate check: if same hash exists in DB **and** PDF is on disk → blocked. If hash exists but file is missing → re-upload allowed (updates paths).
5. `services/storage.py` writes the file to `STORAGE_ROOT/{uuid}/{uuid}.pdf`.
6. A `documents` row is inserted with `status=QUEUED` and `storage_mode` (Vector_DB / both_DB / no_DB).
7. Response returns `doc_id` immediately — ingestion is async.

---

## 2. Ingestion Worker

**Entry:** `services/worker.py` → `_worker_loop()` running in a daemon thread.

- Polls DB every `WORKER_POLL_INTERVAL` seconds for the oldest `QUEUED` document using `SELECT … FOR UPDATE SKIP LOCKED` (atomic claim, safe under restarts).
- On server startup, re-queues any document stuck in a non-terminal status (CONVERTING / PARSING / CHUNKING / EMBEDDING / INDEXING) — self-heals after crashes.
- A watchdog thread monitors the worker thread and relaunches it if it ever dies.
- Processes one document at a time; the pipeline itself is internally parallel.

### Worker dispatch for `no_DB` mode

After the pipeline completes, if `storage_mode == "no_DB"`:
- Calls `services/ingestion/json_storage.save(doc_id, filename, chunks_payload)`.
- Writes `CHUNKS_STORAGE_ROOT/{doc_id}/{filename}/chunks.json` to disk.
- Skips summarizer, indexer, and graph — marks COMPLETED immediately.

---

## 3. Ingestion Pipeline

**Entry:** `services/ingestion/pipeline.py` → `run(doc_id, pdf_path, output_dir, db)`

Status transitions: `QUEUED → CONVERTING → PARSING → CHUNKING`

### Stage CONVERTING

**[1] Render page PNGs**
- PyMuPDF (fitz) renders every PDF page to a PNG at `PAGE_RENDER_DPI` (300 DPI).
- Stored temporarily in `output_dir/pages/`.

**[2] Parallel Docling OCR**
- PDF is split into N sub-PDFs (one per worker, up to `DOCLING_WORKERS`).
- Each sub-PDF is processed in a `ProcessPoolExecutor` (spawn context, with `PR_SET_PDEATHSIG` so child processes die if the parent is killed).
- Each worker calls `run_docling()`: full Docling pipeline with OCR, table structure (TableFormer FAST), formula enrichment, picture image extraction.
- Results (page elements + page sizes) are merged back by page number.

**[3] Reading-order sort**
- Elements on each page are sorted: left column before right column (split at page midpoint), then top-to-bottom within each column.

### Stage PARSING

**[4] VLM enrichment** (skipped if `SKIP_VLM=true`)
- For every extracted picture element, crops the image (from the saved PNG) and sends it to the configured VLM (Ollama or OpenRouter) via `services/llm_client.call_vision()`.
- Up to `VLM_WORKERS` parallel threads; 3 retries with exponential back-off per image.
- The description is written back into the element dict.

**Page image storage**
- Each page PNG is converted to WebP (max dimension `PAGE_IMAGE_MAX_DIM`, quality `PAGE_IMAGE_WEBP_QUALITY`).
- WebP files saved to `output_dir/pages_webp/`.
- Paths + pixel dimensions inserted into `document_pages` table (used later for citation evidence).
- Temporary PNGs deleted.

**Markdown export**
- Per-page markdown files written to `output_dir/pages_md/page_N.md`.
- Full concatenated markdown written to `output_dir/{pdf_name}.md`.

### Stage CHUNKING

**[5] Fast Docling pass**
- A second, lightweight Docling run (no OCR, no formula enrichment, no picture images) on the original PDF — used only to produce the document object for the chunker.

**[6] Build chunks**
- `HybridChunker` (or `HierarchicalChunker`) splits the document into token-bounded chunks.
- Each chunk gets `contextualized_text` (heading breadcrumb prepended), `raw_text`, `chunk_index`, `chunk_id` (UUID), `bbox`, and `page` number.
- Figure chunks are built separately from `page_elements`: one chunk per picture that has a VLM description, carrying `caption`, `image_ref`, `parent_heading`, and `text = heading + caption + description`.
- Figure chunks are interleaved with text chunks by page number.

**Pipeline output**
- `chunks_payload` dict (source, chunk_count, chunker config, all chunks) stored in worker memory.
- `layout_dict` (per-page element map with bboxes) + `ingestion_report` saved to the `documents` row via `crud.save_pipeline_result()`.

---

## 4. Summarizer

**Entry:** `services/ingestion/summarizer.py` → called by worker after pipeline.

- Samples up to 20 chunks from `chunks_payload`.
- **Pass 1:** LLM call with existing `domain.yaml` — produces summary, assigns domain, confidence score, `needs_graph` flag. If no existing domain matches, proposes a new domain name + definition.
- **Pass 2** (only when a new domain is proposed): normalises the proposed name to field-level, checks for subdomain overlap with existing domains, updates `domain.yaml`.
- Writes one row to `doc_summary` table (summary, assigned_domain, confidence, needs_graph, model_used).
- Up to 3 retries on LLM failure; on permanent failure writes a null row so the entry exists.

---

## 5. Indexing

### Vector + BM25 (Vector_DB / both_DB)

**Entry:** `services/ingestion/indexer.py` → `run(doc_id, chunks_payload, db, collection_name)`

**EMBEDDING stage**
- Loads `BAAI/bge-large-en-v1.5` via SentenceTransformer onto `EMBED_DEVICE` (cuda:0 by default).
- Auto-selects batch size from `VRAM_BATCH` thresholds (512 for ≥24 GB VRAM, down to 64 for CPU).
- Encodes all chunk texts in batches; optionally FP16.

**INDEXING stage**
- Inserts chunk rows into `document_chunks` (PostgreSQL) with `is_indexed=False` — enables BM25 full-text search immediately.
- Upserts embeddings into ChromaDB (`PersistentClient`) under a collection named by `to_chroma_name(collection_name)`.
- Sets `is_indexed=True` on all chunks after ChromaDB upsert succeeds.
- If the document is deleted mid-ingestion, rolls back `document_chunks` entries.

### Knowledge Graph (both_DB — parallel with vector)

**Ontology Agent** → `services/ingestion/ontology_agent.py`
- Batches chunks (`ONTOLOGY_BATCH_SIZE`) and sends each batch to the LLM asking it to propose entity types and relationship types relevant to the document.
- Detects saturation (if new types stop appearing for `SATURATION_WINDOW` batches, stops early).
- Merges proposals; if a collection ontology already exists, sends a consolidation pass to normalise and deduplicate.
- Returns final `{entity_types: [...], relationship_types: [...]}` dict.

**Graph Indexer** → `services/ingestion/graph_indexer.py`
- For each chunk, sends an LLM extraction call with the ontology to extract `(entity, relation, entity)` triples.
- Up to `GRAPH_EXTRACTION_WORKERS` parallel extractions.
- Upserts nodes and edges into Memgraph (bolt port 7688) with collection and doc metadata.

Both vector and graph indexers run in parallel threads (`ThreadPoolExecutor(max_workers=2)`). Either failure raises and marks the document FAILED.

---

## 6. Retrieval

**Entry:** `POST /api/v1/retrieval/query` → `routers/retrieval.py`

1. JWT auth; collection resolved and locked to the session on first query.
2. Existing `session_id` loads conversation history (last N turns); no `session_id` creates a new session.
3. `doc_id` in the request scopes retrieval to a single document (also locked at session creation).
4. Initial state dict built and passed into `services/retrieval/workflow.py → workflow_app`.
5. Response is an SSE `StreamingResponse` — each agent emits `data: {...}` JSON lines.

### LangGraph Workflow

Compiled once at server startup as a `StateGraph`. All agents inherit `BaseAgent` which wires SSE emission via `get_stream_writer()`.

```
START
  → QueryRewriter
  → QueryPlanner
  → RetrievalAgent
  → [route_after_retrieval]
       "no_context" → no_context_node → END
       "answer"     → AnswerAgent → VerificationAgent → [route_after_verification]
                                        "citation"   → CitationAgent → END
                                        "refinement" → RefinementAgent → RetrievalAgent (loop)
```

#### Agent 1 — QueryRewriter (`agents/query_rewriter.py`)
- Receives `raw_query` + `conversation_history`.
- LLM resolves pronouns and co-references using prior turns, produces a self-contained `rewritten_query`.
- Classifies complexity: `simple` (single factual answer) or `complex` (multi-part / comparative).

#### Agent 2 — QueryPlanner (`agents/query_planner.py`)
- `simple` → `planned_queries = [rewritten_query]`, passthrough.
- `complex` → LLM decomposes into up to 3 focused sub-queries, each targeting a distinct aspect.

#### Agent 3 — RetrievalAgent (`agents/retrieval_agent.py`)
- For each planned sub-query, runs **in parallel**:
  - `services/vector_store.py`: ChromaDB ANN search, top `RETRIEVAL_TOP_K` chunks.
  - `services/bm25_store.py`: PostgreSQL `ts_rank` full-text search on `document_chunks`, top `RETRIEVAL_TOP_K` chunks.
- Deduplicates by `chunk_id`; tags each chunk `retrieval_source`: `"vector"` / `"bm25"` / `"both"` (chunks found by both are highest confidence).
- Feeds merged pool into `services/reranker.py`: `BAAI/bge-reranker-v2-m3` cross-encoder, keeps top `RERANK_TOP_K`.
- If `is_graph=true`, also calls `services/graph_store.py`: Memgraph traversal up to `GRAPH_HOPS` hops, results appended to `graph_context`.
- If no chunks and no graph context → sets `no_context=true`.

#### Agent 4 — AnswerAgent (`agents/answer_agent.py`)
- Formats retrieved chunks as numbered context blocks.
- LLM generates answer grounded in context.
- If context is empty → grounded refusal (short apology, no citations, `no_answer=true` in `stream_end`).

#### Agent 5 — VerificationAgent (`agents/verification_agent.py`)
- LLM scores the answer against `rewritten_query` + chunks, returns 0.0–1.0.
- Tracks `best_answer` / `best_score` across iterations.
- Pass thresholds: `VERIFY_PASS_SIMPLE` (0.70) for simple, `VERIFY_PASS_COMPLEX_EARLY` (0.85) for complex early exit.
- Returns `verification_feedback` (text) used by the refinement agent if not passed.

#### Routing after verification
- `iteration >= MAX_ITERATIONS` → CitationAgent (stop).
- Score passes threshold → CitationAgent.
- Score fails and iterations remain → RefinementAgent.

#### Agent 6 — RefinementAgent (`agents/refinement_agent.py`)
- LLM generates 1 refined sub-query based on `rewritten_query` + `verification_feedback` + current score.
- Writes back into `planned_queries`; increments `iteration`.
- Loops back to RetrievalAgent.

#### Agent 7 — CitationAgent (`agents/citation_agent.py`)
- For complex queries: resolves final answer — uses `best_answer` if `best_score >= VERIFY_PASS_COMPLEX_FALLBACK` (0.70), otherwise `current_answer`.
- LLM extracts citation spans from the final answer, maps them to source chunks (chunk_id, doc_name, page numbers).
- Figure chunks carry `figure_path` + `figure_b64` inline so the frontend renders figures without a separate request.
- Saves the full turn (query, rewritten_query, answer, citations, score, iterations) to `conversation_turns`.

### SSE stream event sequence
```
session_start → [agent] start/done (×N) → stream_end
```
`stream_end` carries `session_id`, `graph_ui` (nodes + edges if `is_graph=true`), and `no_answer` flag.

---

## 7. Evidence Endpoint

**Entry:** `GET /api/evidence/{chunk_id}` → `routers/evidence.py`

- Fetches chunk metadata from `document_chunks` (bbox, page numbers, chunk_type).
- For text chunks: loads WebP images from `document_pages` for each page the chunk spans; returns pixel-space bboxes (y-flipped from PDF space) ready for direct rectangle rendering.
- For figure chunks: reads the extracted figure PNG from disk via `services/figure_store.py`; returns `figure_image_b64` as primary + the source page WebP as secondary.

---

## 8. Storage Map

| Store | What lives there |
|---|---|
| PostgreSQL | `documents`, `document_chunks` (BM25 FTS), `document_pages` (WebP paths + dims), `doc_summary`, `collections`, `organisations`, `users`, `conversations`, `conversation_turns` |
| ChromaDB | Chunk embeddings, keyed by `chunk_id`, namespaced by collection |
| Memgraph | Entity nodes + relationship edges per collection/document |
| Disk | Uploaded PDFs (`STORAGE_ROOT`), WebP page images, figure PNGs, per-page markdown, full markdown, `chunks.json` (no_DB mode only at `CHUNKS_STORAGE_ROOT`) |

---

## 9. Document Status Flow

```
QUEUED → CONVERTING → PARSING → CHUNKING → EMBEDDING → INDEXING → COMPLETED
                                                                  ↗
                                                           FAILED (retryable)
```

`no_DB` skips EMBEDDING and INDEXING entirely — pipeline ends at CHUNKING and goes straight to COMPLETED after saving chunks.json.

---

## 10. Key Config Knobs (`app/config.py` + `.env`)

| Setting | Default | Effect |
|---|---|---|
| `SKIP_VLM` | false | Skip VLM image description in pipeline |
| `DOCLING_WORKERS` | auto (cpu//4, max 8) | Parallel PDF OCR workers |
| `VLM_WORKERS` | 5 | Parallel VLM image calls |
| `EMBED_DEVICE` | cuda:0 | Device for SentenceTransformer embedding |
| `RETRIEVAL_TOP_K` | 5 | Chunks fetched per query from each store |
| `RERANK_TOP_K` | 3 | Chunks kept after reranking |
| `MAX_ITERATIONS` | 3 | Max refinement loops per query |
| `GRAPH_HOPS` | 2 | Memgraph traversal depth |
| `VERIFY_PASS_SIMPLE` | 0.70 | Score threshold for simple queries |
| `VERIFY_PASS_COMPLEX_EARLY` | 0.85 | Early-exit score for complex queries |
| `VERIFY_PASS_COMPLEX_FALLBACK` | 0.70 | Min score to use best_answer at citation |
