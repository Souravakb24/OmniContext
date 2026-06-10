# ContextFlow API — Full cURL Reference

Base URL (org-facing API): `http://127.0.0.1:8000`
Base URL (super admin API): `http://127.0.0.1:8000`

> **Design principle:** `org_id` and `user_id` are never required as inputs.
> They are always resolved from the JWT token or from a `username` in the request body.
> Super admin endpoints use a separate JWT signed with `SUPER_ADMIN_SECRET` on the same server (port 8000).

---

## Org-Facing Endpoints (port 8000)

| # | Route | Method | Auth | Role | Purpose |
|---|---|---|---|---|---|
| 1 | /api/orgs | GET | No | — | List all organisations |
| 2 | /api/org/register | POST | No | — | Register organisation |
| 3 | /api/org/user/register | POST | No | — | Register user (first = admin, rest = member) |
| 4 | /api/auth/login | POST | No | — | Login, receive JWT |
| 5 | /api/auth/logout | POST | JWT | Any | Logout |
| 6 | /api/user/me | GET | JWT | Any | Get own profile |
| 7 | /api/user/change-password | POST | JWT | Any | Change own password |
| 8 | /api/org/upload/collections | GET | JWT | Any | List collections for upload dropdown |
| 9 | /api/user/upload | POST | JWT | Any | Upload file (5/day limit) |
| 10 | /api/user/documents | GET | JWT | Any | List own documents with ingestion status |
| 11 | /api/user/document/{doc_id}/status | GET | JWT | Any | Get ingestion status for one document |
| 12 | /api/user/document/{doc_id}/summary | GET | JWT | Any | Get AI summary + domain classification |
| 13 | /api/user/document/{doc_id}/retry | POST | JWT | Any | Re-queue a FAILED document |
| 14 | /api/org/my/collections | GET | JWT | Any | View org collections |
| 15 | /api/org/collections | GET | JWT | Admin | List all collections (admin view) |
| 16 | /api/org/collection/create | POST | JWT | Admin | Create RAG collection |
| 17 | /api/org/users | GET | JWT | Admin | List all users in org |
| 18 | /api/org/stats | GET | JWT | Admin | View org usage stats |
| 19 | /api/org/user/promote | PATCH | JWT | Admin | Promote member → admin |
| 20 | /api/org/user/demote | PATCH | JWT | Admin | Demote admin → member |
| 21 | /api/org/user/activate | PATCH | JWT | Admin | Activate user |
| 22 | /api/org/user/deactivate | PATCH | JWT | Admin | Deactivate user |
| 23 | /api/v1/retrieval/query | POST | JWT | Any | SSE streaming RAG query (hybrid vector + BM25) |
| 24 | /api/v1/retrieval/conversations | POST | JWT | Any | Create a new chat session |
| 25 | /api/v1/retrieval/conversations | GET | JWT | Any | List user's past chat sessions |
| 26 | /api/v1/retrieval/conversations/{session_id}/history | GET | JWT | Any | Paginated turn history for a session |
| 27 | /api/evidence/{chunk_id} | GET | JWT | Any | Annotated page images for citation evidence |
| 28 | /api/user/document/{doc_id} | DELETE | JWT | Any | Delete single document |
| 29 | /api/user/documents | DELETE | JWT | Any | Bulk delete documents |
| 30 | /api/user/document/{doc_id}/tags | PATCH | JWT | Any | Update document tags |
| 31 | /api/org/collection/{collection_id} | DELETE | JWT | Admin | Delete collection + all its docs |
| 32 | /api/org/collection/{collection_id}/rename | PATCH | JWT | Admin | Rename collection display name |
| 33 | /api/org/collection/{collection_id}/description | PATCH | JWT | Admin | Update collection description |
| 34 | /api/v1/retrieval/conversations/{session_id} | DELETE | JWT | Any | Delete single conversation |
| 35 | /api/v1/retrieval/conversations | DELETE | JWT | Any | Delete all user's conversations |
| 36 | /api/v1/retrieval/conversations/{session_id}/rename | PATCH | JWT | Any | Rename conversation title |
| 37 | /api/org/user/{username} | DELETE | JWT | Admin | Hard delete user + all their data |

## Super Admin Endpoints (port 8000)

| # | Route | Method | Auth | Purpose |
|---|---|---|---|---|
| S1 | /api/super_admin/register | POST | No | Create super admin account (run once internally) |
| S2 | /api/super_admin/login | POST | No | Login, receive super admin JWT |
| S3 | /api/super_admin/stats | GET | SA JWT | Platform-level aggregate stats |
| S4 | /api/super_admin/orgs | GET | SA JWT | List all orgs with stats and consent status |
| S5 | /api/super_admin/org/{org_id}/users | GET | SA JWT | List all users in a specific org |
| S6 | /api/super_admin/org/{org_id}/limits | PATCH | SA JWT | Update org limits |
| S7 | /api/super_admin/org/{org_id}/consent | PATCH | SA JWT | Set data consent and training consent for org |
| S8 | /api/super_admin/logs/summary | GET | SA JWT | KPI overview: docs ingested, queries, tokens, errors (24h/7d) |
| S9 | /api/super_admin/logs/ingestion | GET | SA JWT | Paginated doc lifecycle events (filter by status, collection, date) |
| S10 | /api/super_admin/logs/ingestion/{doc_id}/trace | GET | SA JWT | Full stage-by-stage ingestion timeline for one document |
| S11 | /api/super_admin/logs/queries | GET | SA JWT | Paginated completed query events (filter by status, date) |
| S12 | /api/super_admin/logs/queries/{query_id}/trace | GET | SA JWT | Full pipeline trace for one query (every agent + store) |
| S13 | /api/super_admin/logs/tokens | GET | SA JWT | Token usage grouped by stage / model / day |
| S14 | /api/super_admin/logs/errors | GET | SA JWT | All error events across ingestion + retrieval (paginated) |
| S15 | /api/super_admin/logs/errors/grouped | GET | SA JWT | Error counts grouped by error_type |
| S16 | /api/super_admin/logs/store-health | GET | SA JWT | Hit rate + avg latency per retrieval store |

---

## Role Rules

| Rule | Behaviour |
|---|---|
| First user registered in an org | Automatically assigned `admin` |
| All subsequent users | Always assigned `member` |
| Promote / demote / activate / deactivate | Pass `username` in body — no UUIDs needed |
| Self role change | Blocked — admin cannot promote/demote/deactivate themselves |

---

## 1. List All Organisations

```bash
curl http://127.0.0.1:8000/api/orgs
```

**Response `200`:**
```json
[
  { "org_id": "uuid", "org_name": "IIT_Mandi" }
]
```

---

## 2. Register Organisation

> Limits are optional — defaults: 10 users · 5 collections · 50 docs/collection

```bash
curl -X POST http://127.0.0.1:8000/api/org/register \
  -H "Content-Type: application/json" \
  -d '{
    "org_name": "IIT_Mandi",
    "max_users": 20,
    "max_collections": 10,
    "max_docs_per_collection": 100
  }'
```

