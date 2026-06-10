# Super Admin — Logging & Telemetry Reference

Complete reference for every logging-related thing built for the super admin:
architecture, database schema, event catalogue, all emit points, API endpoints,
and the frontend dashboard.

---

## Architecture Overview

Two-layer system:

```
All pipeline code
      │
      ▼
emit_event()          ← app/core/telemetry.py
  │        │
  │        ▼
  │   pipeline_events  ← PostgreSQL table (structured telemetry)
  │
  ▼
loguru               ← app/core/logging.py
  ├── stderr (console, INFO+)
  ├── logs/app.log   (all levels, rotating 50 MB, 14 day retention)
  └── logs/error.log (ERROR only, rotating 50 MB, 30 day retention)
```

- `emit_event()` is **fire-and-forget** — it swallows every exception so a
  telemetry failure can never crash the caller.
- All log data in `pipeline_events` is visible **only** to super admins.
- Regular users and org admins have no access to any of these endpoints.

---

## Files Changed / Created

| File | Role |
|---|---|
| `app/core/logging.py` | Loguru setup — 3 sinks (console, app.log, error.log) |
| `app/core/telemetry.py` | `emit_event()` — writes to `pipeline_events` table |
| `app/core/__init__.py` | Package init |
| `alembic/versions/015_pipeline_events.py` | DB migration — creates table + 5 indexes |
| `app/models.py` | Added `PipelineEvent` SQLAlchemy model |
| `app/config.py` | Added `LOG_LEVEL`, `LOG_DIR`, `LOG_RETENTION_DAYS` settings |
| `app/main.py` | Calls `setup_logging()` at startup, emits `system.startup` event |
| `app/routers/super_admin.py` | 9 logging dashboard endpoints (+ existing auth/org endpoints) |

---

## Database Table — `pipeline_events`

```sql
CREATE TABLE pipeline_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(50)  NOT NULL,          -- doc_lifecycle / query_lifecycle / llm_call / etc.
    stage           VARCHAR(50),                    -- started / completed / failed / rewrite / answer / etc.
    status          VARCHAR(20)  NOT NULL DEFAULT 'success',  -- success | error
    doc_id          UUID,                           -- set for ingestion events
    query_id        UUID,                           -- set for retrieval events
    collection_id   UUID,                           -- set on both paths
    duration_ms     INTEGER,                        -- wall-clock time for the operation
    input_tokens    INTEGER,                        -- LLM prompt tokens
    output_tokens   INTEGER,                        -- LLM completion tokens
    error_type      VARCHAR(100),                   -- exception class name
    error_message   TEXT,                           -- str(exc)
    error_traceback TEXT,                           -- full traceback string
    metadata        JSONB,                          -- extra key/value pairs per event type
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Indexes (5 total)

| Index | Columns | Purpose |
|---|---|---|
| `ix_pe_event_type_created` | `event_type, created_at DESC` | summary queries by type |
| `ix_pe_doc_id` | `doc_id` | per-document trace lookup |
| `ix_pe_query_id` | `query_id` | per-query trace lookup |
| `ix_pe_status_created` | `status, created_at DESC` | error dashboard queries |
| `ix_pe_collection_created` | `collection_id, created_at DESC` | per-collection filtering |

---

## Event Catalogue

Every `emit_event()` call in the codebase, with the exact field values emitted.

### Ingestion Path

#### `doc_lifecycle` — `worker.py`

| stage | status | fields set |
|---|---|---|
| `started` | `success` | `doc_id`, `collection_id`, `filename`, `collection_name` (in metadata) |
| `completed` | `success` | `doc_id`, `collection_id`, `duration_ms`, `filename` (in metadata) |
| `failed` | `error` | `doc_id`, `collection_id`, `duration_ms`, `error_type`, `error_message`, `error_traceback` |

#### `ingestion_stage` — `indexer.py`

| stage | status | metadata fields |
|---|---|---|
| `embedding` | `success` | `chunk_count`, `duration_ms` |
| `bm25_indexing` | `success` | `chunk_count` |

#### `ingestion_stage` — `ontology_agent.py`

| stage | status | metadata fields |
|---|---|---|
| `ontology` | `success` | `reused: true/false`, `domain`, `entity_type_count`, `rel_type_count` |

#### `ingestion_stage` — `graph_indexer.py`

| stage | status | metadata fields |
|---|---|---|
| `graph_indexing` | `success` | `entity_count`, `edge_count`, `duration_ms` |

#### `llm_call` — `llm_client.py` (all LLM calls in ingestion)

| stage | status | fields set |
|---|---|---|
| `ontology` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` (in metadata) |
| `graph_extraction` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` (in metadata) |

---

### Retrieval Path

#### `query_lifecycle` — `routers/retrieval.py`

| stage | status | fields set |
|---|---|---|
| `received` | `success` | `query_id`, `collection_id` |
| `completed` | `success` | `query_id`, `collection_id`, `duration_ms` |
| `failed` | `error` | `query_id`, `collection_id`, `duration_ms`, `error_type`, `error_message`, `error_traceback` |

#### `llm_call` — `llm_client.py` (all LLM calls in retrieval)

| stage | status | fields set |
|---|---|---|
| `rewrite` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` |
| `query_plan` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` |
| `answer` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` |
| `verification` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` |
| `refinement` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` |
| `citation` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` |
| `graph_entity_extraction` | `success` | `input_tokens`, `output_tokens`, `duration_ms`, `model` |

#### `store_result` — retrieval stores

| stage | file | metadata fields |
|---|---|---|
| `vector` | `vector_store.py` | `hit_count`, `was_empty`, `duration_ms` |
| `bm25` | `bm25_store.py` | `hit_count`, `was_empty`, `duration_ms` |
| `graph` | `graph_store.py` | `entity_matches`, `traversal_hits`, `was_empty`, `duration_ms` |

#### `reranker_result` — `reranker.py`

| stage | status | metadata fields |
|---|---|---|
| _(none)_ | `success` | `input_count`, `output_count`, `top_score`, `duration_ms` |

---

### System

#### `system` — `main.py`

| stage | status | when |
|---|---|---|
| `startup` | `success` | Once at server startup |

---

## Correlation IDs

Two IDs link related events together:

| ID | Set by | Flows through |
|---|---|---|
| `doc_id` | Upload router (UUID of the Document row) | worker → indexer → ontology_agent → graph_indexer → all LLM calls during ingestion |
| `query_id` | `routers/retrieval.py` at request entry (`uuid.uuid4()`) | `RetrievalState` → retrieval_agent → vector_store / bm25_store / graph_store / reranker → all LLM calls during retrieval |

To trace a full document ingestion: query `WHERE doc_id = '<uuid>'`.
To trace a full query pipeline: query `WHERE query_id = '<uuid>'`.

---

## Token Tracking

**Single capture point:** `app/services/llm_client.py`

Both `call_text()` and `call_text_async()` capture tokens from `resp.usage`:
```python
_u = resp.usage
emit_event("llm_call", stage=stage,
           input_tokens=_u.prompt_tokens if _u else None,
           output_tokens=_u.completion_tokens if _u else None,
           duration_ms=_dur, model=model)
