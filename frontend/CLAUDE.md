# Project context — read me first

> This file is loaded automatically into every conversation in this project.
> It captures the human context behind the InflowMind design system so any
> new chat is immediately caught up.

## Who I am / where I'm at

- This is my **first real frontend project**. Explain things plainly, don't assume I know React tooling, and tell me *why* as well as *what*.
- I have **Claude Code** and plan to use it to integrate this design with my backend.
- I want the final product built in **React**, not the browser-loaded HTML the design kits currently use.

## What this project is

InflowMind is a **multi-tenant knowledge platform** — a private "second brain" for an
organisation. Teams upload documents (PDF / DOCX / PPTX) into named *collections*; an
ingestion pipeline (Convert → Parse → Chunk → Embed → Index) makes them searchable;
members then ask questions in plain English and get answers that cite the source page.

- **Tagline:** Flow through your knowledge.
- **Brand metaphor:** ink moving through paper. Warm cream backgrounds, a calm teal
  ("Current"), Instrument Serif + Geist type.
- **Likely first customers:** research teams, legal/compliance teams, product/strategy teams.

## The backend

- Lives in the mounted folder **`authentication_api/`** (FastAPI · PostgreSQL · pgcrypto · ChromaDB).
- It is **running locally** on my machine right now (default `http://127.0.0.1:8000`).
- Its endpoints are documented in `authentication_api/api.md` and
  `authentication_api/API_CURL_REFERENCE.md` — these are the integration contract.
- **Naming note to resolve:** three names are in play — **omnicontext** (the user-facing
  product brand: landing, login, app chrome), **InflowMind** (this design-system project
  folder + some brand docs), and **ContextFlow** (the backend's internal FastAPI/`.env` name).
  Decision so far: standardise the UI on **omnicontext**; keep "ContextFlow" internal to the
  backend (rename optional). Users should only ever see "omnicontext."

## This design system (what's already built)

| Layer | Files | Purpose |
|---|---|---|
| Brand rules | `README.md`, `SKILL.md` | Voice, colour meaning, do's & don'ts |
| Design tokens | `colors_and_type.css` | Single source of truth — colours, fonts, spacing, radius, shadow, motion |
| Components | `ui_kits/*/*.jsx` | Real React components (sidebar, login, upload drawer, chat, tables) with **fake data** |
| Landing | `index.html` | A clickable index linking the three UI kits |

The three UI kits are: **marketing-site**, **member-app**, **admin-console**.
They are visually finished but cosmetic — fake data, simulated behaviour.

## How to talk to me

- Plain language. Translate jargon.
- When suggesting next steps, give me a clear ordered plan, not options to agonise over.
- The full build plan lives in `INTEGRATION_PLAN.md` — read it before advising on integration.
