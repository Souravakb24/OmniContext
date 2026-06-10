# RAG Pipeline — Full High-Level Flow

---

## Blocks

| Block | Name | Role |
|---|---|---|
| **A** | Client Request | User uploads a document via HTTP |
| **B** | Upload API | Entry point — receives file, runs validation chain |
| **C** | Validation Chain | Sequential + parallel checks on the raw file |
| **D** | Format Converter | Converts DOCX / PPT → PDF via LibreOffice headless |
| **E** | File Storage | Saves the final PDF to disk / S3 |
| **F** | Document Registry | Postgres table tracking every uploaded doc + state |
| **G** | Ingestion API | Entry point — triggers chunking + embedding pipeline |
| **H** | Ingestion Router | Decides LOCAL path or CLOUD path based on request |
| **I** | Local Chunker | Runs on your server — splits PDF into chunks |
| **J** | Cloud Chunker | Uploads PDF to Anthropic Files API → sends to Claude |
| **K** | Embedder | Converts chunks → vector embeddings |
| **L** | VDB Writer | Writes embeddings + chunks into Vector DB (Qdrant/Chroma) |
| **M** | KG Writer | Extracts entities/relations → writes into Knowledge Graph (Neo4j) |
| **N** | Job Queue | Async task queue (Celery + Redis) — manages all heavy jobs |
| **O** | Status API | Returns ingestion progress for a given doc_id |
| **P** | Metadata API | Returns list of all uploaded docs with their states |
| **Q** | Storage Layer | Postgres (registry) + Redis (job state) + VDB + KG |

---

## Dependency Chain

```
A  -HTTP POST /upload->        B
B  -validate->                 C
C  -all checks pass->          D   (only if file is DOCX or PPT)
C  -already PDF->              E   (skip D)
D  -converted PDF->            E
E  -saved, returns path->      F   (write doc record: UPLOADED state)
F  -returns doc_id->           A   (Upload API response)

A  -HTTP POST /ingest->        G
G  -reads doc_id, options->    H
H  -mode=local->               I
H  -mode=cloud->               J
I  -raw chunks->               K
J  -Claude response chunks->   K
K  -embeddings->               L   (if sink=vdb or both)
K  -embeddings->               M   (if sink=kg or both)
L  -write done->               F   (update doc state: INGESTED)
M  -write done->               F   (update doc state: INGESTED)

A  -HTTP GET /status->         O
O  -reads job_id->             N   (poll Celery task state from Redis)
O  -reads doc_id->             F   (read current doc state from Postgres)
O  -returns progress->         A

A  -HTTP GET /metadata->       P
P  -queries->                  F   (all doc records)
P  -returns list->             A
```

---

## Block Details

---

### A — Client Request

The user (or calling system) makes HTTP calls to the pipeline.

---

### B — Upload API

**Endpoint:** `POST /api/v1/upload`

**Headers:**
```
Content-Type: multipart/form-data
X-API-Key: <your_pipeline_api_key>
```

**Request Body (form-data):**
```
file          : <binary>       required  — the document file
user_id       : string         required  — who is uploading
collection_id : string         optional  — logical grouping for docs
tags          : string[]       optional  — metadata labels
```

**Response (success):**
```json
{
  "doc_id"     : "doc_abc123",
  "filename"   : "report.pdf",
  "status"     : "UPLOADED",
  "created_at" : "2026-05-09T10:00:00Z",
  "size_bytes" : 204800,
  "mime_type"  : "application/pdf",
  "storage_path": "store/pdfs/doc_abc123.pdf"
}
```

**Response (validation failure):**
```json
{
  "error"  : "VALIDATION_FAILED",
  "reason" : "File is password protected",
  "stage"  : "password_check"
}
```

---

### C — Validation Chain

Runs in two phases. **Sequential first (cheap), parallel second (expensive).**

#### Phase 1 — Sequential (fail fast, no I/O)

| Step | Check | How | Reject if |
|---|---|---|---|
| C1 | Size limit | Read Content-Length header | > 500 MB |
| C2 | Extension check | Check filename suffix against allowlist | Not in [.pdf, .docx, .ppt, .pptx] |
| C3 | MIME type check | Read first 512 bytes, match magic bytes | MIME ≠ declared extension |
| C4 | Empty doc check | Check total file size | < 1 KB |

#### Phase 2 — Parallel (expensive, CPU/I/O bound, ProcessPoolExecutor)