**Response `201`:**
```json
{
  "org_id": "uuid",
  "org_name": "IIT_Mandi",
  "limits": {
    "max_users": 20,
    "max_collections": 10,
    "max_docs_per_collection": 100
  }
}
```

Errors: `409` org already exists

---

## 3. Register User

> First user in the org is auto-assigned `admin`. All others are `member`.

```bash
curl -X POST http://127.0.0.1:8000/api/org/user/register \
  -H "Content-Type: application/json" \
  -d '{
    "org_name": "IIT_Mandi",
    "username": "rahul",
    "password": "pass1234"
  }'
```

**Response `201`:**
```json
{
  "user_id": "uuid",
  "username": "rahul",
  "org_id": "uuid",
  "role": "admin"
}
```

Errors: `404` org not found · `409` username taken · `429` user limit reached

---

## 4. Login

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "org_name": "IIT_Mandi",
    "username": "rahul",
    "password": "pass1234"
  }'
```

**Response `200`:**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer",
  "user_id": "uuid",
  "org_id": "uuid",
  "role": "admin"
}
```

> Save `access_token` — it is the only thing needed for all authenticated requests.

Errors: `401` wrong credentials · `403` account disabled · `404` org not found

---

## 5. Logout

```bash
curl -X POST http://127.0.0.1:8000/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{ "message": "Logged out successfully" }
```

---

## 6. Get My Profile

```bash
curl http://127.0.0.1:8000/api/user/me \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{
  "user_id": "uuid",
  "username": "rahul",
  "org_id": "uuid",
  "org_name": "IIT_Mandi",
  "role": "admin",
  "is_active": true,
  "created_at": "2024-01-15T10:00:00"
}
```

---

## 7. Change Password

```bash
curl -X POST http://127.0.0.1:8000/api/user/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "old_password": "pass1234",
    "new_password": "newpass5678"
  }'
```

**Response `200`:**
```json
{ "message": "Password changed successfully. Please log in again." }
```

> All active sessions are invalidated immediately after the password change.

Errors: `400` new password too short (min 8 chars) · `401` wrong old password

---

## 8. List Collections for Upload Dropdown

> Use this before uploading to get the valid collection names for your org.

```bash
curl http://127.0.0.1:8000/api/org/upload/collections \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
[
  { "collection_id": "uuid", "name": "research-papers" },
  { "collection_id": "uuid", "name": "lecture-notes" }
]
```

---

## 9. Upload Files to Collection

> Accepts one or multiple files in a single request.
> Limit: 200 files/user/day · accepts `collection_name` (string), not `collection_id`
> Accepted formats: PDF, DOCX, PPT, PPTX

**Single file (legacy — still supported):**
```bash
curl -X POST http://127.0.0.1:8000/api/user/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/paper.pdf" \
  -F "collection_name=research-papers" \
  -F "is_db=Vector_DB"
```

**Multiple files:**
```bash
curl -X POST http://127.0.0.1:8000/api/user/upload \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/to/paper1.pdf" \
  -F "files=@/path/to/paper2.pdf" \
  -F "files=@/path/to/paper3.pdf" \
  -F "collection_name=research-papers" \
  -F "tags=machine-learning" \
  -F "tags=nlp" \
  -F "is_db=Vector_DB"
```

> `tags` is optional and multi-value. `collection_name` must match a name from endpoint 8.
> `is_db` is optional — defaults to `Vector_DB`.
> Each file is processed independently — one failure does not block the rest.

**`is_db` values:**

| Value | Behaviour |
|---|---|
| `Vector_DB` | Store chunks in ChromaDB + PostgreSQL BM25 only (default) |
| `both_DB` | Store in ChromaDB + BM25 + Memgraph (knowledge graph) |