```

This covers every LLM call system-wide — no per-agent token capture needed.

---

## Super Admin API Endpoints

All endpoints require `Authorization: Bearer <sa_token>` (super admin JWT only).
Base prefix: `/api/super_admin`

### Auth

| Method | Path | Description |
|---|---|---|
| `POST` | `/register` | Create a super admin account (one-time) |
| `POST` | `/login` | Login, returns `access_token` |

### Logging Dashboard

| Method | Path | Description |
|---|---|---|
| `GET` | `/logs/summary` | KPI overview: docs, queries, tokens, errors for 24h / 7d |
| `GET` | `/logs/ingestion` | Paginated doc lifecycle events (filter: status, collection_id, date range) |
| `GET` | `/logs/ingestion/{doc_id}/trace` | Full stage-by-stage timeline for one document |
| `GET` | `/logs/queries` | Paginated completed query events (filter: status, date range) |
| `GET` | `/logs/queries/{query_id}/trace` | Full pipeline trace for one query (every agent + store) |
| `GET` | `/logs/tokens` | Token usage grouped by `stage` / `model` / `day` |
| `GET` | `/logs/errors` | All error events across ingestion + retrieval (paginated) |
| `GET` | `/logs/errors/grouped` | Error counts grouped by `error_type` — shows which error is most frequent |
| `GET` | `/logs/store-health` | Empty-result rate + avg latency per retrieval store |

### `/logs/summary` Response Shape

```json
{
  "docs_ingested":    { "24h": 12, "7d": 84 },
  "doc_errors":       { "24h": 1 },
  "queries_handled":  { "24h": 47, "7d": 310 },
  "query_errors":     { "24h": 0 },
  "total_tokens":     { "24h": 142000, "7d": 980000 },
  "avg_ingest_ms":    4510.0,
  "avg_query_ms":     3200.5,
  "total_errors_24h": 1
}
```

### `/logs/ingestion/{doc_id}/trace` Response Shape

```json
{
  "doc_id": "2b3a39c9-...",
  "events": [
    { "event_type": "doc_lifecycle", "stage": "started",       "status": "success", "duration_ms": null,  "created_at": "..." },
    { "event_type": "ingestion_stage","stage": "embedding",    "status": "success", "duration_ms": 1240,  "metadata": { "chunk_count": 142 } },
    { "event_type": "ingestion_stage","stage": "bm25_indexing","status": "success", "duration_ms": 320,   "metadata": { "chunk_count": 142 } },
    { "event_type": "llm_call",       "stage": "ontology",     "status": "success", "duration_ms": 850,   "input_tokens": 1200, "output_tokens": 340 },
    { "event_type": "ingestion_stage","stage": "graph_indexing","status": "success","duration_ms": 2100,  "metadata": { "entity_count": 87, "edge_count": 203 } },
    { "event_type": "doc_lifecycle",  "stage": "completed",    "status": "success", "duration_ms": 4510,  "created_at": "..." }
  ]
}
```

### `/logs/queries/{query_id}/trace` Response Shape

```json
{
  "query_id": "a1b2c3d4-...",
  "events": [
    { "stage": "received",    "event_type": "query_lifecycle", "duration_ms": null },
    { "stage": "rewrite",     "event_type": "llm_call",        "duration_ms": 420,  "input_tokens": 85,    "output_tokens": 30  },
    { "stage": "query_plan",  "event_type": "llm_call",        "duration_ms": 390,  "input_tokens": 120,   "output_tokens": 45  },
    { "stage": "vector",      "event_type": "store_result",    "duration_ms": 180,  "metadata": { "hit_count": 12, "was_empty": false } },
    { "stage": "bm25",        "event_type": "store_result",    "duration_ms": 95,   "metadata": { "hit_count": 8,  "was_empty": false } },
    { "stage": "graph",       "event_type": "store_result",    "duration_ms": 340,  "metadata": { "entity_matches": 3, "traversal_hits": 7 } },
    { "stage": null,          "event_type": "reranker_result", "duration_ms": 290,  "metadata": { "input_count": 20, "output_count": 8, "top_score": 0.91 } },
    { "stage": "answer",      "event_type": "llm_call",        "duration_ms": 980,  "input_tokens": 2400,  "output_tokens": 380 },
    { "stage": "verification","event_type": "llm_call",        "duration_ms": 540,  "input_tokens": 1200,  "output_tokens": 90  },
    { "stage": "citation",    "event_type": "llm_call",        "duration_ms": 310,  "input_tokens": 900,   "output_tokens": 120 },
    { "stage": "completed",   "event_type": "query_lifecycle", "duration_ms": 3544 }
  ]
}
```

---

## Frontend Dashboard

Location: `frontend/app/src/admin/`
Route: `http://localhost:5173/admin`

