# Authentication System — Full Reference Guide (FastAPI)

> Use this file as a coding reference with Claude. Share this at the start of any coding session.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.11+ |
| Framework | FastAPI |
| Database | PostgreSQL |
| ORM | SQLAlchemy 2.x |
| Migrations | Alembic |
| Encryption | pgcrypto (PostgreSQL extension) via SQLAlchemy `text()` |
| Password Hashing | passlib[bcrypt] |
| Token | python-jose[cryptography] (JWT) |
| Environment | python-dotenv |
| Validation | Pydantic v2 |
| Server | Uvicorn |
| DB Driver | psycopg2-binary |

---

## Project Structure

```
project/
├── alembic/
│   ├── versions/           # migration files go here
│   ├── env.py
│   └── script.py.mako
├── app/
│   ├── __init__.py
│   ├── main.py             # FastAPI app entry point, mounts all routers
│   ├── database.py         # DB engine, SessionLocal, get_db dependency
│   ├── models.py           # SQLAlchemy ORM models
│   ├── schemas.py          # Pydantic request/response schemas
│   ├── crud.py             # All DB query functions
│   ├── auth.py             # JWT create/decode + bcrypt helpers
│   ├── encryption.py       # pgcrypto encrypt/decrypt + HMAC hash helpers
│   ├── dependencies.py     # get_current_user, require_admin, require_super_admin
│   └── routers/
│       ├── __init__.py
│       ├── org.py          # org register, stats, limits
│       ├── users.py        # user register, list, activate/deactivate
│       ├── auth.py         # login, logout, change password
│       ├── upload.py       # file upload with rate limiting
│       └── collections.py  # RAG collection management
├── .env
├── alembic.ini
├── requirements.txt
└── README.md
```

---

## Environment Variables (.env)

```dotenv
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=ContextFlow
POSTGRES_USER=postgres_sourava
POSTGRES_PASSWORD=contextflow123

# Constructed from above — use this in database.py
DATABASE_URL=postgresql://postgres_sourava:contextflow123@localhost:5432/ContextFlow

# Secrets — never hardcode, always load from env
ENCRYPTION_KEY=your-super-secret-encryption-key
HASH_SECRET=separate-secret-for-hmac-hashing
JWT_SECRET=separate-secret-for-jwt-signing
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=1440
```

---

## Requirements (requirements.txt)

```txt
fastapi
uvicorn[standard]
sqlalchemy
alembic
psycopg2-binary
passlib[bcrypt]
python-jose[cryptography]
python-dotenv
pydantic[email]
pydantic-settings
python-multipart
```

Install:
```bash
pip install -r requirements.txt
```

---

## Database Setup

### Step 1 — Create the database
```bash
psql -U postgres_sourava -c "CREATE DATABASE \"ContextFlow\";"
```