| Step | Check | How | Reject if |
|---|---|---|---|
| C5 | Corruption check | Try parsing with PyMuPDF / python-pptx | Parse throws exception |
| C6 | Password check | Attempt open without password | Encrypted flag is set |
| C7 | Duplicate check | SHA-256 hash → lookup in Postgres | Hash already exists |
| C8 | Virus scan | Send to ClamAV daemon (clamd) | Threat detected |

All 4 run concurrently. First failure cancels the rest and returns error.

---

### D — Format Converter

Only triggered if file is DOCX or PPT/PPTX.

**Tool:** LibreOffice headless (`soffice --headless --convert-to pdf`)

**Handled by:** Single conversion worker (not a pool — LibreOffice is not safe to run in parallel)

**Input:** Original file path  
**Output:** PDF file path  
**Timeout:** 120s per file  
**On failure:** Return `CONVERSION_FAILED` error to client

---

### E — File Storage

Saves the final PDF (either uploaded directly or converted).

**Local mode:** Save to `/storage/pdfs/<doc_id>.pdf`  
**Cloud mode (optional):** Upload to S3/GCS, store URL

**Returns:** `storage_path` — absolute path or cloud URL

---

### F — Document Registry (Postgres)

Central source of truth for every document.

**Table: `documents`**

| Column | Type | Description |
|---|---|---|
| doc_id | UUID | Primary key |
| user_id | string | Owner |
| collection_id | string | Logical group |
| filename | string | Original filename |
| storage_path | string | Where the PDF is saved |
| sha256_hash | string | For dedup |
| mime_type | string | Validated MIME |
| size_bytes | int | File size |
| tags | string[] | User-provided labels |
| status | enum | UPLOADED → QUEUED → PROCESSING → INGESTED → FAILED |
| ingestion_mode | enum | local / cloud |
| ingestion_sink | enum | vdb / kg / both |
| anthropic_file_id | string | Set only if cloud mode |
| created_at | timestamp | Upload time |
| ingested_at | timestamp | Completion time |
| error_message | string | Last error if FAILED |

---

### G — Ingestion API

**Endpoint:** `POST /api/v1/ingest`

**Headers:**
```
Content-Type: application/json
X-API-Key: <your_pipeline_api_key>
```

**Request Body:**
```json
{
  "doc_id"         : "doc_abc123",
  "mode"           : "local",
  "sink"           : "vdb",
  "chunk_size"     : 512,
  "chunk_overlap"  : 64,
  "model_name"     : "sentence-transformers/all-MiniLM-L6-v2",
  "cloud_config"   : {
    "api_key"      : "sk-ant-...",
    "model"        : "claude-opus-4-6",
    "file_id"      : null
  }
}
```

**Parameters:**

| Parameter | Required | Default | Description |
|---|---|---|---|
| doc_id | yes | — | Which doc to ingest |
| mode | no | local | `local` = your server, `cloud` = Anthropic Files API |
| sink | no | vdb | `vdb` / `kg` / `both` |
| chunk_size | no | 512 | Tokens per chunk |
| chunk_overlap | no | 64 | Overlap tokens between chunks |
| model_name | no | all-MiniLM-L6-v2 | Embedding model (local mode) |
| cloud_config | no | null | Required only if mode=cloud |
| cloud_config.api_key | if cloud | — | Anthropic API key |
| cloud_config.model | if cloud | claude-opus-4-6 | Claude model to use |

**Response:**
```json
{
  "job_id"   : "job_xyz789",
  "doc_id"   : "doc_abc123",
  "status"   : "QUEUED",
  "mode"     : "local",
  "sink"     : "vdb",
  "queued_at": "2026-05-09T10:01:00Z"
}
```

Doc state in Postgres updated to `QUEUED`.

---

### H — Ingestion Router

Reads `mode` from the ingestion request.

```
mode = local  →  send job to Block I (Local Chunker)
mode = cloud  →  send job to Block J (Cloud Chunker)
```

Both paths are dispatched as Celery tasks into Block N (Job Queue).

---

### I — Local Chunker

Runs entirely on your server.

**Steps:**
1. Load PDF from `storage_path` using PyMuPDF
2. Extract raw text page by page
3. Split text into chunks using `chunk_size` + `chunk_overlap`
4. Return list of chunk objects:

