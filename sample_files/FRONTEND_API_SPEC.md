# ContextFlow — Frontend API Specification

**Base URL:** `http://<server>:8000`  
**Auth:** All protected endpoints require `Authorization: Bearer <access_token>` header.  
**Content-Type:** `application/json` for all JSON requests; `multipart/form-data` for file uploads.

---

## Table of Contents

1. [TypeScript Interfaces](#typescript-interfaces)
2. [Auth Flow](#auth-flow)
3. [Collections](#collections)
4. [Document Upload & Ingestion](#document-upload--ingestion)
5. [RAG Chat (SSE Streaming)](#rag-chat-sse-streaming)
6. [Conversation History](#conversation-history)
7. [Dashboard](#dashboard)
8. [User & Org Management](#user--org-management)
9. [Error Reference](#error-reference)
10. [Key Behaviors](#key-behaviors)

---

## TypeScript Interfaces

```typescript
// ── Auth ──────────────────────────────────────────────────────────────────────

interface LoginRequest {
  org_name: string;
  username: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  token_type:   "bearer";
  role:         "admin" | "member";
  user_id:      string;
  org_id:       string;
}

interface UserProfile {
  user_id:  string;
  username: string;
  role:     "admin" | "member";
  org_id:   string;
  org_name: string;
}

// ── Collections ───────────────────────────────────────────────────────────────

interface Collection {
  id:          string;
  name:        string;
  description: string | null;
  doc_count:   number;
  is_active:   boolean;
  created_at:  string;
}

// ── Documents ─────────────────────────────────────────────────────────────────

type IngestionStatus =
  | "UPLOADED"
  | "CONVERTING"
  | "PARSING"
  | "CHUNKING"
  | "EMBEDDING"
  | "INDEXING"
  | "COMPLETED"
  | "FAILED";

interface DocumentStatus {
  doc_id:             string;
  filename:           string;
  status:             IngestionStatus;
  error_message:      string | null;
  retry_count:        number;
  ingestion_start:    string | null;
  ingestion_end:      string | null;
  created_at:         string;
  mime_type:          string | null;
  size_bytes:         number | null;
  collection_id:      string | null;
  tags:               string[];
  original_extension: string | null;
  // populated once status = COMPLETED
  chunk_count:        number | null;
  total_pages:        number | null;
  tables:             number | null;  // count of table elements
  figures:            number | null;  // count of picture/figure elements
}

interface UploadResponse {
  doc_id:                  string;
  filename:                string;
  status:                  "UPLOADED";
  created_at:              string;
  size_bytes:              number;
  mime_type:               string;
  original_extension:      string;
  collection_id:           string;
  collection_name:         string;
  tags:                    string[];
  user_id:                 string;
  uploads_used_today:      number;
  uploads_remaining_today: number;
  storage_mode:            "Vector_DB" | "Graph_DB" | "both_DB" | "no_DB";
}

interface DocSummary {
  doc_id:          string;
  file_name:       string;
  summary:         string | null;
  assigned_domain: string | null;
  is_new_domain:   boolean | null;
  proposed_domain: string | null;
  confidence:      number | null;
  needs_graph:     boolean | null;
  graph_reason:    string | null;
  model_used:      string | null;
}

// ── Chat / Retrieval ──────────────────────────────────────────────────────────

interface QueryRequest {
  raw_query:       string;
  collection_name: string;           // ignored after turn 1 (collection is locked)
  session_id?:     string;           // omit for new chat, include to continue
  is_graph?:       boolean;          // default false
}

// SSE events — one JSON object per "data:" line
type SSEEvent =
  | SessionStartEvent
  | AgentStartEvent
  | AgentProgressEvent
  | AgentDoneEvent
  | StreamEndEvent
  | ErrorEvent
  | PersistErrorEvent;

interface SessionStartEvent {
  event:      "session_start";
  session_id: string;
  collection: string;
}

interface AgentStartEvent {
  agent:  AgentName;
  event:  "start";
  status: string;
}

interface AgentProgressEvent {
  agent:  AgentName;
  event:  "progress";
  status: string;
}

// Each agent emits specific fields on "done":
interface QueryRewriterDoneEvent {
  agent:            "query_rewriter";
  event:            "done";
  rewritten_query:  string;
  complexity:       "simple" | "complex";
}

interface QueryPlannerDoneEvent {
  agent:           "query_planner";
  event:           "done";
  planned_queries: string[];
}

interface RetrievalDoneEvent {
  agent:       "retrieval_agent";
  event:       "done";
  chunk_count: number;
  graph_found: boolean;
  graph_nodes: number;
  graph_edges: number;
}

interface AnswerDoneEvent {
  agent:         "answer_agent";
  event:         "done";
  answer_length: number;
}

interface VerificationDoneEvent {
  agent:    "verification_agent";
  event:    "done";
  score:    number;
  passed:   boolean;
  feedback: string;
}

interface RefinementDoneEvent {
  agent:     "refinement_agent";
  event:     "done";
  iteration: number;
}

interface CitationDoneEvent {
  agent:          "citation_agent";
  event:          "done";
  citation_count: number;
}

type AgentDoneEvent =
  | QueryRewriterDoneEvent
  | QueryPlannerDoneEvent
  | RetrievalDoneEvent
  | AnswerDoneEvent
  | VerificationDoneEvent
  | RefinementDoneEvent
  | CitationDoneEvent;

type AgentName =
  | "query_rewriter"
  | "query_planner"
  | "retrieval_agent"
  | "answer_agent"
  | "verification_agent"
  | "refinement_agent"
  | "citation_agent";

interface GraphNode {
  id:   string;
  type: string;
}

interface GraphEdge {
  source:   string;
  relation: string;
  target:   string;
}

interface GraphUI {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface StreamEndEvent {
  event:      "stream_end";
  session_id: string;
  graph_ui:   GraphUI | null;   // null when is_graph = false
}

interface ErrorEvent {
  event:  "error";
  detail: string;
}

interface PersistErrorEvent {
  event:  "persist_error";  // non-fatal — answer was delivered, DB save failed
  detail: string;
}

// ── Conversations ─────────────────────────────────────────────────────────────

interface ConversationListItem {
  session_id:      string;
  title:           string;           // first turn's raw_query, truncated to 60 chars
  collection_name: string;
  is_graph:        boolean;
  turn_count:      number;
  last_active:     string;
  created_at:      string;
}

interface ConversationTurn {
  turn_index:         number;
  raw_query:          string;
  rewritten_query:    string | null;   // null on pruned turns (all except most recent)
  final_answer:       string | null;
  citations:          Citation[] | null; // null on pruned turns
  verification_score: number | null;    // null on pruned turns
  iterations_used:    number | null;    // null on pruned turns
  created_at:         string;
}

interface Citation {
  document_name: string;
  page_numbers:  string;
  chunk_index:   number;
  text_snippet:  string;
}

interface ConversationHistory {
  session_id: string;
  total:      number;
  page:       number;
  page_size:  number;
  has_more:   boolean;
  turns:      ConversationTurn[];  // ordered oldest → newest within this page
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

interface CollectionStat {
  collection_id:    string;
  name:             string;
  doc_count:        number;
  ready_count:      number;      // status = COMPLETED
  processing_count: number;      // currently being ingested
  failed_count:     number;
  chunk_count:      number;      // total text chunks indexed
  total_pages:      number;
  tables:           number;      // table elements found across all docs
  figures:          number;      // figure/picture elements found
  size_bytes:       number;
}

interface DomainStat {
  domain: string;
  count:  number;
}

interface KGCoverage {
  needs_graph:   number;   // docs classified as needing knowledge graph
  total_indexed: number;   // total docs with AI summary
}

interface ChatStats {
  total_conversations: number;
  total_turns:         number;
  avg_score:           number | null;
  pass_rate:           number | null;  // fraction with score >= 0.7
  graph_sessions:      number;
  avg_iterations:      number | null;
  simple_queries:      number;
  complex_queries:     number;
}

interface DashboardResponse {
  collections:          CollectionStat[];
  domains:              DomainStat[];    // sorted by count DESC
  kg_coverage:          KGCoverage;
  chat_stats:           ChatStats;
  total_storage_bytes:  number;
}
```

---

## Auth Flow

### Register Organisation
```
POST /api/org/register
Body: { org_name, max_users?, max_collections?, max_docs_per_collection? }
Response 201: { org_id, org_name, max_users, max_collections, max_docs_per_collection }
```

### Register User
```
POST /api/org/user/register
Body: { org_name, username, password }
Response 201: { user_id, username, role, org_id }
Note: First user in org → admin. All subsequent → member.
```

### Login
```
POST /api/auth/login
Body: { org_name, username, password }
Response 200: { access_token, token_type, role, user_id, org_id }
```
> Store `access_token` in memory (or httpOnly cookie). Attach as `Authorization: Bearer <token>` on every protected request.

### Logout
```
POST /api/auth/logout
Auth: Bearer
Response 200: { message: "Logged out successfully" }
```
> Also clear the token from your local state.

### Get Own Profile
```
GET /api/user/me
Auth: Bearer
Response 200: { user_id, username, role, org_id, org_name }
```

### Change Password
```
POST /api/user/change-password
Auth: Bearer
Body: { old_password, new_password }
Response 200: { message }
```
> All active sessions are invalidated immediately — re-login required.

---

## Collections

### List Collections (for chat / upload dropdown)
```
GET /api/org/my/collections
Auth: Bearer
Response 200: Collection[]
```

### List Collections (admin detail view)
```
GET /api/org/collections
Auth: Bearer (admin only)
Response 200: Collection[]
```

### Create Collection
```
POST /api/org/collection/create
Auth: Bearer (admin only)
Body: { name, description? }
Response 201: Collection
Errors: 409 name already taken | 429 collection limit reached
```

---

## Document Upload & Ingestion

### Get Collections for Upload Dropdown
```
GET /api/org/upload/collections
Auth: Bearer
Response 200: [{ name: string, collection_id: string }]
```
> Use this — not `/api/org/my/collections` — to populate the upload collection picker. Returns only collections the user can upload to.

### Upload Document
```
POST /api/user/upload
Auth: Bearer
Content-Type: multipart/form-data

Fields:
  file            File        PDF, DOCX, PPT, PPTX
  collection_name string      Must match a collection name from the dropdown
  is_db           string      "Vector_DB" | "Graph_DB" | "both_DB" | "no_DB"  (default: Vector_DB)
  tags            string[]    optional labels

Response 201: UploadResponse
Errors: 400 corrupt/password-protected | 409 duplicate (same SHA-256) | 413 too large |
        415 unsupported type | 429 upload limit (5/day) or collection doc limit
```

> Use `is_db: "both_DB"` for documents where you want knowledge-graph retrieval.  
> The ingestion worker decides independently whether graph extraction is needed based on AI classification — even `Vector_DB` may get graph extraction if the document is classified as needing it.

### Poll Ingestion Status
```
GET /api/user/document/{doc_id}/status
Auth: Bearer
Response 200: DocumentStatus
```

**Status progression:**
```
UPLOADED → CONVERTING → PARSING → CHUNKING → EMBEDDING → INDEXING → COMPLETED
                                                                    ↘ FAILED
```

**Polling recommendation:** poll every 5–10s while status is not `COMPLETED` or `FAILED`. Stop polling on terminal states.

| Status | What's happening |
|---|---|
| `UPLOADED` | In queue, waiting for worker |
| `CONVERTING` | File format conversion |
| `PARSING` | Docling OCR + layout parsing |
| `CHUNKING` | Splitting into chunks |
| `EMBEDDING` | GPU encoding all chunks |
| `INDEXING` | Writing to vector DB + graph extraction (longest stage) |
| `COMPLETED` | Fully indexed, ready to query |
| `FAILED` | Check `error_message` |

> `INDEXING` is the longest stage — for a research paper with graph enabled, expect 5–20 minutes while the LLM extracts entities from each chunk.

### List My Documents
```
GET /api/user/documents
Auth: Bearer
Response 200: DocumentStatus[]
```

### Get AI Summary (available after COMPLETED)
```
GET /api/user/document/{doc_id}/summary
Auth: Bearer
Response 200: DocSummary
Response 202: { error: "NOT_READY" }   — ingestion not complete yet
Response 404: document not found or no summary
```

### Retry Failed Document
```
POST /api/user/document/{doc_id}/retry
Auth: Bearer
Response 200: { doc_id, message }
Errors: 404 not found | 409 not in FAILED state
```

---

## RAG Chat (SSE Streaming)

### Send a Query
```
POST /api/v1/retrieval/query
Auth: Bearer
Body: QueryRequest
Response: text/event-stream
```

**New conversation:** omit `session_id` — backend creates one and returns it in `session_start`.  
**Continue conversation:** pass `session_id` from a previous `session_start` or from the conversation list.

#### JavaScript / TypeScript implementation

```typescript
async function sendQuery(
  token: string,
  query: string,
  collectionName: string,
  sessionId: string | null,
  isGraph: boolean,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  const body: QueryRequest = {
    raw_query:       query,
    collection_name: collectionName,
    is_graph:        isGraph,
  };
  if (sessionId) body.session_id = sessionId;

  const res = await fetch("/api/v1/retrieval/query", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Query failed: ${res.status}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE lines: "data: {...}\n\n"
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const json = line.slice("data:".length).trim();
      if (!json) continue;
      try {
        const event = JSON.parse(json) as SSEEvent;
        onEvent(event);
      } catch {
        // malformed chunk — skip
      }
    }
  }
}
```

#### Recommended state machine

```typescript
type ChatState = "idle" | "streaming" | "done" | "error";

// In your component / store:
let sessionId:   string | null = null;
let chatState:   ChatState     = "idle";
let agentStatus: string        = "";
let finalAnswer: string        = "";
let graphUI:     GraphUI | null = null;

function handleSSEEvent(event: SSEEvent) {
  switch (event.event) {
    case "session_start":
      sessionId = event.session_id;           // STORE THIS — needed for turn 2+
      break;

    case "start":
      agentStatus = `${event.agent}: ${event.status}`;
      break;

    case "done":
      if (event.agent === "answer_agent") {
        // answer streaming done — wait for citation_agent done for final
      }
      if (event.agent === "citation_agent") {
        // all done — but wait for stream_end to get the answer text
      }
      break;

    case "stream_end":
      graphUI   = event.graph_ui;
      chatState = "done";
      // fetch the saved turn from history to get final_answer + citations
      break;

    case "error":
      chatState = "error";
      console.error("Pipeline error:", event.detail);
      break;

    case "persist_error":
      // answer was delivered to user — DB save failed (non-fatal)
      // log it but don't block the UI
      console.warn("Persist error:", event.detail);
      break;
  }
}
```

> **Note:** The SSE stream does not carry the final answer text — it only signals progress. The actual `final_answer` and `citations` are saved to the DB and retrieved via the history endpoint. Fetch `GET /conversations/{session_id}/history?page=1` after `stream_end` to get the full turn data including answer and citations.

#### Agent progress bar labels

| Agent | Display label |
|---|---|
| `query_rewriter` | Rewriting query… |
| `query_planner` | Planning sub-queries… |
| `retrieval_agent` | Retrieving relevant context… |
| `answer_agent` | Generating answer… |
| `verification_agent` | Verifying answer quality… |
| `refinement_agent` | Refining (iteration N)… |
| `citation_agent` | Extracting citations… |

#### Graph UI rendering

When `is_graph: true` and the query returns graph data, `stream_end` contains:

```json
{
  "event": "stream_end",
  "session_id": "abc-123",
  "graph_ui": {
    "nodes": [
      { "id": "Machine Learning", "type": "Concept" },
      { "id": "Neural Network",   "type": "Technique" }
    ],
    "edges": [
      { "source": "Machine Learning", "relation": "USES", "target": "Neural Network" }
    ]
  }
}
```

- `graph_ui` is `null` when `is_graph: false` or no graph data was found
- Render nodes as circles labeled with `id` and colored by `type`
- Render edges as directed arrows labeled with `relation`
- Recommended library: `react-force-graph`, `vis-network`, or `d3-force`

---

## Conversation History

### List All Past Conversations
```
GET /api/v1/retrieval/conversations
Auth: Bearer
Response 200: ConversationListItem[]
```
> Sorted by `last_active` descending — most recent chat first.  
> `title` = first turn's raw_query, truncated to 60 characters.  
> `session_id` is the key — use it to resume or load history.

### Load History (Paginated — infinite scroll)
```
GET /api/v1/retrieval/conversations/{session_id}/history?page=1&page_size=10
Auth: Bearer
Response 200: ConversationHistory
```

**Infinite scroll pattern:**

```
On chat open:
  1. GET history?page=1         → render the most recent page_size turns
  2. After 1 second (silent)    → GET history?page=2  → prepend above current view
  3. On scroll-to-top           → GET history?page=3, 4… until has_more = false
```

Each page is returned **oldest → newest within the batch** so you can prepend it directly to the top of the chat without reversing.

**Data retention policy:**  
Only the most recent turn in a session retains full details (`rewritten_query`, `citations`, `verification_score`, `iterations_used`). All older turns are pruned to `raw_query` + `final_answer` only. This is automatic — handle nulls on older turns.

```typescript
// Example: render a turn
function renderTurn(turn: ConversationTurn) {
  return {
    userMessage:  turn.raw_query,
    botMessage:   turn.final_answer ?? "...",
    // these are only on the most recent turn:
    citations:    turn.citations    ?? [],
    score:        turn.verification_score,
    iterations:   turn.iterations_used,
  };
}
```

### Create Session (optional pre-creation)
```
POST /api/v1/retrieval/conversations
Auth: Bearer
Body: { collection_name: string, is_graph?: boolean }
Response 201: { session_id, collection_name, is_graph, created_at }
Errors: 404 collection not found
```
> Optional — you don't need to call this. Sending a query without `session_id` auto-creates the session. Only use this if you need a `session_id` before the first query (e.g. to pre-render the chat input).

---

## Dashboard

### Get Dashboard Stats
```
GET /api/user/dashboard
Auth: Bearer (any role)
Response 200: DashboardResponse
```

Always returns 200, never 404. All counts default to 0 if no data exists.

**Sample response:**
```json
{
  "collections": [
    {
      "collection_id":    "6b99b059-...",
      "name":             "Manas_Lab",
      "doc_count":        2,
      "ready_count":      2,
      "processing_count": 0,
      "failed_count":     0,
      "chunk_count":      85,
      "total_pages":      15,
      "tables":           1,
      "figures":          8,
      "size_bytes":       1242273
    }
  ],
  "domains": [
    { "domain": "computer_science", "count": 2 }
  ],
  "kg_coverage": {
    "needs_graph":   2,
    "total_indexed": 2
  },
  "chat_stats": {
    "total_conversations": 3,
    "total_turns":         6,
    "avg_score":           0.883,
    "pass_rate":           1.0,
    "graph_sessions":      2,
    "avg_iterations":      1.0,
    "simple_queries":      6,
    "complex_queries":     0
  },
  "total_storage_bytes": 1242273
}
```

**Dashboard widget suggestions:**

| Widget | Fields |
|---|---|
| Storage used | `total_storage_bytes` → format as MB/GB |
| Collection cards | `collections[]` — doc_count, ready/processing/failed bar, chunk_count |
| Domain pie chart | `domains[]` — domain + count |
| KG coverage ring | `kg_coverage.needs_graph / total_indexed` |
| Chat score gauge | `chat_stats.avg_score` (0–1), `pass_rate` |
| Query complexity split | `simple_queries` vs `complex_queries` bar |
| Session type split | `graph_sessions` vs `total_conversations - graph_sessions` |

---

## User & Org Management

### List Users (admin only)
```
GET /api/org/users
Auth: Bearer (admin)
Response 200: [{ user_id, username, role, is_active, created_at }]
```

### View Org Stats (admin only)
```
GET /api/org/stats
Auth: Bearer (admin)
Response 200: { org_name, total_users, active_users, total_collections, ... }
```

### Promote Member → Admin
```
PATCH /api/org/user/promote
Auth: Bearer (admin)
Body: { username: string }
Response 200: { message }
Errors: 404 user not found | 403 cannot promote yourself
```

### Demote Admin → Member
```
PATCH /api/org/user/demote
Auth: Bearer (admin)
Body: { username: string }
```

### Activate / Deactivate User
```
PATCH /api/org/user/activate    — Body: { username }
PATCH /api/org/user/deactivate  — Body: { username }
Auth: Bearer (admin)
```

---

## Error Reference

All error responses follow: `{ "detail": string | object }`

| HTTP Code | Meaning |
|---|---|
| `400` | Invalid input / validation error |
| `401` | Missing, expired, or invalid token |
| `403` | Valid token but wrong role or account disabled |
| `404` | Resource not found |
| `409` | Conflict — duplicate name, duplicate file (same SHA-256), wrong state |
| `413` | File too large |
| `415` | Unsupported file type |
| `429` | Rate limit — upload limit (5/day), collection doc limit, or user limit reached |
| `500` | Server error |

**Structured error bodies (ingestion):**
```json
{ "detail": { "error": "VALIDATION_FAILED", "reason": "File is password-protected", "stage": "C6" } }
{ "detail": { "error": "DUPLICATE_FILE",    "reason": "A file with this content already exists" } }
{ "detail": { "error": "NOT_FOUND",         "reason": "Document not found" } }
```

---

## Key Behaviors

### Session & Collection Lock
- First query creates the session and **locks the collection** for the lifetime of that session.
- Subsequent queries in the same session **ignore `collection_name`** — the backend uses the locked collection.
- Show the collection name in the chat header (from `session_start.collection`) but make it read-only after the first query.

### session_id is the only identifier
- Never store any internal UUIDs — `session_id` is the only ID the frontend needs.
- It appears in every `session_start` event and in the conversation list.
- Pass it back in `QueryRequest.session_id` to continue a conversation.

### Getting the final answer after stream_end
The SSE stream signals progress but does **not** send the final answer text inline. After `stream_end`:
```typescript
// Fetch the saved turn to get answer + citations
const history = await fetch(
  `/api/v1/retrieval/conversations/${sessionId}/history?page=1&page_size=1`,
  { headers: { Authorization: `Bearer ${token}` } }
).then(r => r.json()) as ConversationHistory;

const latestTurn = history.turns[history.turns.length - 1];
// latestTurn.final_answer, latestTurn.citations, latestTurn.verification_score
```

### Data pruning (handle nulls on old turns)
When turn N is saved, turn N-1's supporting fields are set to `null`:
- `rewritten_query` → null
- `citations` → null
- `verification_score` → null
- `iterations_used` → null

Only `raw_query` and `final_answer` are always present on every turn. Design the chat bubble component to handle null citations gracefully.

### Ingestion — `is_db` parameter
| Value | Meaning |
|---|---|
| `Vector_DB` | Vector search only (default) |
| `both_DB` | Vector + knowledge graph extraction |
| `Graph_DB` | Graph only (no vector) |
| `no_DB` | Parse and chunk only, no indexing |

Use `both_DB` for documents you want to query with `is_graph: true`.

### query_complexity in chat turns
Each turn stores `query_complexity: "simple" | "complex"` — set automatically by the query-rewriting agent. Useful for the dashboard's query complexity split chart. Not exposed in the history API currently (only in the dashboard aggregate), but available in the DB if needed.

### File upload limits
- Max 5 uploads per user per day (`uploads_remaining_today` in upload response)
- Duplicate detection by SHA-256 — re-uploading the same file returns `409`
- Supported types: PDF, DOCX, PPT, PPTX

---

## Complete API Endpoint Summary

| # | Method | Route | Auth | Role | Purpose |
|---|---|---|---|---|---|
| 1 | GET | /api/orgs | No | — | List organisations |
| 2 | POST | /api/org/register | No | — | Register org |
| 3 | POST | /api/org/user/register | No | — | Register user |
| 4 | POST | /api/auth/login | No | — | Login → JWT |
| 5 | POST | /api/auth/logout | JWT | Any | Logout |
| 6 | GET | /api/user/me | JWT | Any | Own profile |
| 7 | POST | /api/user/change-password | JWT | Any | Change password |
| 8 | GET | /api/org/upload/collections | JWT | Any | Collections for upload dropdown |
| 9 | POST | /api/user/upload | JWT | Any | Upload document |
| 10 | GET | /api/user/documents | JWT | Any | List own documents |
| 11 | GET | /api/user/document/{doc_id}/status | JWT | Any | Document ingestion status |
| 12 | GET | /api/user/document/{doc_id}/summary | JWT | Any | AI summary + domain |
| 13 | POST | /api/user/document/{doc_id}/retry | JWT | Any | Retry failed document |
| 14 | GET | /api/org/my/collections | JWT | Any | View collections |
| 15 | GET | /api/org/collections | JWT | Admin | All collections (admin) |
| 16 | POST | /api/org/collection/create | JWT | Admin | Create collection |
| 17 | GET | /api/org/users | JWT | Admin | List org users |
| 18 | GET | /api/org/stats | JWT | Admin | Org usage stats |
| 19 | PATCH | /api/org/user/promote | JWT | Admin | Promote to admin |
| 20 | PATCH | /api/org/user/demote | JWT | Admin | Demote to member |
| 21 | PATCH | /api/org/user/activate | JWT | Admin | Activate user |
| 22 | PATCH | /api/org/user/deactivate | JWT | Admin | Deactivate user |
| 23 | POST | /api/v1/retrieval/query | JWT | Any | SSE streaming RAG query |
| 24 | POST | /api/v1/retrieval/conversations | JWT | Any | Pre-create chat session |
| 25 | GET | /api/v1/retrieval/conversations | JWT | Any | List past conversations |
| 26 | GET | /api/v1/retrieval/conversations/{session_id}/history | JWT | Any | Paginated turn history |
| 27 | GET | /api/user/dashboard | JWT | Any | Org analytics dashboard |

> Interactive docs (Swagger UI): **http://\<server\>:8000/docs**