> The summarizer classifies domain and decides `needs_graph`. Graph extraction only runs when
> the user chose `Graph_DB` or `both_DB` **AND** the summarizer also says `needs_graph=true`.
> If the user chose `Vector_DB`, graph is never run regardless of the summarizer decision.
> `both_DB` requires Memgraph running on port 7688 (see [Memgraph](#memgraph--knowledge-graph-db) below).

**Response `200`:**
```json
{
  "uploaded": [
    {
      "doc_id": "uuid",
      "filename": "paper1.pdf",
      "status": "QUEUED",
      "created_at": "2024-01-15T10:00:00",
      "size_bytes": 204800,
      "mime_type": "application/pdf",
      "original_extension": "pdf",
      "output_dir": "/storage/.../uuid",
      "pdf_path": "/storage/.../uuid/uuid.pdf",
      "collection_id": "uuid",
      "collection_name": "research-papers",
      "tags": ["machine-learning", "nlp"],
      "user_id": "uuid",
      "uploads_used_today": 1,
      "uploads_remaining_today": 199,
      "storage_mode": "Vector_DB"
    }
  ],
  "failed": [
    {
      "filename": "paper2.pdf",
      "error": "VALIDATION_FAILED",
      "reason": "File is password-protected",
      "stage": "C6"
    }
  ],
  "uploads_used_today": 1,
  "uploads_remaining_today": 199
}
```

> Successfully queued docs are in `uploaded[]`, per-file errors are in `failed[]`.
> A partial batch (some ok, some failed) returns `200` — check `failed[]` for individual errors.

Errors: `404` collection not found · `429` daily limit already reached before any file processed · `500` storage error

---

## 10. List My Documents

> Returns all documents uploaded by the current user with their ingestion status.

```bash
curl http://127.0.0.1:8000/api/user/documents \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
[
  {
    "doc_id": "uuid",
    "filename": "paper.pdf",
    "status": "COMPLETED",
    "error_message": null,
    "retry_count": 0,
    "ingestion_start": "2024-01-15T10:01:00",
    "ingestion_end": "2024-01-15T10:03:45",
    "created_at": "2024-01-15T10:00:00",
    "mime_type": "application/pdf",
    "size_bytes": 204800,
    "collection_id": "uuid",
    "tags": ["machine-learning"],
    "original_extension": "pdf"
  }
]
```

> Possible `status` values: `QUEUED` · `CONVERTING` · `PARSING` · `CHUNKING` · `EMBEDDING` · `INDEXING` · `COMPLETED` · `FAILED`

---

## 11. Get Document Status

> Poll this endpoint to track ingestion progress for a single document.

```bash
curl http://127.0.0.1:8000/api/user/document/<doc_id>/status \
  -H "Authorization: Bearer <token>"
```

**Response `200`:** _(same structure as one item from endpoint 10)_

```json
{
  "doc_id": "uuid",
  "filename": "paper.pdf",
  "status": "INDEXING",
  "error_message": null,
  "retry_count": 0,
  "ingestion_start": "2024-01-15T10:01:00",
  "ingestion_end": null,
  "created_at": "2024-01-15T10:00:00",
  "mime_type": "application/pdf",
  "size_bytes": 204800,
  "collection_id": "uuid",
  "tags": [],
  "original_extension": "pdf"
}
```

Errors: `404` document not found or does not belong to current user

---

## 12. Get Document Summary

> Returns the AI-generated summary, domain classification, and graph decision for a completed document.
> Returns `202` if the document is still being ingested.

```bash
curl http://127.0.0.1:8000/api/user/document/<doc_id>/summary \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{
  "doc_id": "uuid",
  "file_name": "physics1.pdf",
  "summary": "This research paper investigates...",
  "assigned_domain": "physics",
  "is_new_domain": false,
  "proposed_domain": null,
  "confidence": 0.95,
  "needs_graph": true,
  "graph_reason": "The paper contains interconnected concepts suitable for graph extraction.",
  "model_used": "gpt-oss:20b"
}
```

Errors: `202` ingestion not complete · `404` document or summary not found

---

## 13. Retry / Re-queue Document

> Re-queues a document back to `QUEUED` for another ingestion attempt.
> Works from `FAILED` **or** any status left stuck mid-pipeline (e.g. `INDEXING`)
> by a crash/restart — only `COMPLETED` documents are rejected.
> Re-ingestion is idempotent (chunks are deleted + reinserted, ChromaDB upserts), so
> re-running never duplicates or leaves partial data.

```bash
curl -X POST http://127.0.0.1:8000/api/user/document/<doc_id>/retry \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{ "doc_id": "uuid", "message": "Document re-queued for ingestion." }
```

Errors: `404` document not found · `409` document is already `COMPLETED`

> **Auto-recovery:** the worker also re-queues any document stranded in a non-terminal
> status (`UPLOADED`/`CONVERTING`/`PARSING`/`CHUNKING`/`EMBEDDING`/`INDEXING`) on startup,
> so a crashed/restarted ingestion self-heals without a manual retry.

---

## 14. View My Org's Collections (All Users)

```bash
curl http://127.0.0.1:8000/api/org/my/collections \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
[
  {
    "collection_id": "uuid",
    "name": "research-papers",
    "description": "Collection for research documents",
    "doc_count": 12,
    "created_at": "2024-01-15T10:00:00"
  }
]
```

---

## 15. List All Collections — Admin View

```bash
curl http://127.0.0.1:8000/api/org/collections \
  -H "Authorization: Bearer <token>"
```

**Response `200`:** _(same structure as endpoint 14)_

---

## 16. Create Collection (Admin only)

```bash
curl -X POST http://127.0.0.1:8000/api/org/collection/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "research-papers",
    "description": "Collection for research documents"
  }'
```

**Response `201`:**
```json
{
  "collection_id": "uuid",
  "name": "research-papers",
  "org_id": "uuid",
  "doc_count": 0,
  "created_at": "2024-01-15T10:00:00",
  "description": "Collection for research documents"
}
```

Errors: `403` not admin · `409` name duplicate · `429` collection limit reached

---

## 17. List All Users (Admin only)

```bash
curl http://127.0.0.1:8000/api/org/users \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
[
  {
    "user_id": "uuid",
    "username": "rahul",
    "role": "admin",
    "is_active": true,
    "created_at": "2024-01-15T10:00:00"
  }
]
```

---

## 18. Get Org Stats (Admin only)

```bash
curl http://127.0.0.1:8000/api/org/stats \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{
  "org_id": "uuid",
  "org_name": "IIT_Mandi",
  "limits": {
    "users":       { "used": 2, "limit": 20 },
    "collections": { "used": 1, "limit": 10 }
  },
  "file_usage_today": [
    { "username": "rahul", "uploaded": 3, "remaining": 2 }
  ]
}
```

---

## 19. Promote User to Admin (Admin only)

> Pass `username` — no UUID needed. Cannot promote yourself.

```bash
curl -X PATCH http://127.0.0.1:8000/api/org/user/promote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"username": "priya"}'
```

**Response `200`:**
```json
{ "message": "User 'priya' promoted to admin successfully" }
```

Errors: `400` already admin or self · `404` user not found

---

## 20. Demote Admin to Member (Admin only)

> Demoted user's sessions are invalidated immediately.

```bash
curl -X PATCH http://127.0.0.1:8000/api/org/user/demote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"username": "priya"}'
```

**Response `200`:**
```json
{ "message": "User 'priya' demoted to member successfully" }
```

Errors: `400` already member or self · `404` user not found

---

## 21. Activate a User (Admin only)

```bash
curl -X PATCH http://127.0.0.1:8000/api/org/user/activate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"username": "priya"}'
```

**Response `200`:**
```json
{ "message": "User 'priya' activated successfully" }
```

---

## 22. Deactivate a User (Admin only)

> Deactivated user's sessions are invalidated immediately.

```bash
curl -X PATCH http://127.0.0.1:8000/api/org/user/deactivate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"username": "priya"}'
```

**Response `200`:**
```json
{ "message": "User 'priya' deactivated successfully" }
```

---

---

## Super Admin Endpoints (port 8000)

> These endpoints are registered on the same server as the org-facing API (port 8000).
> They are **never accessible** to org users — authentication requires a separate SA JWT signed with `SUPER_ADMIN_SECRET`.

### S1. Register Super Admin (run once internally)

```bash
curl -X POST http://127.0.0.1:8000/api/super_admin/register \
  -H "Content-Type: application/json" \
  -d '{"username": "platform_admin", "password": "securepass123"}'
```

**Response `201`:**
```json
{ "message": "Super admin 'platform_admin' created successfully" }
```

Errors: `409` username already taken

---

### S2. Super Admin Login

```bash
curl -X POST http://127.0.0.1:8000/api/super_admin/login \
  -H "Content-Type: application/json" \
  -d '{"username": "platform_admin", "password": "securepass123"}'
```

**Response `200`:**
```json
{ "access_token": "eyJhbGci...", "token_type": "bearer" }
```

> Save this token — use it as `Authorization: Bearer <sa_token>` for all S3–S7 endpoints.

---

### S3. Platform Stats

```bash
curl http://127.0.0.1:8000/api/super_admin/stats \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
{
  "total_orgs": 3,
  "total_users": 25,
  "active_users": 22,
  "total_collections": 10,
  "total_docs": 450,
  "orgs_with_data_consent": 2,
  "orgs_with_training_consent": 1
}
```

---

### S4. List All Orgs with Stats

```bash
curl http://127.0.0.1:8000/api/super_admin/orgs \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
[
  {
    "org_id": "uuid",
    "org_name": "IIT_Mandi",
    "data_consent": true,
    "allow_training": false,
    "consent_updated_at": "2024-03-01T10:00:00",
    "created_at": "2024-01-15T10:00:00",
    "user_count": 8,
    "collection_count": 3,
    "doc_count": 120,
    "limits": { "max_users": 20, "max_collections": 10, "max_docs_per_collection": 100 }
  }
]
```

---

### S5. List Users in Org

```bash
curl http://127.0.0.1:8000/api/super_admin/org/<org_id>/users \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:** _(same structure as admin list users)_

---

### S6. Update Org Limits

```bash
curl -X PATCH http://127.0.0.1:8000/api/super_admin/org/<org_id>/limits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <sa_token>" \
  -d '{"max_users": 50, "max_collections": 15, "max_docs_per_collection": 200}'
```

**Response `200`:**
```json
{ "org_id": "uuid", "max_users": 50, "max_collections": 15, "max_docs_per_collection": 200 }
```

---

### S7. Set Org Data Consent

> Set after the org signs a legal agreement offline.
> `data_consent`: super admin can view org data.
> `allow_training`: data can be used for model training.

```bash
curl -X PATCH http://127.0.0.1:8000/api/super_admin/org/<org_id>/consent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <sa_token>" \
  -d '{"data_consent": true, "allow_training": false}'
```

**Response `200`:**
```json
{
  "org_id": "uuid",
  "org_name": "IIT_Mandi",
  "data_consent": true,
  "allow_training": false,
  "consent_updated_at": "2024-03-01T10:00:00"
}
```

---

### S8. Logs Summary (KPI Overview)

> Returns platform-wide counts for the last 24 h and 7 days — docs ingested, queries handled, tokens consumed, errors, and average pipeline latency.

```bash
curl http://127.0.0.1:8000/api/super_admin/logs/summary \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
{
  "docs_ingested":    { "24h": 12,     "7d": 84     },
  "doc_errors":       { "24h": 1                    },
  "queries_handled":  { "24h": 47,     "7d": 310    },
  "query_errors":     { "24h": 0                    },
  "total_tokens":     { "24h": 142000, "7d": 980000 },
  "avg_ingest_ms":    4510.0,
  "avg_query_ms":     3200.5,
  "total_errors_24h": 1
}
```

---

### S9. Ingestion Events (Paginated)

> Lists `doc_lifecycle` events — one row per document ingestion attempt, most recent first.
> Optional query params: `status` (`success`/`error`), `collection_id` (UUID), `from` / `to` (ISO-8601 dates), `page`, `page_size`.

```bash
# All ingestion events — page 1
curl "http://127.0.0.1:8000/api/super_admin/logs/ingestion" \
  -H "Authorization: Bearer <sa_token>"

# Filter by status and date range
curl "http://127.0.0.1:8000/api/super_admin/logs/ingestion?status=error&from=2026-06-01&to=2026-06-08&page=1&page_size=20" \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
{
  "total": 84,
  "page":  1,
  "page_size": 20,
  "events": [
    {
      "id":           "uuid",
      "event_type":   "doc_lifecycle",
      "stage":        "completed",
      "status":       "success",
      "doc_id":       "2b3a39c9-...",
      "collection_id":"uuid",
      "duration_ms":  4510,
      "error_type":   null,
      "error_message":null,
      "metadata":     { "filename": "paper.pdf", "collection_name": "research-papers" },
      "created_at":   "2026-06-07T14:22:01"
    }
  ]
}
```

---

### S10. Ingestion Trace — Full Stage Timeline

> Returns every telemetry event recorded for a single document, ordered chronologically.
> Use `doc_id` from S9 or from the upload response.

```bash
curl http://127.0.0.1:8000/api/super_admin/logs/ingestion/<doc_id>/trace \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
{
  "doc_id": "2b3a39c9-...",
  "events": [
    { "event_type": "doc_lifecycle",  "stage": "started",       "status": "success", "duration_ms": null, "created_at": "2026-06-07T14:20:01", "metadata": { "filename": "paper.pdf" } },
    { "event_type": "ingestion_stage","stage": "embedding",     "status": "success", "duration_ms": 1240, "metadata": { "chunk_count": 142 } },
    { "event_type": "ingestion_stage","stage": "bm25_indexing", "status": "success", "duration_ms": 320,  "metadata": { "chunk_count": 142 } },
    { "event_type": "llm_call",       "stage": "ontology",      "status": "success", "duration_ms": 850,  "input_tokens": 1200, "output_tokens": 340, "metadata": { "model": "gpt-oss:20b" } },
    { "event_type": "ingestion_stage","stage": "graph_indexing","status": "success", "duration_ms": 2100, "metadata": { "entity_count": 87, "edge_count": 203 } },
    { "event_type": "doc_lifecycle",  "stage": "completed",     "status": "success", "duration_ms": 4510, "created_at": "2026-06-07T14:22:01" }
  ]
}
```

> If the document failed, the final event will have `"stage": "failed"` with `error_type`, `error_message`, and `error_traceback` fields set.

---

### S11. Query Events (Paginated)

> Lists `query_lifecycle` events — one row per completed query, most recent first.
> Optional query params: `status`, `from`, `to`, `page`, `page_size`.

```bash
curl "http://127.0.0.1:8000/api/super_admin/logs/queries" \
  -H "Authorization: Bearer <sa_token>"

# Filter errors only
curl "http://127.0.0.1:8000/api/super_admin/logs/queries?status=error&page=1&page_size=20" \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
{
  "total": 310,
  "page":  1,
  "page_size": 20,
  "events": [
    {
      "id":           "uuid",
      "event_type":   "query_lifecycle",
      "stage":        "completed",
      "status":       "success",
      "query_id":     "a1b2c3d4-...",
      "collection_id":"uuid",
      "duration_ms":  3544,
      "error_type":   null,
      "error_message":null,
      "metadata":     null,
      "created_at":   "2026-06-07T15:10:22"
    }
  ]
}
```

---

### S12. Query Trace — Full Pipeline Trace

> Returns every telemetry event for a single query — all LLM calls, store lookups, reranker, and lifecycle markers — ordered chronologically.
> Use `query_id` from S11.

```bash
curl http://127.0.0.1:8000/api/super_admin/logs/queries/<query_id>/trace \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
{
  "query_id": "a1b2c3d4-...",
  "events": [
    { "stage": "received",    "event_type": "query_lifecycle", "duration_ms": null },
    { "stage": "rewrite",     "event_type": "llm_call",        "duration_ms": 420,  "input_tokens": 85,   "output_tokens": 30,  "metadata": { "model": "gpt-oss:20b" } },
    { "stage": "query_plan",  "event_type": "llm_call",        "duration_ms": 390,  "input_tokens": 120,  "output_tokens": 45,  "metadata": { "model": "gpt-oss:20b" } },
    { "stage": "vector",      "event_type": "store_result",    "duration_ms": 180,  "metadata": { "hit_count": 12, "was_empty": false } },
    { "stage": "bm25",        "event_type": "store_result",    "duration_ms": 95,   "metadata": { "hit_count": 8,  "was_empty": false } },
    { "stage": "graph",       "event_type": "store_result",    "duration_ms": 340,  "metadata": { "entity_matches": 3, "traversal_hits": 7, "was_empty": false } },
    { "stage": null,          "event_type": "reranker_result", "duration_ms": 290,  "metadata": { "input_count": 20, "output_count": 8, "top_score": 0.91 } },
    { "stage": "answer",      "event_type": "llm_call",        "duration_ms": 980,  "input_tokens": 2400, "output_tokens": 380, "metadata": { "model": "gpt-oss:20b" } },
    { "stage": "verification","event_type": "llm_call",        "duration_ms": 540,  "input_tokens": 1200, "output_tokens": 90,  "metadata": { "model": "gpt-oss:20b" } },
    { "stage": "citation",    "event_type": "llm_call",        "duration_ms": 310,  "input_tokens": 900,  "output_tokens": 120, "metadata": { "model": "gpt-oss:20b" } },
    { "stage": "completed",   "event_type": "query_lifecycle", "duration_ms": 3544 }
  ]
}
```

> **LLM stage labels:**
> `rewrite` → Query Rewrite · `query_plan` → Query Planner · `answer` → Answer Gen ·
> `verification` → Verifier · `refinement` → Refinement · `citation` → Citation ·
> `graph_entity_extraction` → Graph Entity Extractor · `ontology` → Ontology Agent ·
> `graph_extraction` → Graph Extraction

---

### S13. Token Usage

> Returns LLM token consumption aggregated by group.
> Query param `group_by`: `stage` (default) | `model` | `day`.

```bash
# Grouped by stage (default)
curl "http://127.0.0.1:8000/api/super_admin/logs/tokens" \
  -H "Authorization: Bearer <sa_token>"

# Grouped by model
curl "http://127.0.0.1:8000/api/super_admin/logs/tokens?group_by=model" \
  -H "Authorization: Bearer <sa_token>"

# Grouped by day
curl "http://127.0.0.1:8000/api/super_admin/logs/tokens?group_by=day" \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200` — group_by=stage:**
```json
[
  {
    "group":         "answer",
    "call_count":    310,
    "input_tokens":  744000,
    "output_tokens": 117800,
    "avg_latency_ms":940.2
  },
  {
    "group":         "rewrite",
    "call_count":    310,
    "input_tokens":  26350,
    "output_tokens": 9300,
    "avg_latency_ms":385.1
  }
]
```

**Response `200` — group_by=day:**
```json
[
  { "group": "2026-06-07", "call_count": 284, "input_tokens": 98200, "output_tokens": 31400, "avg_latency_ms": 612.0 },
  { "group": "2026-06-06", "call_count": 196, "input_tokens": 67800, "output_tokens": 21900, "avg_latency_ms": 598.5 }
]
```

---

### S14. All Errors (Paginated)

> Returns all `status=error` events across both ingestion and retrieval, most recent first.
> Optional query params: `event_type` (`doc_lifecycle`/`query_lifecycle`/`llm_call`/etc.), `from`, `to`, `page`, `page_size`.

```bash
curl "http://127.0.0.1:8000/api/super_admin/logs/errors" \
  -H "Authorization: Bearer <sa_token>"

# Filter ingestion errors only
curl "http://127.0.0.1:8000/api/super_admin/logs/errors?event_type=doc_lifecycle&page=1&page_size=20" \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
{
  "total": 7,
  "page":  1,
  "page_size": 20,
  "events": [
    {
      "id":              "uuid",
      "event_type":      "doc_lifecycle",
      "stage":           "failed",
      "doc_id":          "uuid",
      "query_id":        null,
      "error_type":      "RuntimeError",
      "error_message":   "CUDA out of memory",
      "error_traceback": "Traceback (most recent call last):\n  ...",
      "created_at":      "2026-06-07T12:05:44"
    }
  ]
}
```

---

### S15. Errors Grouped by Type

> Returns error frequency counts grouped by `error_type` — useful for identifying the most common failure modes.

```bash
curl "http://127.0.0.1:8000/api/super_admin/logs/errors/grouped" \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
[
  { "error_type": "RuntimeError",    "count": 4, "latest_at": "2026-06-07T12:05:44" },
  { "error_type": "TimeoutError",    "count": 2, "latest_at": "2026-06-06T09:18:30" },
  { "error_type": "ValidationError", "count": 1, "latest_at": "2026-06-05T17:44:11" }
]
```

---

### S16. Store Health

> Returns hit-rate and average latency per retrieval store (vector, BM25, graph).
> A call is "empty" (`was_empty=true`) when no chunks were returned.

```bash
curl "http://127.0.0.1:8000/api/super_admin/logs/store-health" \
  -H "Authorization: Bearer <sa_token>"
```

**Response `200`:**
```json
[
  {
    "store":          "vector",
    "total_calls":    310,
    "empty_calls":    12,
    "hit_rate":       0.961,
    "avg_latency_ms": 178.4
  },
  {
    "store":          "bm25",
    "total_calls":    310,
    "empty_calls":    28,
    "hit_rate":       0.910,
    "avg_latency_ms": 92.1
  },
  {
    "store":          "graph",
    "total_calls":    87,
    "empty_calls":    41,
    "hit_rate":       0.529,
    "avg_latency_ms": 335.7
  }
]
```

> **Health thresholds used by the dashboard:**
> - Hit rate ≥ 80% → healthy (green)
> - Hit rate ≥ 50% → degraded (amber)
> - Hit rate < 50%  → unhealthy (red)

---

## Consent Model

| `data_consent` | `allow_training` | Super admin can access |
|---|---|---|
| `false` | `false` | Metadata only (counts, stats) |
| `true` | `false` | Metadata + document/chat content — no training |
| `true` | `true` | Metadata + content + can use for model training |

Both flags default to `false` at org registration. Only super admin can change them.

---

## Document Ingestion Status Flow

All storage modes follow the same unified pipeline:

```
QUEUED → CONVERTING → PARSING → CHUNKING → EMBEDDING → INDEXING → COMPLETED
                                                                        ↑
                                                                     FAILED (retryable via endpoint 13)
```

**Internal stages (not exposed as status values):**
- After `CHUNKING`: summarizer runs — classifies domain and decides `needs_graph` (true/false)
- Graph runs only if user chose `Graph_DB` or `both_DB` **AND** summarizer says `needs_graph=true`
- If user chose `Vector_DB`, graph is always skipped regardless of summarizer decision
- If either active DB indexer fails, the document is marked `FAILED`

| Status | Meaning |
|---|---|
| `QUEUED` | File accepted, waiting for the worker to pick it up |
| `CONVERTING` | Non-PDF being converted to PDF via LibreOffice |
| `PARSING` | Docling OCR running on PDF pages + page WebP images saved to disk |
| `CHUNKING` | Text being split into retrieval chunks |
| `EMBEDDING` | SentenceTransformer encoding chunks |
| `INDEXING` | Upserting embeddings into ChromaDB + inserting chunk metadata into `document_chunks` (PostgreSQL BM25) + extracting entities into Memgraph if applicable (parallel) |
| `COMPLETED` | Ingestion finished — document searchable via vector + BM25 (and graph if applicable) |
| `FAILED` | Ingestion failed — check `error_message` field, retry via endpoint 13 |

---

## Local Dev Services

### tmux session `rag_pipe` — window → command map

> Attach with `tmux attach -t rag_pipe`. Each window runs one service. The **api-server must be
> restarted** after any backend code change (it has no `--reload`); restarting it also triggers the
> worker's startup self-heal that re-queues any stranded document.

| Win | Name | Command |
|---|---|---|
| 1 | (gpu monitor) | `nvitop` |
| 2 | api-server | `cd /storage/sourava/RAG_Pipeline/SD/authentication_api && CUDA_VISIBLE_DEVICES=1,2,4 uvicorn app.main:app --host 0.0.0.0 --port 8000` |
| 3 | db-tools | `/storage/sourava/RAG_Pipeline/RAG_Page/upload_api/pgweb_linux_amd64 --host localhost --user postgres_sourava --db ContextFlow --pass contextflow123` |
| 4 | npm (frontend) | `cd /storage/sourava/RAG_Pipeline/SD/frontend/app && npm run dev` |

> The `ragenv` virtualenv (`/storage/sourava/RAG_Pipeline/FInal/ragenv`) must be active for window 2
> (`source …/ragenv/bin/activate`). `CUDA_VISIBLE_DEVICES` depends on which GPUs are free — `1,2,4` is
> the current allocation. Memgraph (knowledge graph) runs as a Docker container, not a tmux window —
> see below. The ingestion worker runs as a background thread inside the api-server, not separately.

### Start the API server

```bash
cd /storage/sourava/RAG_Pipeline/SD/authentication_api
source /storage/sourava/RAG_Pipeline/FInal/ragenv/bin/activate
CUDA_VISIBLE_DEVICES=1,2,4 uvicorn app.main:app --host 0.0.0.0 --port 8000
```

> Open API docs at: **http://127.0.0.1:8000/docs**
> Apply DB migrations after a schema change: `alembic upgrade head` (latest revision: **013**).

---

### Memgraph — Knowledge Graph DB

Start (or restart) the Memgraph container:

```bash
# First run (creates container)
docker run -d \
  --name memgraph \
  --network host \
  -v mg_data:/var/lib/memgraph \
  memgraph/memgraph-mage:latest \
  --bolt-port 7688 --log-level WARNING

# Subsequent runs (container already exists)
docker start memgraph
```

> Verify it's running: `docker ps | grep memgraph`

**If using a fresh volume** (first time), create the user inside mgconsole:

```bash
docker exec -it memgraph mgconsole --port 7688
```
```sql
CREATE USER rahul1 IDENTIFIED BY 'pass1234';
GRANT ALL PRIVILEGES TO rahul1;
```

**Memgraph credentials:**

| Field | Value |
|---|---|
| Host | `localhost` |
| Bolt port | `7688` |
| Username | `rahul1` |
| Password | `pass1234` |

> These are configured in `app/config.py` as `MEMGRAPH_HOST`, `MEMGRAPH_PORT`, `MEMGRAPH_USER`, `MEMGRAPH_PASSWORD`.

---

### pgweb — Browse DB tables in browser

```bash
/storage/sourava/RAG_Pipeline/RAG_Page/upload_api/pgweb_linux_amd64 \
  --host localhost \
  --user postgres_sourava \
  --db ContextFlow \
  --pass contextflow123
```

> Open in browser: **http://127.0.0.1:8081**

Click any table in the left sidebar to view live data. Refresh after uploading a document to see the new row in `documents`.

---

### pgAdmin 4 — Full DB GUI

```bash
source /storage/sourava/RAG_Pipeline/FInal/ragenv/bin/activate && pgadmin4
```

> Open in browser: **http://127.0.0.1:5050**

Connection details for pgAdmin server registration:

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `ContextFlow` |
| Username | `postgres_sourava` |
| Password | `contextflow123` |

---

### Test credentials (local dev)

| Field | Value |
|---|---|
| `org_name` | `IIT_Mandi` |
| `username` | `rahul` |
| `password` | `pass1234` |

---

## Error Reference

| Code | Meaning |
|---|---|
| `400` | Missing or invalid input |
| `401` | Invalid / expired token or wrong credentials |
| `403` | Valid token but insufficient role or account disabled |
| `404` | Org, user, collection, or document not found |
| `409` | Duplicate org name, username, collection name, or file (SHA-256 match) |
| `413` | File too large |
| `415` | Unsupported file type / MIME type |
| `429` | User / collection / file upload / doc limit reached |
| `500` | Unexpected server error |

---

## Quick Start Flow

```bash
# 1. Register org
curl -X POST http://127.0.0.1:8000/api/org/register \
  -H "Content-Type: application/json" \
  -d '{"org_name":"IIT_Mandi","max_users":20,"max_collections":10,"max_docs_per_collection":100}'

# 2. Register first user — auto becomes admin
curl -X POST http://127.0.0.1:8000/api/org/user/register \
  -H "Content-Type: application/json" \
  -d '{"org_name":"IIT_Mandi","username":"rahul","password":"pass1234"}'

# 3. Register second user — auto becomes member
curl -X POST http://127.0.0.1:8000/api/org/user/register \
  -H "Content-Type: application/json" \
  -d '{"org_name":"IIT_Mandi","username":"priya","password":"pass1234"}'

# 4. Login → copy access_token
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"org_name":"IIT_Mandi","username":"rahul","password":"pass1234"}'

# 5. Create a collection
curl -X POST http://127.0.0.1:8000/api/org/collection/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"research-papers","description":"My first collection"}'

# 6. Get collection names for upload
curl http://127.0.0.1:8000/api/org/upload/collections \
  -H "Authorization: Bearer <token>"

# 7. Upload one or more documents (is_db defaults to Vector_DB if omitted)
curl -X POST http://127.0.0.1:8000/api/user/upload \
  -H "Authorization: Bearer <token>" \
  -F "files=@/path/to/paper1.pdf" \
  -F "files=@/path/to/paper2.pdf" \
  -F "collection_name=research-papers" \
  -F "is_db=Vector_DB"

# 8. Poll ingestion status (use doc_id from step 7 response)
curl http://127.0.0.1:8000/api/user/document/<doc_id>/status \
  -H "Authorization: Bearer <token>"

# 9. List users
curl http://127.0.0.1:8000/api/org/users \
  -H "Authorization: Bearer <token>"

# 10. Promote priya to admin
curl -X PATCH http://127.0.0.1:8000/api/org/user/promote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"username":"priya"}'

# 11. Demote priya back to member
curl -X PATCH http://127.0.0.1:8000/api/org/user/demote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"username":"priya"}'
```

---

## Retrieval Endpoints (RAG Pipeline)

> All retrieval endpoints require a valid JWT (`Authorization: Bearer <token>`).
> `session_id` is the single external identifier for a conversation — use it to resume chats and load history.

---

### 23. RAG Query (SSE Streaming)

> Start a new conversation by omitting `session_id`. Resume an existing one by passing it.
> Collection is **locked at session creation** — subsequent queries in the same session ignore the `collection_name` field.
> `is_graph: true` enables Memgraph knowledge-graph traversal in addition to vector search.
> `doc_id` (optional) **scopes retrieval to a single document** — vector + BM25 are filtered to that
> doc only. Like the collection, the doc scope is locked at session creation; later turns ignore it.
>
> **Hybrid retrieval:** each query now runs vector search (ChromaDB) and BM25 full-text search (PostgreSQL `document_chunks`) in parallel. Results are deduplicated before reranking. Chunks found by both methods are tagged `retrieval_source: "both"` and are the highest-confidence results.
>
> **Grounded refusal:** when the retrieved context doesn't contain the answer, the response is a short
> apology with **no citations, no graph, and no verification score** — the `stream_end` event carries
> `no_answer: true`, and the saved turn stores empty `citations` and a null `verification_score`.

```bash
# Turn 1 — new conversation (no session_id)
curl -X POST http://127.0.0.1:8000/api/v1/retrieval/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -N \
  -d '{
    "raw_query":       "What is the attention mechanism in Gemma 3?",
    "collection_name": "research-papers",
    "is_graph":        false
  }'