```json
[
  {
    "chunk_id"   : "doc_abc123_chunk_001",
    "doc_id"     : "doc_abc123",
    "page_num"   : 1,
    "text"       : "...",
    "char_start" : 0,
    "char_end"   : 512,
    "metadata"   : {
      "filename"      : "report.pdf",
      "collection_id" : "col_001",
      "tags"          : ["finance", "q1"]
    }
  }
]
```

---

### J — Cloud Chunker (Anthropic Files API)

Used when `mode = cloud`.

**Steps:**

1. Upload PDF to Anthropic Files API:
```
POST https://api.anthropic.com/v1/files
Headers:
  x-api-key: <cloud_config.api_key>
  anthropic-version: 2023-06-01
  anthropic-beta: files-api-2025-04-14
Body (multipart):
  file: <pdf binary>
```
Returns `file_id` → saved to `documents.anthropic_file_id`

2. Send to Claude for extraction:
```
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: <cloud_config.api_key>
  anthropic-version: 2023-06-01
  anthropic-beta: files-api-2025-04-14
Body:
  model: claude-opus-4-6
  messages:
    - role: user
      content:
        - type: text
          text: "Extract and return all text chunks from this document. Return as JSON array with fields: page_num, text."
        - type: document
          source:
            type: file
            file_id: <file_id>
```

3. Parse Claude's response → same chunk format as Block I output

**Note:** Anthropic Files API rate limit = 100 req/min during beta.

---

### K — Embedder

Takes chunks from I or J → produces vector embeddings.

**Local mode:** Uses `sentence-transformers` model specified in request  
**Cloud mode:** Can use same local embedder (embeddings are always local — Claude does not return embeddings)

**Output per chunk:**
```json
{
  "chunk_id"  : "doc_abc123_chunk_001",
  "embedding" : [0.021, -0.043, ...],
  "text"      : "...",
  "metadata"  : { ... }
}
```

**Vector dimension:** Depends on model (384 for MiniLM, 1536 for OpenAI ada, etc.)

---

### L — VDB Writer

Writes embedded chunks into the Vector Database.

**Supported DBs:** Qdrant (default) / Chroma / Pinecone

**Qdrant upsert payload per chunk:**
```json
{
  "id"     : "doc_abc123_chunk_001",
  "vector" : [0.021, -0.043, ...],
  "payload": {
    "doc_id"        : "doc_abc123",
    "text"          : "...",
    "page_num"      : 1,
    "filename"      : "report.pdf",
    "collection_id" : "col_001",
    "tags"          : ["finance", "q1"],
    "char_start"    : 0,
    "char_end"      : 512
  }
}
```

**Collection name:** `<collection_id>` or `default` if none provided

---

### M — KG Writer

Extracts entities and relationships from each chunk → writes to Neo4j.

**Steps:**
1. Run NER on chunk text (spaCy or Claude in cloud mode)
2. Extract triples: `(Entity A) -[RELATION]-> (Entity B)`
3. Write to Neo4j:

```cypher
MERGE (a:Entity {name: "Entity A", doc_id: "doc_abc123"})
MERGE (b:Entity {name: "Entity B", doc_id: "doc_abc123"})
MERGE (a)-[:RELATION {chunk_id: "doc_abc123_chunk_001", page_num: 1}]->(b)
```

Only runs if `sink = kg` or `sink = both`.

---

### N — Job Queue (Celery + Redis)

All heavy work (conversion, chunking, embedding, writing) is async.

**Job states stored in Redis:**
```
PENDING → STARTED → PROGRESS(n/total) → SUCCESS / FAILURE
```

**Job payload stored per task:**
```json
{
  "job_id"     : "job_xyz789",
  "doc_id"     : "doc_abc123",
  "task_name"  : "ingest_local",
  "state"      : "PROGRESS",
  "progress"   : 42,
  "total"      : 100,
  "message"    : "Embedding chunk 42/100",
  "started_at" : "2026-05-09T10:01:05Z",
  "updated_at" : "2026-05-09T10:01:30Z"
}
```

---

### O — Status API

**Endpoint:** `GET /api/v1/status/{doc_id}`

**Optional query param:** `?job_id=job_xyz789`

**Response:**
```json
{
  "doc_id"      : "doc_abc123",
  "job_id"      : "job_xyz789",
  "doc_status"  : "PROCESSING",
  "job_state"   : "PROGRESS",
  "progress"    : 42,
  "total"       : 100,
  "message"     : "Embedding chunk 42/100",
  "mode"        : "local",
  "sink"        : "vdb",
  "started_at"  : "2026-05-09T10:01:05Z",
  "updated_at"  : "2026-05-09T10:01:30Z",
  "error"       : null
}
```

