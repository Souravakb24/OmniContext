# Integration plan — turning this design system into a real React app

> Hand this file (and the whole project) to Claude Code. It explains what exists,
> what to build, and in what order. Written for someone doing their first frontend project.

## The product

**omnicontext** — *"Ask documents the smart way."* A multi-tenant knowledge platform:
teams upload documents into collections, an ingestion pipeline makes them searchable, and
members ask questions in plain English and get answers that cite the source page.

> **Three names are in play — settle this early:**
> - **omnicontext** — the public product / brand shown to users (landing, login, app chrome).
> - **InflowMind** — the original name on this *design-system project folder* and some brand docs.
> - **ContextFlow** — the backend's internal name (FastAPI title, `.env`, comments).
>
> Decision: standardise the user-facing name to **omnicontext** everywhere in the UI. Keep
> "ContextFlow" internal to the backend, or rename it — your call — but users should only
> ever see "omnicontext."

## The mental model

This project has three layers. Integration = keeping the look, swapping fake for real.

1. **Brand rules** — `README.md`, `SKILL.md`. The "why."
2. **Design tokens** — `colors_and_type.css`. Every colour/font/spacing value. The single
   source of truth. Drop this one file into the real app and the whole look comes with it.
3. **Components** — `ui_kits/*/*.jsx`. Already real React. Currently loaded via in-browser
   Babel (no build step) and fed **fake data** from `data.js`. The job is to re-house them
   in a proper React app and connect them to the live backend.

> Key reassurance: the UI is already React. This is **re-housing + wiring**, not a rewrite.

## What's already built (the entry points)

| File | What it is |
|---|---|
| `Omnicontext Landing.html` | Public marketing page (hero, features, pricing, CTA). |
| `Omnicontext Login.html` | Sign in / create org / join org. Resolves a **role** and routes into the app. |
| `ui_kits/member-app/` | **The app.** One unified shell — see below. |
| `ui_kits/admin-console/` | The *same* app, just opened on the Members view. Not a separate app. |
| `ui_kits/marketing-site/` | An earlier multi-section marketing kit (reference). |

### The app is ONE app, role-gated
There is a single application shell (`ui_kits/member-app/`). What a user sees depends on
their role:
- **member** → Workspace only: Library, Ask, Upload.
- **admin** → Workspace **plus** an Admin section: Members, Collections, Usage.

An admin is a member with extra powers — not a separate login. The login page passes the
resolved role into the app (prototype: via `?role=` on the URL; production: from the
`/api/auth/login` response), and the sidebar shows or hides the Admin section accordingly.

## The backend contract

- Backend: `authentication_api/` (FastAPI), running locally at `http://127.0.0.1:8000`.
- Read `authentication_api/api.md` and `authentication_api/API_CURL_REFERENCE.md` first —
  they document every endpoint, request shape, status value, and role rule. Treat them as
  the source of truth for all data fetching.
- Auth is JWT-based. First user in an org is admin; admin-only endpoints are enforced
  server-side (the frontend just hides/locks admin UI for non-admins).
- The three auth flows the login page already maps to:
  - **Sign in** → `POST /api/auth/login` `{ org_name, username, password }` → returns `{ access_token, role, ... }`
  - **Create new org** → `POST /api/org/register` `{ org_name }` then `POST /api/org/{id}/user/register` `{ username, password, role:"admin" }`
  - **Join existing org** → `POST /api/org/{id}/user/register` `{ username, password, role:"member" }`
- Ingestion statuses to expect: Uploaded · Converting · Parsing · Chunking · Embedding ·
  Indexing · Ready · Failed (the app already renders all of these as status pills).

## Build order (do NOT build everything at once)

Each phase teaches the patterns for the next. Ship and test each before moving on.

### Phase 1 — Scaffold the React app
- Create a **Vite + React** project (Vite = the modern fast standard; do not use
  Create React App).
- Add `colors_and_type.css` as a global stylesheet imported once at the app root.
- Add **React Router** with routes: `/` (landing), `/login`, `/library`, `/ask`,
  `/admin/members`, `/admin/collections`, `/admin/usage`.
- Goal: blank routed app that already has the right fonts/colours.

### Phase 2 — Move the components in
- Copy each `ui_kits/member-app/*.jsx` file into `src/components/`. (This folder is the whole
  app; the admin views live here too.)
- Convert the `window.Foo = Foo` globals into standard ES `import`/`export`.
- Bring `ui_kits/member-app/app.css` in as the app stylesheet.
- Goal: every screen renders with fake data inside the real app.

### Phase 3 — Wire to the backend (the real work)
- Build a small API client module (one place that knows the base URL and attaches the JWT).
- Delete `member-app/data.js`; replace each fake array with a real fetch:
  - login → receive + store JWT **and role**
  - list collections, list documents
  - upload a document (multipart)
  - **poll the ingestion `/status` endpoint** to drive the pipeline UI (replace the timer
    in `UploadDrawer.jsx` with real status polling)
  - the Ask/chat view → the query/RAG endpoint
- Goal: real data flowing through the existing UI.

### Phase 4 — Auth, roles, and polish
- Wire the login form to the real auth endpoints (the three flows above); persist the token.
- `POST /api/auth/login` returns `role` — store it in auth context/state and render by role:
  **member** → Workspace only; **admin** → Workspace + Admin section. (The prototype passes
  role via `?role=` on the redirect; replace that with real auth state.)
- Gate `/admin/*` routes behind the `admin` role (belt-and-braces; the backend enforces it too).
- Handle the real error/empty states: wrong password (`401`), org not found (`404`),
  account disabled (`403`), user limit reached (`429`). Copy patterns are in
  `README.md` → Content Fundamentals.

### Phase 5 — Marketing site (last, optional)
- Lowest priority. Nobody using the product needs it daily. Ship `Omnicontext Landing.html`
  as a small standalone page or fold it into the React app at `/`.

## Decisions to make before/early in the build

1. **Naming** — standardise the UI on **omnicontext** (see the box up top). Decide whether to
   rename the backend from "ContextFlow" or leave it internal.
2. **Where the app is deployed** — local-only for now; revisit hosting after Phase 3 works.

## What "done" looks like for v1

A user can: sign in → land in the right experience for their role → see their library →
upload a PDF → watch real ingestion progress → ask a question → get an answer citing the
source page. An admin can additionally: invite/promote/deactivate members, create
collections, and see usage. That's the whole loop.

## Guardrails for staying on-brand while integrating

- Never introduce a new accent colour — use the tokens in `colors_and_type.css`.
- Keep Instrument Serif for display, Geist for UI, JetBrains Mono for code/IDs.
- Lucide icons only, 1.5px stroke, no filled variants, no emoji in product UI.
- Sentence case everywhere. Calm, second-person voice. See `README.md` for examples.
- Prefer the flow-line motif over inventing new ornamentation.