```

```bash
# Turn 2 — resume conversation (pass session_id from Turn 1 session_start event)
curl -X POST http://127.0.0.1:8000/api/v1/retrieval/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -N \
  -d '{
    "raw_query":       "How does it compare to standard multi-head attention?",
    "collection_name": "research-papers",
    "session_id":      "<session_id from Turn 1>"
  }'
```

```bash
# Single-document chat — scope retrieval to one document (pass its doc_id)
curl -X POST http://127.0.0.1:8000/api/v1/retrieval/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -N \
  -d '{
    "raw_query":       "Summarise the method section.",
    "collection_name": "research-papers",
    "doc_id":          "<doc_id to restrict answers to>",
    "is_graph":        false
  }'
```

**SSE stream events (one JSON object per `data:` line):**

| Event | When | Key fields |
|---|---|---|
| `session_start` | First — store `session_id` immediately | `session_id`, `collection` |
| `[agent] start` | Each agent begins | `agent`, `status` |
| `[agent] progress` | Mid-agent update (retrieval only) | `agent`, `status` |
| `[agent] done` | Each agent finishes | `agent` + agent-specific fields |
| `stream_end` | Pipeline complete | `session_id`, `graph_ui` (null if is_graph=false or no answer), `no_answer` (true on a grounded refusal) |
| `error` | Pipeline exception | `detail` |
| `persist_error` | DB save failed (non-fatal) | `detail` |

**Example stream:**
```
data: {"event": "session_start", "session_id": "abc-123", "collection": "research-papers"}