Pulls `job_state` from Redis (Celery) and `doc_status` from Postgres.

---

### P — Metadata API

**Endpoint:** `GET /api/v1/documents`

**Query Parameters:**
```
user_id       : string    filter by user
collection_id : string    filter by collection
status        : string    filter by doc status
tags          : string[]  filter by tags
page          : int       pagination (default 1)
limit         : int       results per page (default 20)
```

**Response:**
```json
{
  "total" : 3,
  "page"  : 1,
  "limit" : 20,
  "docs"  : [
    {
      "doc_id"       : "doc_abc123",
      "filename"     : "report.pdf",
      "status"       : "INGESTED",
      "mode"         : "local",
      "sink"         : "vdb",
      "size_bytes"   : 204800,
      "tags"         : ["finance"],
      "collection_id": "col_001",
      "created_at"   : "2026-05-09T10:00:00Z",
      "ingested_at"  : "2026-05-09T10:02:00Z"
    }
  ]
}
```

**Single doc endpoint:** `GET /api/v1/documents/{doc_id}`  
Returns the same shape as a single item above plus `storage_path` and `anthropic_file_id`.

---

## Full End-to-End Flow (Narrative)

```
1. Client POSTs file to /upload
2. B runs C1→C4 sequentially (size, extension, MIME, empty)
3. B fans out C5+C6+C7+C8 in parallel (corrupt, password, dedup, virus)
4. If DOCX/PPT → D converts to PDF via LibreOffice queue
5. E saves final PDF to storage
6. F creates doc record with status=UPLOADED, returns doc_id to client

7. Client POSTs to /ingest with doc_id + options
8. G validates doc_id exists and is UPLOADED
9. G enqueues Celery task, updates doc status=QUEUED, returns job_id
10. N picks up task, updates status=PROCESSING

11. H routes to I (local) or J (cloud)
    LOCAL:  I extracts text + chunks from PDF
    CLOUD:  J uploads PDF to Anthropic Files API → sends to Claude → gets chunks

12. K embeds all chunks (always local embedder)
13. L writes to VDB if sink=vdb or both
14. M writes to KG if sink=kg or both
15. F updates doc status=INGESTED, sets ingested_at

16. Client polls GET /status/{doc_id} → gets live progress from Redis
17. Client calls GET /documents to see all docs and their states
```

---

## Storage Summary

| What | Where |
|---|---|
| Raw PDFs | Local disk or S3 |
| Doc registry + states | Postgres |
| Job state + progress | Redis (Celery backend) |
| Chunk vectors + text | Qdrant / Chroma |
| Entity graph | Neo4j |
| Anthropic file_id | Postgres (documents table) |

---

## Full Database Design

---

### Postgres — Relational Store

Postgres is the **single source of truth** for everything that can be queried, filtered, or reported on. Three tables cover the full lifecycle.

---

#### Table 1: `documents`

One row per uploaded document. Created at upload, updated throughout ingestion.

```sql
CREATE TABLE documents (
    doc_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             VARCHAR(255)    NOT NULL,
    collection_id       VARCHAR(255)    DEFAULT 'default',
    filename            VARCHAR(255)    NOT NULL,
    original_extension  VARCHAR(10)     NOT NULL,          -- pdf / docx / ppt
    storage_path        TEXT            NOT NULL,          -- /storage/pdfs/doc_abc123.pdf
    sha256_hash         VARCHAR(64)     NOT NULL UNIQUE,   -- dedup key
    mime_type           VARCHAR(100)    NOT NULL,
    size_bytes          BIGINT          NOT NULL,
    tags                TEXT[]          DEFAULT '{}',
    status              VARCHAR(20)     NOT NULL DEFAULT 'UPLOADED',
                                                           -- UPLOADED | QUEUED | PROCESSING | INGESTED | FAILED
    ingestion_mode      VARCHAR(10)     DEFAULT NULL,      -- local | cloud
    ingestion_sink      VARCHAR(10)     DEFAULT NULL,      -- vdb | kg | both
    anthropic_file_id   VARCHAR(100)    DEFAULT NULL,      -- set only in cloud mode
    chunk_count         INT             DEFAULT 0,         -- filled after ingestion
    error_message       TEXT            DEFAULT NULL,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    ingested_at         TIMESTAMPTZ     DEFAULT NULL
);

-- Indexes for common query patterns
CREATE INDEX idx_documents_user_id        ON documents(user_id);
CREATE INDEX idx_documents_collection_id  ON documents(collection_id);
CREATE INDEX idx_documents_status         ON documents(status);
CREATE INDEX idx_documents_sha256         ON documents(sha256_hash);
CREATE INDEX idx_documents_tags           ON documents USING GIN(tags);
```