### Step 2 — Enable pgcrypto inside the database
```bash
psql -U postgres_sourava -d ContextFlow -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

### Step 3 — Initialize Alembic
```bash
alembic init alembic
```

### Step 4 — Set DB URL in alembic.ini
```ini
# alembic.ini
sqlalchemy.url = postgresql://postgres_sourava:contextflow123@localhost:5432/ContextFlow
```

### Step 5 — Point Alembic to your models in alembic/env.py
```python
# alembic/env.py
from app.models import Base
target_metadata = Base.metadata
```

### Step 6 — Generate and apply first migration
```bash
alembic revision --autogenerate -m "initial tables"
alembic upgrade head
```

### Common Alembic Commands
```bash
alembic upgrade head                              # apply all pending migrations
alembic downgrade -1                              # rollback last migration
alembic current                                   # check current version
alembic history                                   # list all migrations
alembic revision --autogenerate -m "add column"  # new migration from model changes
```

---

## Database Schema

### Table 1: organisations

```sql
CREATE TABLE organisations (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name_encrypted  BYTEA NOT NULL,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

SQLAlchemy Model:
```python
class Organisation(Base):
    __tablename__ = "organisations"
    id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name_encrypted = Column(LargeBinary, nullable=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
```

---

### Table 2: org_limits

```sql
CREATE TABLE org_limits (
    id                          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id                      UUID REFERENCES organisations(id) ON DELETE CASCADE,
    max_users                   INT DEFAULT 10,
    max_collections             INT DEFAULT 5,
    max_vectors_per_collection  INT DEFAULT 10000,
    created_at                  TIMESTAMP DEFAULT NOW(),
    updated_at                  TIMESTAMP DEFAULT NOW(),
    UNIQUE(org_id)
);
```

SQLAlchemy Model:
```python
class OrgLimit(Base):
    __tablename__ = "org_limits"
    id                         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id                     = Column(UUID(as_uuid=True), ForeignKey("organisations.id"), unique=True)
    max_users                  = Column(Integer, default=10)
    max_collections            = Column(Integer, default=5)
    max_vectors_per_collection = Column(Integer, default=10000)
    created_at                 = Column(DateTime, default=datetime.utcnow)
    updated_at                 = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

---

### Table 3: users

```sql
CREATE TABLE users (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id              UUID REFERENCES organisations(id) ON DELETE CASCADE,
    username_encrypted  BYTEA NOT NULL,
    username_hash       TEXT NOT NULL,
    password            TEXT NOT NULL,
    role                VARCHAR(50) DEFAULT 'member',
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP DEFAULT NOW(),
    UNIQUE(org_id, username_hash)
);
```

SQLAlchemy Model:
```python
class User(Base):
    __tablename__ = "users"
    id                 = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id             = Column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    username_encrypted = Column(LargeBinary, nullable=False)
    username_hash      = Column(Text, nullable=False)
    password           = Column(Text, nullable=False)
    role               = Column(String(50), default="member")
    is_active          = Column(Boolean, default=True)
    created_at         = Column(DateTime, default=datetime.utcnow)
    __table_args__     = (UniqueConstraint("org_id", "username_hash"),)
```

---

### Table 4: sessions

```sql
CREATE TABLE sessions (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

SQLAlchemy Model:
```python
class Session(Base):
    __tablename__ = "sessions"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    token_hash = Column(Text, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
```

---

### Table 5: user_file_usage

```sql
CREATE TABLE user_file_usage (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    org_id      UUID REFERENCES organisations(id) ON DELETE CASCADE,
    file_count  INT DEFAULT 0,
    usage_date  DATE DEFAULT CURRENT_DATE,
    UNIQUE(user_id, usage_date)
);
```

SQLAlchemy Model:
```python
class UserFileUsage(Base):
    __tablename__ = "user_file_usage"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    org_id     = Column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    file_count = Column(Integer, default=0)
    usage_date = Column(Date, default=date.today)
    __table_args__ = (UniqueConstraint("user_id", "usage_date"),)
```

---

### Table 6: collections

```sql
CREATE TABLE collections (
    id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id       UUID REFERENCES organisations(id) ON DELETE CASCADE,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    vector_count INT DEFAULT 0,
    is_active    BOOLEAN DEFAULT TRUE,
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(org_id, name)
);
```

SQLAlchemy Model:
```python
class Collection(Base):
    __tablename__ = "collections"
    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    org_id       = Column(UUID(as_uuid=True), ForeignKey("organisations.id"))
    name         = Column(String(255), nullable=False)
    description  = Column(Text)
    vector_count = Column(Integer, default=0)
    is_active    = Column(Boolean, default=True)
    created_by   = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at   = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("org_id", "name"),)
```

---

## Encryption & Hashing Rules

| Data | Method | Reason |
|---|---|---|
| Org name | `pgp_sym_encrypt` via `text()` SQL (2-way) | Need to read it back |
| Username | `pgp_sym_encrypt` via `text()` SQL (2-way) | Need to read it back |
| Username lookup | HMAC-SHA256 (Python `hmac` module) | Fast WHERE clause — no decrypt needed |
| Password | `passlib bcrypt` (1-way) | Only verify, never read back |
| JWT | Signed with JWT_SECRET via python-jose | Stateless, trusted auth token |

### encryption.py — Key Functions

```python
import hmac, hashlib
from sqlalchemy import text
from app.config import settings

def generate_username_hash(username: str) -> str:
    """
    HMAC-SHA256 of lowercase username.
    Used for fast DB WHERE lookups — same input always gives same hash.
    """
    return hmac.new(
        settings.HASH_SECRET.encode(),
        username.lower().encode(),
        hashlib.sha256
    ).hexdigest()

def encrypt_value(db, value: str) -> bytes:
    """
    Encrypt a string using pgcrypto pgp_sym_encrypt.
    NOTE: Same input gives DIFFERENT bytes each time (random IV).
    Do NOT use for WHERE lookups — use username_hash instead.
    """
    result = db.execute(
        text("SELECT pgp_sym_encrypt(:val, :key)"),
        {"val": value, "key": settings.ENCRYPTION_KEY}
    ).scalar()
    return result

def decrypt_value(db, encrypted: bytes) -> str:
    """Decrypt bytes back to original string using pgp_sym_decrypt."""
    result = db.execute(
        text("SELECT pgp_sym_decrypt(:enc, :key)"),
        {"enc": encrypted, "key": settings.ENCRYPTION_KEY}
    ).scalar()
    return result
```

### auth.py — Key Functions

```python
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRES_MINUTES)
    return jwt.encode({**data, "exp": expire}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
```

---

## Key SQL Query Patterns

### Find org by decrypted name
```python
db.execute(
    text("SELECT id FROM organisations WHERE pgp_sym_decrypt(name_encrypted, :key) = :name"),
    {"key": ENCRYPTION_KEY, "name": org_name}
).fetchone()
```

### Find user by username_hash within org
```python
db.execute(
    text("""
        SELECT id, org_id, password, role, is_active,
               pgp_sym_decrypt(username_encrypted, :key) AS username
        FROM users
        WHERE org_id = :org_id AND username_hash = :hash
    """),
    {"key": ENCRYPTION_KEY, "org_id": org_id, "hash": username_hash}
).fetchone()
```

### Upsert daily file usage
```python
db.execute(
    text("""
        INSERT INTO user_file_usage (user_id, org_id, file_count, usage_date)
        VALUES (:user_id, :org_id, 1, CURRENT_DATE)
        ON CONFLICT (user_id, usage_date)
        DO UPDATE SET file_count = user_file_usage.file_count + 1
    """),
    {"user_id": user_id, "org_id": org_id}
)
db.commit()
```

---

## FastAPI Dependencies (dependencies.py)

```python
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    1. Decode JWT using JWT_SECRET
    2. Extract user_id, org_id, role from payload
    3. Fetch user from DB
    4. If not found or is_active=False → raise HTTPException 401
    5. Return user object — attached to request as dependency
    """

async def require_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Check current_user.role in ['admin', 'super_admin']
    If not → raise HTTPException 403
    """

async def require_super_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Check current_user.role == 'super_admin'
    If not → raise HTTPException 403
    """
```

---

## All API Endpoints

---

### POST /api/org/register
**Register a new organisation**

Auth: No

Request Body:
```json
{ "org_name": "IIT_Mandi" }
```

Process:
1. Validate `org_name` not empty
2. Decrypt all existing org names → check if name already taken
3. If exists → `409 Organisation already registered`
4. Encrypt org name → insert into `organisations` → get `org_id`
5. Auto-insert into `org_limits` with defaults
6. Return 201

Success `201`:
```json
{
  "org_id": "uuid",
  "org_name": "IIT_Mandi",
  "limits": {
    "max_users": 10,
    "max_collections": 5,
    "max_vectors_per_collection": 10000
  }
}
```

Errors: `400` missing field · `409` org already exists

---

### POST /api/org/{org_id}/user/register
**Register a user under a specific org**

Auth: No

URL Params: `org_id`

Request Body:
```json
{
  "username": "rahul",
  "password": "pass123",
  "role": "member"
}
```

Process:
1. Validate all fields
2. Check `org_id` exists → else `404`
3. Fetch `org_limits` → get `max_users`
4. Count active users for `org_id` → if count >= max_users → `429`
5. Generate HMAC hash of lowercase username
6. Check `(org_id, username_hash)` not duplicate → else `409`
7. Encrypt username, bcrypt hash password
8. Insert into `users`
9. Return 201

Success `201`:
```json
{
  "user_id": "uuid",
  "username": "rahul",
  "org_id": "uuid",
  "role": "member"
}
```

Errors: `400` · `404` org not found · `409` username taken · `429` user limit reached

---

### POST /api/auth/login
**Login and receive JWT token**

Auth: No

Request Body:
```json
{
  "org_name": "IIT_Mandi",
  "username": "rahul",
  "password": "pass123"
}
```

Process:
1. Validate all fields present
2. Decrypt all org names → find match → get `org_id` → else `404`
3. Generate HMAC hash of lowercase username
4. Query `users` by `(org_id, username_hash)` → else `401`
5. Check `is_active = true` → else `403`
6. `verify_password(password, user.password)` → else `401`
7. `create_access_token({"user_id": ..., "org_id": ..., "role": ...})`
8. Hash token → insert into `sessions` with expiry
9. Return 200

Success `200`:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user_id": "uuid",
  "org_id": "uuid",
  "role": "member"
}
```

Errors: `400` · `401` invalid credentials · `403` account disabled · `404` org not found

---

### GET /api/user/me
**Get logged-in user's own profile**

Auth: JWT

Headers:
```
Authorization: Bearer <token>
```

Process:
1. `get_current_user` dependency validates token → returns user
2. Decrypt username from `user.username_encrypted`
3. Fetch org → decrypt org name
4. Return profile

Success `200`:
```json
{
  "user_id": "uuid",
  "username": "rahul",
  "org_id": "uuid",
  "org_name": "IIT_Mandi",
  "role": "member",
  "is_active": true,
  "created_at": "2024-01-15T10:00:00Z"
}
```

Errors: `401` invalid/expired token

---

### POST /api/auth/logout
**Logout and invalidate current session**

Auth: JWT

Process:
1. Validate JWT → get `user_id`
2. Hash the incoming token
3. Delete matching row from `sessions`
4. Return 200

Success `200`:
```json
{ "message": "Logged out successfully" }
```

---

### POST /api/user/change-password
**Change own password**

Auth: JWT

Request Body:
```json
{
  "old_password": "pass123",
  "new_password": "newpass456"
}
```

Process:
1. `get_current_user` → get `user_id`
2. `verify_password(old_password, user.password)` → else `401`
3. Validate `new_password` min 8 chars
4. `hash_password(new_password)` → update `users`
5. Delete all sessions for this user (force re-login)
6. Return 200

Errors: `401` wrong old password · `400` weak new password

---

### POST /api/user/upload
**Upload a file into a RAG collection (5 files/user/day limit)**

Auth: JWT

Request: `multipart/form-data`

Fields:
```
file           → the file binary
collection_id  → UUID of the target collection
```

Process:
1. `get_current_user` → get `user_id`, `org_id`
2. Query `user_file_usage` where `user_id AND usage_date = CURRENT_DATE`
3. No row found → treat `file_count = 0`
4. If `file_count >= 5` → `429 Daily upload limit of 5 files reached`
5. Verify `collection_id` exists and belongs to same `org_id` → else `404`
6. Process file → push vectors to Vector DB collection
7. Upsert `user_file_usage` → increment `file_count` by 1
8. Return 200 with remaining count

Success `200`:
```json
{
  "message": "File uploaded successfully",
  "uploads_used_today": 3,
  "uploads_remaining_today": 2
}
```

Errors: `401` · `404` collection not found · `429` daily limit reached

---

### POST /api/org/{org_id}/collection/create
**Create a new RAG/VDB collection for an org**

Auth: JWT + Admin

URL Params: `org_id`

Request Body:
```json
{
  "name": "research-papers",
  "description": "Collection for research documents"
}
```

Process:
1. `require_admin` dependency
2. Confirm requester's `org_id` matches URL `org_id`
3. Fetch `org_limits` → get `max_collections`
4. Count active collections → if count >= max → `429`
5. Check name not duplicate in org → else `409`
6. Insert into `collections`
7. Create actual index in Vector DB (Pinecone / Qdrant / Weaviate)
8. Return 201

Success `201`:
```json
{
  "collection_id": "uuid",
  "name": "research-papers",
  "org_id": "uuid",
  "vector_count": 0,
  "created_at": "2024-01-15T10:00:00Z"
}
```

Errors: `403` not admin · `409` name duplicate · `429` collection limit reached

---

### GET /api/org/{org_id}/collections
**List all active collections in an org**

Auth: JWT + Admin

Process:
1. `require_admin` + org match check
2. Fetch all active collections for `org_id`
3. Return list

Success `200`:
```json
[
  {
    "collection_id": "uuid",
    "name": "research-papers",
    "description": "...",
    "vector_count": 1500,
    "created_at": "2024-01-15T10:00:00Z"
  }
]
```

---

### GET /api/org/{org_id}/stats
**View full usage stats for the org**

Auth: JWT + Admin

Process:
1. `require_admin` + org match
2. Fetch `org_limits`
3. Count users (total + active)
4. Count active collections
5. Fetch today's file usage for all users in org
6. Return combined stats

Success `200`:
```json
{
  "org_id": "uuid",
  "org_name": "IIT_Mandi",
  "limits": {
    "users":       { "used": 7, "limit": 10 },
    "collections": { "used": 3, "limit": 5  }
  },
  "file_usage_today": [
    { "username": "rahul", "uploaded": 5, "remaining": 0 },
    { "username": "priya", "uploaded": 2, "remaining": 3 }
  ]
}
```

---

### GET /api/org/{org_id}/users
**List all users in an org**

Auth: JWT + Admin

Process:
1. `require_admin` + org match
2. Fetch all users for `org_id`
3. Decrypt each username
4. Return list (passwords never returned)

Success `200`:
```json
[
  {
    "user_id": "uuid",
    "username": "rahul",
    "role": "member",
    "is_active": true,
    "created_at": "2024-01-15T10:00:00Z"
  }
]
```

---

### PATCH /api/org/{org_id}/user/{user_id}/deactivate
**Deactivate a user**

Auth: JWT + Admin

Process:
1. `require_admin` + confirm user belongs to `org_id`
2. Set `is_active = false`
3. Delete all active sessions for that user
4. Return 200

Success `200`:
```json
{ "message": "User deactivated successfully" }
```

---

### PATCH /api/org/{org_id}/user/{user_id}/activate
**Reactivate a deactivated user**

Auth: JWT + Admin

Process:
1. `require_admin` + confirm user belongs to `org_id`
2. Set `is_active = true`
3. Return 200

---

### PATCH /api/admin/org/{org_id}/limits
**Update org limits — super admin only**

Auth: JWT + Super Admin

Request Body:
```json
{
  "max_users": 50,
  "max_collections": 10,
  "max_vectors_per_collection": 50000
}
```

Process:
1. `require_super_admin` dependency
2. Validate all values are positive integers
3. Update `org_limits` row for `org_id`
4. Return updated limits

Success `200`:
```json
{
  "org_id": "uuid",
  "max_users": 50,
  "max_collections": 10,
  "max_vectors_per_collection": 50000
}
```

---

## All Endpoints Summary

| # | Route | Method | Auth | Role | Purpose |
|---|---|---|---|---|---|
| 1 | /api/org/register | POST | No | — | Register organisation |
| 2 | /api/org/{org_id}/user/register | POST | No | — | Register user in org |
| 3 | /api/auth/login | POST | No | — | Login, receive JWT |
| 4 | /api/user/me | GET | JWT | Any | Get own profile |
| 5 | /api/auth/logout | POST | JWT | Any | Logout |
| 6 | /api/user/change-password | POST | JWT | Any | Change own password |
| 7 | /api/user/upload | POST | JWT | Any | Upload file (5/day limit) |
| 8 | /api/org/{org_id}/collection/create | POST | JWT | Admin | Create RAG collection |
| 9 | /api/org/{org_id}/collections | GET | JWT | Admin | List all collections |
| 10 | /api/org/{org_id}/stats | GET | JWT | Admin | View org usage stats |
| 11 | /api/org/{org_id}/users | GET | JWT | Admin | List all users |
| 12 | /api/org/{org_id}/user/{user_id}/deactivate | PATCH | JWT | Admin | Deactivate user |
| 13 | /api/org/{org_id}/user/{user_id}/activate | PATCH | JWT | Admin | Activate user |
| 14 | /api/admin/org/{org_id}/limits | PATCH | JWT | Super Admin | Update org limits |

---

## Error Code Reference

| Code | When |
|---|---|
| 400 | Missing or invalid input fields |
| 401 | Invalid/missing/expired token or wrong credentials |
| 403 | Valid token but insufficient role, or account disabled |
| 404 | Org, user, or collection not found |
| 409 | Duplicate org name, username, or collection name |
| 429 | User/collection/file limit reached |
| 500 | Unexpected server or database error |

---

## Running the Application

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Create the database
psql -U postgres_sourava -c "CREATE DATABASE \"ContextFlow\";"

# 3. Enable pgcrypto extension
psql -U postgres_sourava -d ContextFlow -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# 4. Run Alembic migrations
alembic upgrade head

# 5. Start FastAPI server
uvicorn app.main:app --reload --port 8000
```

Interactive API docs:
- Swagger UI → `http://localhost:8000/docs`
- ReDoc → `http://localhost:8000/redoc`

---

## Database Tables Summary

| Table | Purpose |
|---|---|
| organisations | Stores encrypted org names |
| org_limits | Per-org quota config (users, collections, vectors) |
| users | Encrypted usernames, hashed passwords, linked to org |
| sessions | Active JWT sessions — used for logout and invalidation |
| user_file_usage | Daily file upload counter per user — auto-resets by date |
| collections | RAG/VDB collection indexes per org |

---

## Golden Rules

1. **Encrypt** what you need to read back — org name, username (`pgp_sym_encrypt`)
2. **Hash** what you only need to verify — passwords (`passlib bcrypt`)
3. **HMAC hash** what you need to search by — `username_hash` for fast WHERE lookups
4. **Sign** what you need to trust across requests — JWT (`python-jose`)
5. **Never** store plain text passwords or org names
6. **Never** hardcode secrets — always use `.env` + `pydantic-settings`
7. **Always** use SQLAlchemy parameterised queries — never build SQL strings manually
8. **Three separate secrets** — `ENCRYPTION_KEY`, `HASH_SECRET`, `JWT_SECRET` are all different
9. **pgcrypto runs inside PostgreSQL** — call it via SQLAlchemy `text()` with bound params
10. **Alembic owns schema** — never alter tables manually in production, always create a migration