data: {"agent": "query_rewriter", "event": "start", "status": "Rewriting query..."}
data: {"agent": "query_rewriter", "event": "done", "rewritten_query": "What is the sliding window attention mechanism in Gemma 3?", "complexity": "simple"}

data: {"agent": "query_planner", "event": "start", "status": "Planning sub-queries..."}
data: {"agent": "query_planner", "event": "done", "planned_queries": ["What is the sliding window attention mechanism in Gemma 3?"]}

data: {"agent": "retrieval_agent", "event": "start", "status": "Retrieving relevant chunks..."}
data: {"agent": "retrieval_agent", "event": "done", "chunk_count": 3, "graph_found": false, "graph_nodes": 0, "graph_edges": 0}
// chunk_count = unique chunks after dedup across vector + BM25 results, before reranking

data: {"agent": "answer_agent", "event": "start", "status": "Generating answer..."}
data: {"agent": "answer_agent", "event": "done", "answer_length": 412}

data: {"agent": "verification_agent", "event": "start", "status": "Verifying answer quality..."}
data: {"agent": "verification_agent", "event": "done", "score": 0.92, "passed": true, "feedback": "Answer is comprehensive and accurate."}

data: {"agent": "citation_agent", "event": "start", "status": "Extracting citations..."}
data: {"agent": "citation_agent", "event": "done", "citation_count": 2}