**When written:**
- Row created → Upload API (status = UPLOADED)
- `status` updated → Ingestion API (QUEUED → PROCESSING → INGESTED / FAILED)
- `chunk_count`, `ingested_at` filled → after Block L/M completes
- `anthropic_file_id` filled → after Block J uploads to Anthropic

---

#### Table 2: `ingestion_jobs`

One row per ingestion request. Tracks every job submitted to the queue.

```sql
CREATE TABLE ingestion_jobs (
    job_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id          UUID            NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    celery_task_id  VARCHAR(255)    DEFAULT NULL,          -- Celery's internal task UUID
    status          VARCHAR(20)     NOT NULL DEFAULT 'PENDING',
                                                           -- PENDING | QUEUED | PROCESSING | SUCCESS | FAILED
    mode            VARCHAR(10)     NOT NULL,              -- local | cloud
    sink            VARCHAR(10)     NOT NULL,              -- vdb | kg | both
    chunk_size      INT             NOT NULL DEFAULT 512,
    chunk_overlap   INT             NOT NULL DEFAULT 64,
    model_name      VARCHAR(255)    DEFAULT 'all-MiniLM-L6-v2',
    progress        INT             DEFAULT 0,             -- chunks processed so far
    total_chunks    INT             DEFAULT 0,             -- total chunks to process
    error_message   TEXT            DEFAULT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ     DEFAULT NULL,
    completed_at    TIMESTAMPTZ     DEFAULT NULL
);

CREATE INDEX idx_jobs_doc_id  ON ingestion_jobs(doc_id);
CREATE INDEX idx_jobs_status  ON ingestion_jobs(status);
```

**When written:**
- Row created → Ingestion API receives POST (status = PENDING)
- `celery_task_id` filled → after task is enqueued in Celery
- `started_at`, status = PROCESSING → when Celery worker picks up the task
- `progress`, `total_chunks` updated → during chunk embedding loop
- `completed_at`, status = SUCCESS/FAILED → after Block L/M finishes

---

#### Table 3: `chunks`

One row per chunk extracted from a document. Optional — only needed if you want SQL-level chunk search or audit. VDB already stores chunk text, but this gives you a relational backup.

```sql
CREATE TABLE chunks (
    chunk_id        VARCHAR(100)    PRIMARY KEY,           -- doc_abc123_chunk_001
    doc_id          UUID            NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    job_id          UUID            NOT NULL REFERENCES ingestion_jobs(job_id),
    page_num        INT             NOT NULL,
    chunk_index     INT             NOT NULL,              -- order within doc
    text            TEXT            NOT NULL,
    char_start      INT             NOT NULL,
    char_end        INT             NOT NULL,
    token_count     INT             DEFAULT NULL,
    vdb_indexed     BOOLEAN         DEFAULT FALSE,         -- confirmed written to VDB
    kg_indexed      BOOLEAN         DEFAULT FALSE,         -- confirmed written to KG
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chunks_doc_id   ON chunks(doc_id);
CREATE INDEX idx_chunks_job_id   ON chunks(job_id);
CREATE INDEX idx_chunks_page_num ON chunks(doc_id, page_num);
```

**When written:**
- Rows inserted → during Block I / J chunking step, before embedding
- `vdb_indexed = TRUE` → after Block L confirms upsert to Qdrant
- `kg_indexed = TRUE` → after Block M confirms write to Neo4j

---

#### Full Relationship Diagram

```
documents (doc_id PK)
    │
    ├──< ingestion_jobs (doc_id FK)
    │         │
    │         └──< chunks (job_id FK)
    │
    └──< chunks (doc_id FK)
```

---

### Redis — Job State Cache

Redis is used **only** by Celery as its result backend. You do not write to Redis directly — Celery manages it.

**Key pattern:** `celery-task-meta-<celery_task_id>`