### Files

| File | Page |
|---|---|
| `adminApi.js` | All API calls with `sa_token` auth |
| `AdminAuthContext.jsx` | Isolated auth — `sa_token` in localStorage (separate from `oc_token`) |
| `admin.css` | Admin layout styles using existing design tokens |
| `AdminLoginPage.jsx` | Login at `/admin` |
| `AdminShell.jsx` | Dark sidebar + nested router |
| `pages/AdminOverview.jsx` | KPI cards, avg timing, store health bars, platform totals |
| `pages/AdminOrgs.jsx` | Org table + users drawer + edit limits/consent modal |
| `pages/AdminIngestion.jsx` | Paginated doc list + click-to-trace stage timeline drawer |
| `pages/AdminQueries.jsx` | Paginated query list + full pipeline trace drawer with token counts |
| `pages/AdminTokens.jsx` | Bar charts by stage/model/day + token breakdown table |
| `pages/AdminErrors.jsx` | Grouped by error type + all-errors view with full traceback drawer |
| `pages/AdminStoreHealth.jsx` | Per-store hit rate, latency, healthy/degraded/unhealthy status |

### Sidebar Navigation

```
Platform
  ├── Overview        /admin/overview
  └── Organisations   /admin/orgs

Logs
  ├── Ingestion       /admin/ingestion
  ├── Queries         /admin/queries
  ├── Token Usage     /admin/tokens
  ├── Errors          /admin/errors
  └── Store Health    /admin/store-health
```

---

## Loguru File Logs

Configured in `app/core/logging.py`, called at server startup from `main.py`.

| Sink | Path | Level | Rotation | Retention | Format |
|---|---|---|---|---|---|
| Console (stderr) | — | INFO | — | — | colored human-readable |
| App log | `logs/app.log` | DEBUG | 50 MB | 14 days | JSON (serialized) |
| Error log | `logs/error.log` | ERROR | 50 MB | 30 days | JSON (serialized) |

Settings (configurable via `.env`):

```
LOG_LEVEL=INFO
LOG_DIR=logs
LOG_RETENTION_DAYS=14
```

---

## Super Admin Credentials

Created once via:
```bash
curl -X POST http://localhost:8000/api/super_admin/register \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "Admin@1234"}'
```

Login:
```bash
curl -X POST http://localhost:8000/api/super_admin/login \
  -H "Content-Type: application/json" \
  -d '{"username": "superadmin", "password": "Admin@1234"}'
```

The returned `access_token` must be sent as `Authorization: Bearer <token>` on all `/api/super_admin/*` endpoints.