data: {"event": "stream_end", "session_id": "abc-123", "graph_ui": null}
```

**`graph_ui` structure when `is_graph: true`:**
```json
{
  "nodes": [
    {"id": "Gemma 3",                  "type": "Model"},
    {"id": "Sliding Window Attention", "type": "Technique"}
  ],
  "edges": [
    {"source": "Gemma 3", "relation": "USES", "target": "Sliding Window Attention"}
  ]
}
```

**Multi-turn flow:**
```
Turn 1  →  session_start returns session_id  →  frontend stores it
Turn 2  →  send same session_id  →  backend loads history, resolves pronouns, locks collection
Turn N  →  same pattern
```

---

### 24. Create Conversation Session

> Optional — calling `/query` without a `session_id` creates the session automatically.
> Use this endpoint if you want a session_id before the first query (e.g. to pre-render a chat window).

```bash
curl -X POST http://127.0.0.1:8000/api/v1/retrieval/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "collection_name": "research-papers",
    "is_graph":        false
  }'
```

**Response `201`:**
```json
{
  "session_id":      "abc-123",
  "collection_name": "research-papers",
  "is_graph":        false,
  "created_at":      "2026-05-30T19:00:00"
}
```

Errors: `404` collection not found or does not belong to this org

---

### 25. List Past Conversations

> Returns all conversations for the current user, sorted by most recently active.
> Use `session_id` from each item to resume that chat or load its history.

```bash
curl http://127.0.0.1:8000/api/v1/retrieval/conversations \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
[
  {
    "session_id":      "abc-123",
    "title":           "What is the attention mechanism in Gemma 3?",
    "collection_name": "research-papers",
    "doc_id":          null,
    "doc_name":        null,
    "is_graph":        false,
    "turn_count":      7,
    "last_active":     "2026-05-30T19:27:00",
    "created_at":      "2026-05-30T18:00:00"
  }
]
```

> `title` is derived from the first query in the conversation (truncated to 60 chars).
> `doc_id`/`doc_name` are non-null only for **single-document chats** — use them to restore the
> document scope when resuming the conversation.
> `last_active` updates every time a new turn is saved — use it to sort the chat list.

---

### 26. Get Conversation History (Paginated)

> Page 1 = most recent `page_size` turns. Increment page to go further back.
> Each page is returned **oldest → newest** within the batch so the frontend can prepend it directly above the current view when the user scrolls up.

```bash
# Page 1 — most recent 10 turns (default)
curl "http://127.0.0.1:8000/api/v1/retrieval/conversations/abc-123/history" \
  -H "Authorization: Bearer <token>"

