# Logging & Observability System — Design Report

**Scope**: Full backend telemetry, error tracking, and super admin dashboard  
**Access**: Super admin only — all endpoints gated behind `get_current_super_admin`  
**Principle**: Zero impact on business logic. Purely additive.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Backend Services                     │
│                                                         │
│  llm_client.py ──► emit_event(llm_call)                │
│  worker.py ──────► emit_event(doc_lifecycle)           │
│  pipeline.py ────► emit_event(ingestion_stage)         │
│  retrieval_agent ► emit_event(retrieval_result)        │
│  bm25/vector/graph► emit_event(store_result)           │
│  reranker ───────► emit_event(reranker_result)         │
│  routers/* ──────► emit_event(api_request)             │
└───────────────────────────┬─────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │   app/core/telemetry.py    │
              │   (central emit function)  │
              └─────────────┬──────────────┘
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
  ┌───────▼────────┐               ┌──────────▼──────────┐
  │  Loguru File   │               │  PostgreSQL          │
  │  logs/app.log  │               │  pipeline_events     │
  │  logs/error.log│               │  (structured rows)   │
  └────────────────┘               └──────────┬───────────┘
                                              │
                                   ┌──────────▼───────────┐
                                   │  Super Admin API      │
                                   │  /api/super_admin/   │
                                   │  logs/*              │
                                   └──────────────────────┘
```

---

## 2. Database Schema

### Table: `pipeline_events`

| Column | Type | Description |
|---|---|---|
| `id` | UUID PK | Row identifier |
| `event_type` | VARCHAR(50) | See event types below |
| `status` | VARCHAR(20) | `success` / `error` / `warning` |
| `doc_id` | UUID nullable | Correlation ID for ingestion path |
| `query_id` | UUID nullable | Correlation ID for retrieval path |
| `collection_id` | UUID nullable | Which collection this belongs to |
| `org_id` | UUID nullable | Which org this belongs to |
| `stage` | VARCHAR(50) | Specific stage name within event type |
| `duration_ms` | INTEGER | How long the operation took |
| `input_tokens` | INTEGER nullable | LLM prompt tokens |
| `output_tokens` | INTEGER nullable | LLM completion tokens |
| `error_type` | VARCHAR(100) nullable | Exception class name |
| `error_message` | TEXT nullable | Full error message |
| `error_traceback` | TEXT nullable | Full traceback for debugging |
| `metadata` | JSONB | Any extra structured data |
| `created_at` | TIMESTAMP | When the event occurred |

**Indexes needed**:
- `(event_type, created_at DESC)` — dashboard list queries
- `(doc_id)` — trace a document's full journey
- `(query_id)` — trace a query's full journey
- `(status, created_at DESC)` — error dashboard
- `(org_id, created_at DESC)` — per-org views

---

## 3. Event Types Catalogue

### Ingestion Events

| `event_type` | `stage` | Key `metadata` fields |
|---|---|---|
| `doc_lifecycle` | `claimed` | `doc_id`, `collection_id`, `filename` |
| `doc_lifecycle` | `started` | `doc_id`, `collection_id` |
| `doc_lifecycle` | `completed` | `doc_id`, total `duration_ms`, `chunk_count` |
| `doc_lifecycle` | `failed` | `doc_id`, `error_type`, `error_message`, `error_traceback` |
| `ingestion_stage` | `chunking` | `chunk_count`, `duration_ms` |
| `ingestion_stage` | `summarization` | `duration_ms`, `input_tokens`, `output_tokens` |
| `ingestion_stage` | `embedding` | `chunk_count`, `duration_ms` |
| `ingestion_stage` | `graph_indexing` | `entity_count`, `edge_count`, `duration_ms` |
| `ingestion_stage` | `bm25_indexing` | `chunk_count`, `duration_ms` |
| `llm_call` | `ontology` | `model`, `input_tokens`, `output_tokens`, `duration_ms`, `reused: bool` |
| `llm_call` | `summarization` | `model`, `input_tokens`, `output_tokens`, `duration_ms` |
| `llm_call` | `graph_extraction` | `model`, `input_tokens`, `output_tokens`, `duration_ms` |
| `llm_call` | `vlm_page` | `model`, `page_number`, `duration_ms` |

### Retrieval Events

| `event_type` | `stage` | Key `metadata` fields |
|---|---|---|
| `query_lifecycle` | `received` | `query_id`, `query_text`, `collection_id` |
| `query_lifecycle` | `completed` | `query_id`, `total_duration_ms` |
| `query_lifecycle` | `failed` | `query_id`, `error_type`, `error_message`, `error_traceback` |
| `llm_call` | `query_plan` | `model`, `input_tokens`, `output_tokens`, `duration_ms` |
| `llm_call` | `query_rewrite` | `model`, `input_tokens`, `output_tokens`, `duration_ms` |
| `llm_call` | `answer` | `model`, `input_tokens`, `output_tokens`, `duration_ms` |
| `store_result` | `bm25` | `query_id`, `hit_count`, `was_empty: bool`, `duration_ms` |
| `store_result` | `vector` | `query_id`, `hit_count`, `duration_ms` |
| `store_result` | `graph` | `query_id`, `entity_matches`, `traversal_hits`, `was_empty: bool`, `duration_ms` |
| `reranker_result` | — | `query_id`, `input_count`, `output_count`, `top_score`, `duration_ms` |

### System Events

| `event_type` | `stage` | Key `metadata` fields |
|---|---|---|
| `system` | `startup` | `server_version`, `gpu_count`, `llm_provider` |
| `system` | `shutdown` | `reason` |
| `system` | `worker_error` | `error_type`, `error_message`, `error_traceback` |

---

## 4. New Files (3)

### `app/core/logging.py`
Loguru configuration only. Sets up:
- **Console sink**: human-readable, colorized, INFO level
- **`logs/app.log`**: rotating daily, keep 14 days, JSON format, DEBUG level
- **`logs/error.log`**: rotating daily, keep 30 days, JSON format, ERROR level only

All other files import `logger` from here. No business logic.

### `app/core/telemetry.py`
Single function: `emit_event(event_type, stage, status, **kwargs)`.

Responsibilities:
- Writes a row to `pipeline_events` (fire-and-forget, non-blocking)
- Also logs the event via loguru (so it appears in files too)
- Swallows its own exceptions — a logging failure must never crash the pipeline
- Uses a separate DB session from the main request session (avoids rollback conflicts)

### `alembic/versions/015_pipeline_events.py`
Migration adding the `pipeline_events` table and all indexes listed in Section 2.

---

## 5. Files to Modify

### Infrastructure (3 files)

| File | Change |
|---|---|
| `app/main.py` | Call `setup_logging()` from `core/logging.py` in lifespan startup. Emit `system.startup` event. |
| `app/models.py` | Add `PipelineEvent` SQLAlchemy model |
| `app/config.py` | Add `LOG_LEVEL`, `LOG_DIR`, `LOG_RETENTION_DAYS` env settings |

### LLM Client — Most Important (1 file)

**`app/services/llm_client.py`** — This is the single choke point for all LLM calls.

Both `call_text` and `call_text_async` already have `resp` in scope. `resp.usage` contains `prompt_tokens` and `completion_tokens`. Add `emit_event("llm_call", stage=stage_param, input_tokens=resp.usage.prompt_tokens, output_tokens=resp.usage.completion_tokens, ...)` before returning.

Add a `stage` parameter to both functions so callers declare their stage (`"ontology"`, `"answer"`, etc.). All callers already pass `model` — just add one more param.

This single change captures **all token usage** across the entire system automatically.

### Ingestion Path (4 files)

| File | What to add |
|---|---|
| `app/services/worker.py` | `doc_claimed`, `doc_started`, `doc_completed`, `doc_failed` lifecycle events with `doc_id` as correlation ID |
| `app/services/ingestion/pipeline.py` | Wrap each stage (chunking, embedding, graph, bm25) with `time.perf_counter()` and emit `ingestion_stage` event after each |
| `app/services/ingestion/ontology_agent.py` | Emit whether ontology was reused (skip LLM) or freshly extracted |
| `app/services/ingestion/graph_indexer.py` | Emit entity count + edge count after indexing completes |

### Retrieval Path (6 files)

| File | What to add |
|---|---|
| `app/routers/retrieval.py` | Generate `query_id = uuid4()` at entry point, add to state, emit `query_lifecycle.received` and `query_lifecycle.completed` |
| `app/services/retrieval/state.py` | Add `query_id: str` field to `RetrievalState` |
| `app/services/retrieval/services/bm25_store.py` | Emit `store_result.bm25` with hit count and `was_empty` flag |
| `app/services/retrieval/services/vector_store.py` | Emit `store_result.vector` with hit count |
| `app/services/retrieval/services/graph_store.py` | Emit `store_result.graph` with entity matches + traversal hits |
| `app/services/retrieval/services/reranker.py` | Emit `reranker_result` with scores and duration |

---

## 6. Super Admin Dashboard API

All endpoints live in `app/routers/super_admin.py`, gated by `Depends(get_current_super_admin)`.  
Prefix: `/api/super_admin/logs/`

### Overview / Summary

```
GET /api/super_admin/logs/summary
```
Returns counts for last 24h / 7d / 30d:
- Total documents ingested, success vs failed
- Total queries handled, success vs failed
- Total LLM calls, total tokens consumed (input + output)
- Average ingestion duration, average query latency
- Error rate percentage

### Document Ingestion Logs

```
GET /api/super_admin/logs/ingestion?page=1&limit=50&status=error&collection_id=...&from=...&to=...
```
Returns per-document rows: doc_id, collection, org, status, total duration, chunk count, entity count, error if failed.

```
GET /api/super_admin/logs/ingestion/{doc_id}/trace
```
Returns the complete timeline for one document — every stage event in order with durations. Useful for debugging "why did this doc take 10 minutes?".

### Query / Retrieval Logs

```
GET /api/super_admin/logs/queries?page=1&limit=50&status=error&collection_id=...
```
Returns per-query rows: query_id, collection, org, total latency, BM25 hits, vector hits, graph hits, reranker top score, status.

```
GET /api/super_admin/logs/queries/{query_id}/trace
```
Complete timeline for one query — every agent + store event in order with durations and hit counts.

### LLM Token Usage

```
GET /api/super_admin/logs/tokens?from=...&to=...&group_by=stage|model|day
```
Returns token consumption broken down by stage (ontology, answer, rewrite, etc.), model, and time period.  
Key metrics: `input_tokens_total`, `output_tokens_total`, `call_count`, `avg_latency_ms`.

### Error Dashboard

```
GET /api/super_admin/logs/errors?page=1&limit=50&from=...&to=...
```
Returns all `status=error` events across both ingestion and retrieval, with:
- `event_type`, `stage`, `error_type`, `error_message`
- `doc_id` or `query_id` for context
- `collection_id`, `org_id`
- `created_at`

```
GET /api/super_admin/logs/errors/grouped
```
Groups errors by `error_type` with count — tells you "you have 47 `JSONDecodeError` from ontology agent" at a glance.

### Store Health (Retrieval Quality)

```
GET /api/super_admin/logs/store-health?from=...&to=...
```
Returns empty-result rates per store:
- BM25 empty rate %
- Vector empty rate %
- Graph empty rate %

This directly tells you which retrieval component is underperforming.

---

## 7. Token Tracking — How It Works

`llm_client.py` already captures `resp` from the OpenAI-compatible API. Both Ollama and OpenRouter return a `usage` object:

```
resp.usage.prompt_tokens    → input_tokens
resp.usage.completion_tokens → output_tokens
resp.usage.total_tokens     → sum
```

The `call_text` and `call_text_async` functions get a new `stage` parameter. Every caller already knows its stage. `llm_client.py` calls `emit_event` before returning. No other file needs to think about tokens.

---

## 8. Error Tracking — Design

Errors are captured at two levels:

**Level 1 — Worker/Router catch-all**  
`worker.py` wraps the entire document processing in try/except. On failure, emits `doc_lifecycle.failed` with `error_type` (exception class name), `error_message`, and full `error_traceback`. Same pattern in `retrieval.py` router.

**Level 2 — Stage-level errors**  
Each stage in `pipeline.py` is individually wrapped. If chunking fails, you get a `ingestion_stage.chunking` error event — not just a generic "doc failed". This pinpoints exactly where in the pipeline the failure occurred.

**Error traceback storage**  
`error_traceback` is stored as TEXT in `pipeline_events`. This means from the super admin dashboard you can see the full Python traceback for any error without SSH-ing into the server.

---

## 9. Correlation ID Flow

```
Ingestion:
  worker.py claims doc → doc_id exists → all downstream events carry doc_id

Retrieval:
  router.py receives query → generates query_id = uuid4()
                           → adds to RetrievalState
                           → all agents/stores read from state and pass to emit_event
```

With this, from the super admin dashboard you can click any `doc_id` or `query_id` and see the **complete timeline** of every event that belongs to it.

---

## 10. Non-Functional Constraints

| Concern | Decision |
|---|---|
| Telemetry must not crash pipeline | `emit_event` wraps DB write in try/except, swallows all errors silently |
| Telemetry must not slow pipeline | DB write is fire-and-forget (no await on non-critical path), or async |
| Log files must not fill disk | Loguru rotation: daily + 50MB max, 14-day retention for app, 30-day for errors |
| Super admin API must be isolated | Already on separate `super_admin_app.py` — no org user can reach these endpoints |
| Sensitive data in logs | Query text is logged but no user PII — collection names, doc IDs, token counts only |

---

## 11. Implementation Order

1. **Alembic migration** — `pipeline_events` table + indexes
2. **`app/models.py`** — add `PipelineEvent` model
3. **`app/core/logging.py`** — loguru setup
4. **`app/core/telemetry.py`** — `emit_event` function
5. **`app/main.py`** — wire up logging on startup
6. **`app/services/llm_client.py`** — token capture (biggest leverage, one file)
7. **`app/services/worker.py`** — doc lifecycle events
8. **`app/services/ingestion/pipeline.py`** — stage timing events
9. **`app/services/retrieval/state.py`** — add `query_id` field
10. **`app/routers/retrieval.py`** — generate query_id, lifecycle events
11. **BM25 / vector / graph / reranker stores** — store result events
12. **`app/routers/super_admin.py`** — all dashboard endpoints

---

## 12. File Change Summary

| Category | Files | Type |
|---|---|---|
| New core | `app/core/logging.py`, `app/core/telemetry.py` | New |
| Migration | `alembic/versions/015_pipeline_events.py` | New |
| Infrastructure | `app/main.py`, `app/models.py`, `app/config.py` | Modify |
| LLM capture | `app/services/llm_client.py` | Modify |
| Ingestion | `worker.py`, `pipeline.py`, `ontology_agent.py`, `graph_indexer.py` | Modify |
| Retrieval | `state.py`, `routers/retrieval.py`, `bm25_store.py`, `vector_store.py`, `graph_store.py`, `reranker.py` | Modify |
| Dashboard API | `routers/super_admin.py` | Modify |
| **Total** | **3 new + 14 modified** | |