**Value (Celery stores this automatically):**
```json
{
  "status"   : "PROGRESS",
  "result"   : {
    "progress"     : 42,
    "total"        : 100,
    "message"      : "Embedding chunk 42/100",
    "doc_id"       : "doc_abc123",
    "job_id"       : "job_xyz789"
  },
  "traceback": null,
  "children" : []
}
```

**TTL:** Set to 24 hours — after that Redis drops the key. Final state is always in Postgres.

**Status API reads both:**
- Redis → for live `progress` / `total` during active job
- Postgres `ingestion_jobs` → for completed/failed state after Redis TTL expires

---

### Qdrant — Vector Store

Not SQL, but structured. Each chunk becomes one **point** in a Qdrant collection.

**Collection name:** same as `collection_id` from the document (or `default`)

**Point structure:**
```
point_id  : chunk_id string           (e.g. "doc_abc123_chunk_001")
vector    : float[]                   (embedding, e.g. 384-dim for MiniLM)
payload   : {
    doc_id        : "doc_abc123",
    job_id        : "job_xyz789",
    text          : "raw chunk text",
    page_num      : 1,
    chunk_index   : 0,
    char_start    : 0,
    char_end      : 512,
    filename      : "report.pdf",
    collection_id : "col_001",
    tags          : ["finance", "q1"],
    ingested_at   : "2026-05-09T10:02:00Z"
}
```

**When written:** Block L, after embedding. One upsert call per chunk batch.  
**Queried by:** downstream RAG retrieval — similarity search returns `text` + `payload` for context injection.

---

### Neo4j — Knowledge Graph Store

Stores entities and relationships extracted from chunks.

**Node types:**

```
(:Document  {doc_id, filename, collection_id, ingested_at})
(:Chunk     {chunk_id, doc_id, page_num, text})
(:Entity    {name, type})              -- type = PERSON | ORG | PLACE | CONCEPT | etc.
```

**Relationship types:**

```
(:Document)-[:HAS_CHUNK]->(:Chunk)
(:Chunk)-[:MENTIONS]->(:Entity)
(:Entity)-[:RELATION {label, chunk_id, confidence}]->(:Entity)
```

**Example write for one chunk:**
```cypher
MERGE (d:Document {doc_id: "doc_abc123"})
  ON CREATE SET d.filename = "report.pdf", d.collection_id = "col_001"

MERGE (c:Chunk {chunk_id: "doc_abc123_chunk_001"})
  ON CREATE SET c.doc_id = "doc_abc123", c.page_num = 1, c.text = "..."

MERGE (d)-[:HAS_CHUNK]->(c)

MERGE (e1:Entity {name: "OpenAI",   type: "ORG"})
MERGE (e2:Entity {name: "Microsoft", type: "ORG"})
MERGE (e1)-[:PARTNERSHIP {chunk_id: "doc_abc123_chunk_001", confidence: 0.92}]->(e2)
MERGE (c)-[:MENTIONS]->(e1)
MERGE (c)-[:MENTIONS]->(e2)
```

**When written:** Block M, after NER extraction. One transaction per chunk.

---

### Write Order Per Document (Full Sequence)

```
UPLOAD FLOW:
  1. Postgres documents     → INSERT new row (status=UPLOADED)

INGEST FLOW:
  2. Postgres ingestion_jobs → INSERT new row (status=PENDING)
  3. Redis                  → Celery enqueues task, stores initial state
  4. Postgres ingestion_jobs → UPDATE celery_task_id, status=QUEUED
  5. Postgres documents     → UPDATE status=QUEUED

  [Worker picks up task]
  6. Postgres ingestion_jobs → UPDATE status=PROCESSING, started_at=NOW()
  7. Postgres documents     → UPDATE status=PROCESSING

  [Chunking done]
  8. Postgres chunks        → INSERT all chunk rows (vdb_indexed=F, kg_indexed=F)

  [Embedding + VDB write loop — per chunk]
  9. Qdrant                 → UPSERT point
  10. Postgres chunks       → UPDATE vdb_indexed=TRUE
  11. Redis                 → Celery updates progress count

  [KG write loop — per chunk, if sink=kg or both]
  12. Neo4j                 → MERGE nodes + relationships
  13. Postgres chunks       → UPDATE kg_indexed=TRUE

  [All chunks done]
  14. Postgres ingestion_jobs → UPDATE status=SUCCESS, completed_at=NOW(), total_chunks=N
  15. Postgres documents    → UPDATE status=INGESTED, ingested_at=NOW(), chunk_count=N
```