# Page 2 — next older 10 turns
curl "http://127.0.0.1:8000/api/v1/retrieval/conversations/abc-123/history?page=2&page_size=10" \
  -H "Authorization: Bearer <token>"
```

**Query params:**

| Param | Default | Max | Description |
|---|---|---|---|
| `page` | 1 | — | 1 = most recent page |
| `page_size` | 10 | 50 | turns per page |

**Response `200`:**
```json
{
  "session_id": "abc-123",
  "total":      23,
  "page":       1,
  "page_size":  10,
  "has_more":   true,
  "turns": [
    {
      "turn_index":          13,
      "raw_query":           "What is the attention mechanism?",
      "rewritten_query":     null,
      "final_answer":        "The sliding window attention in Gemma 3...",
      "citations":           null,
      "verification_score":  null,
      "iterations_used":     null,
      "created_at":          "2026-05-30T18:05:00"
    },
    {
      "turn_index":          22,
      "raw_query":           "How does it compare to standard MHA?",
      "rewritten_query":     "How does Gemma 3 sliding window attention compare to standard multi-head attention?",
      "final_answer":        "Compared to standard MHA...",
      "citations":           [{"document_name": "gemma3.pdf", "page_numbers": "4,5", ...}],
      "verification_score":  0.92,
      "iterations_used":     1,
      "created_at":          "2026-05-30T19:27:00"
    }
  ]
}
```

> **Data retention policy:** only the most recent turn retains full details (`rewritten_query`, `citations`, `verification_score`, `iterations_used`). All previous turns are pruned to `raw_query` + `final_answer` only to save DB storage. This happens automatically when each new turn is saved.

> **Figure citations:** each citation includes `chunk_type` (`"text"` / `"figure"`). For `figure`
> chunks the citation also carries `figure_path` (relative path of the per-turn copied image, also
> stored in the turn's `figure_paths`) and `figure_b64` (the image inlined as a data URI) so the
> frontend can render the figure inline under the answer without a separate request.
> A **grounded-refusal** turn (no answer in context) stores `citations: []` and `verification_score: null`.

**Infinite scroll pattern:**
```
On chat open  →  GET history?page=1        →  render turns 14–23 (most recent)
After 1s      →  GET history?page=2        →  prepend turns 4–13 above
has_more=true →  GET history?page=3        →  prepend turns 0–3 above
has_more=false →  stop loading
```

Errors: `400` invalid page or page_size · `404` session not found or does not belong to current user

---

### 27. Get Citation Evidence (PDF Page with Highlighted Bbox)

> Returns annotated page images for a cited chunk — the page WebP with the chunk's bounding box in image-pixel coordinates (y=0 top-left, already y-flipped from PDF space).
> Use `chunk_id` from the `citations` array in the conversation history response.

```bash
curl http://127.0.0.1:8000/api/evidence/<chunk_id> \
  -H "Authorization: Bearer <token>"
```

**Response `200` — text chunk (spans 2 pages):**
```json
{
  "chunk_id":         "9d891629-..._chunk_4",
  "chunk_type":       "text",
  "headings":         "III. System Design > A. Architecture",
  "doc_name":         "test_pdf.pdf",
  "display_mode":     "page",
  "figure_image_b64": null,
  "caption":          null,
  "pages": [
    {
      "page_no":   2,
      "image_b64": "<base64 WebP — page image>",
      "width_px":  1240,
      "height_px": 1754,
      "bboxes": [
        { "x0": 72.0, "y0": 210.5, "x1": 540.0, "y1": 390.0 }
      ]
    },
    {
      "page_no":   3,
      "image_b64": "<base64 WebP>",
      "width_px":  1240,
      "height_px": 1754,
      "bboxes": [
        { "x0": 72.0, "y0": 80.0, "x1": 540.0, "y1": 190.0 }
      ]
    }
  ]
}
```

**Response `200` — figure chunk:**
```json
{
  "chunk_id":         "9d891629-..._chunk_7",
  "chunk_type":       "figure",
  "headings":         "III. System Design",
  "doc_name":         "test_pdf.pdf",
  "display_mode":     "figure",
  "figure_image_b64": "<base64 PNG of extracted figure>",
  "caption":          "Fig. 2: System architecture of Nemobot.",
  "pages": [
    {
      "page_no":   5,
      "image_b64": "<base64 WebP — page image (secondary, shown on user click)>",
      "width_px":  1240,
      "height_px": 1754,
      "bboxes": [
        { "x0": 100.0, "y0": 300.0, "x1": 500.0, "y1": 650.0 }
      ]
    }
  ]
}
```

> **Frontend display rules:**
> - Check `display_mode` first.
> - `"page"` → render `pages[].image_b64` with bbox highlights. Use `bboxes[]` to draw highlight rectangles directly (pixel coords, no math needed). Multi-page chunks: show `← prev / next →` navigator.
> - `"figure"` → show `figure_image_b64` as primary image immediately. `pages[]` is still populated — show it as a secondary "View in context" toggle (user clicks to see the source page).
> - `caption` is non-null for figure chunks — display it below the figure.

Errors: `404` chunk not found or does not belong to current user's org

---

## Management Endpoints

---

### 28. Delete Document

> User can delete their own documents. Admin can delete any document in the org.
> Removes from PostgreSQL, ChromaDB, and disk (output directory).

```bash
curl -X DELETE http://127.0.0.1:8000/api/user/document/<doc_id> \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{ "doc_id": "uuid", "message": "Document deleted" }
```

Errors: `404` document not found or not yours

---

### 29. Bulk Delete Documents

```bash
curl -X DELETE http://127.0.0.1:8000/api/user/documents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "doc_ids": ["uuid1", "uuid2", "uuid3"] }'
```

**Response `200`:**
```json
{
  "deleted": ["uuid1", "uuid3"],
  "skipped": ["uuid2"]
}
```

> `skipped` contains IDs not found or not belonging to the current user — not an error.

---

### 30. Update Document Tags

```bash
curl -X PATCH http://127.0.0.1:8000/api/user/document/<doc_id>/tags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "tags": ["nlp", "transformers"] }'
```

**Response `200`:**
```json
{ "doc_id": "uuid", "tags": ["nlp", "transformers"] }
```

Errors: `404` document not found or not yours

---

### 31. Delete Collection (Admin only)

> Deletes the collection and **all documents inside it** — PostgreSQL rows, ChromaDB vectors, and disk files.
> This is irreversible.

```bash
curl -X DELETE http://127.0.0.1:8000/api/org/collection/<collection_id> \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{
  "collection_id": "uuid",
  "docs_deleted":  12,
  "message":       "Collection deleted"
}
```

Errors: `403` not admin · `404` collection not found

---

### 32. Rename Collection (Admin only)

> Renames the display name only. The internal ChromaDB collection name never changes.

```bash
curl -X PATCH http://127.0.0.1:8000/api/org/collection/<collection_id>/rename \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "name": "new-collection-name" }'
```

**Response `200`:**
```json
{ "collection_id": "uuid", "name": "new-collection-name" }
```

Errors: `403` not admin · `404` collection not found · `409` name already exists in org

---

### 33. Update Collection Description (Admin only)

```bash
curl -X PATCH http://127.0.0.1:8000/api/org/collection/<collection_id>/description \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "description": "Updated description for this collection." }'
```

**Response `200`:**
```json
{ "collection_id": "uuid", "description": "Updated description for this collection." }
```

Errors: `403` not admin · `404` collection not found

---

### 34. Delete Conversation

```bash
curl -X DELETE http://127.0.0.1:8000/api/v1/retrieval/conversations/<session_id> \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{ "session_id": "abc-123", "message": "Conversation deleted" }
```

Errors: `404` conversation not found or not yours

---

### 35. Delete All Conversations

> Deletes every conversation belonging to the current user.

```bash
curl -X DELETE http://127.0.0.1:8000/api/v1/retrieval/conversations \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{ "deleted_count": 7, "message": "All conversations deleted" }
```

---

### 36. Rename Conversation

> Sets a persistent title on the conversation. Overrides the auto-generated title from the first query.

```bash
curl -X PATCH http://127.0.0.1:8000/api/v1/retrieval/conversations/<session_id>/rename \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{ "title": "My renamed chat" }'
```

**Response `200`:**
```json
{ "session_id": "abc-123", "title": "My renamed chat" }
```

Errors: `404` conversation not found or not yours

---

### 37. Hard Delete User (Admin only)

> Deletes the user account and all their documents (PostgreSQL rows, ChromaDB vectors, disk files).
> Admin cannot delete themselves.

```bash
curl -X DELETE http://127.0.0.1:8000/api/org/user/<username> \
  -H "Authorization: Bearer <token>"
```

**Response `200`:**
```json
{
  "username":     "priya",
  "docs_deleted": 5,
  "message":      "User and all their data deleted"
}
```

Errors: `400` cannot delete yourself · `403` not admin · `404` user not found in your org
