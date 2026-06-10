# InflowMind Design System

> **Flow through your knowledge.**

InflowMind is a multi-tenant knowledge platform. Organisations upload their documents (PDFs, decks, Word docs) into named *collections*; an ingestion pipeline converts → parses → chunks → embeds → indexes them; members then query that knowledge through RAG-powered search and chat. Admins manage users, quotas, and collections; super admins manage tenants and consent.

This repository is the **design system** for InflowMind — the brand voice, type, colour, motion, iconography, and UI kits that any designer or agent should pull from when building artefacts for the product.

## Sources

| Source | Where | Notes |
|---|---|---|
| Backend codebase | `authentication_api/` (read-only mount) | FastAPI · PostgreSQL · pgcrypto · ChromaDB ingestion worker. No production frontend — only a Gradio test harness. |
| API reference | `authentication_api/api.md`, `authentication_api/API_CURL_REFERENCE.md` | Source of truth for screens, statuses, role rules. |
| Brand name & tagline | Provided by the user | `InflowMind` · *Flow through your knowledge.* |

> No Figma file, design tokens, or production UI was provided. The visual language below is defined fresh against the brand promise (knowledge as flow) and the surfaces the backend already exposes (auth, collections, ingestion, admin).

## Product surfaces

The codebase makes three distinct surfaces obvious. UI kits exist for each:

1. **Member app** — login, upload documents, watch them ingest, search/chat the collection.
2. **Admin console** — manage users (invite / promote / deactivate), create collections, view org usage stats, set quotas.
3. **Marketing site** — the public-facing pitch: tagline, "flow" motif, pricing, sign-up CTA.

A super-admin console exists in the backend but is internal-only; not in scope for the kit.

## Index

```
README.md                — this file
SKILL.md                 — Claude Skills entrypoint
colors_and_type.css      — design tokens (colour, type, spacing, radius, shadow, motion)
fonts/                   — webfonts (Instrument Serif, Geist, JetBrains Mono via Google Fonts)
assets/                  — logo marks, flow-line illustrations, file-type glyphs
preview/                 — Design System tab cards (colours, type specimens, tokens, components)
ui_kits/
  member-app/            — member-facing app (upload, library, chat)
  admin-console/         — admin tools (users, collections, stats)
  marketing-site/        — public homepage
```

---

## CONTENT FUNDAMENTALS

InflowMind talks like a thoughtful colleague who has read the docs so you don't have to. Not chirpy. Not enterprise-stiff. **Calm, precise, a little literary.** The product is about thinking, so the voice respects the reader's intelligence.

### Voice principles

- **Second person, present tense.** "Your knowledge stays inside your org. We never train on it." Never "users can" — always "you."
- **Plain English over jargon.** Say *upload a document*, not *ingest a corpus*. Internal terms (chunking, embedding, indexing) only appear in the ingestion progress UI where they are accurate and meaningful.
- **Active, short sentences.** Average 8–14 words. Trim every "please," "simply," "just."
- **One idea per line in marketing.** Headlines stack like verse, not paragraphs.
- **Sentence case everywhere.** Including buttons, nav, headings. The only Title Case is the product name *InflowMind* and proper nouns.
- **No emoji in product UI.** Emoji is fine on social and inside docs, never inside the app chrome or marketing hero.
- **No exclamation marks.** Confidence doesn't shout.
- **Numbers are numerals from two upward.** "1 file" / "2 files" / "12 collections."

### Tone by surface

| Surface | Posture | Example |
|---|---|---|
| Marketing hero | Quietly ambitious | *Your team's knowledge, finally searchable.* |
| Empty states | Inviting, never demanding | *Nothing here yet — drop a PDF to start.* |
| Errors | Honest, never blaming | *This file is password-protected. Unlock it and try again.* |
| Success | Understated | *Uploaded. Ingestion starts in a moment.* |
| Limits | Specific, never scolding | *You've used 5 of 5 uploads today. The counter resets at midnight.* |
| Destructive confirms | Direct | *Deactivate priya? They'll be signed out immediately.* |

### Microcopy examples (lift these verbatim)

- CTA buttons: **Upload a document** · **Create collection** · **Invite a member** · **Sign in** · **Continue**
- Pipeline statuses (lifted from API): *Uploaded · Converting · Parsing · Chunking · Embedding · Indexing · Ready · Failed* — the only place "Ready" replaces the API's "COMPLETED" for readability.
- Quota copy: *3 of 10 members · 2 of 5 collections · 12 of 50 documents in this collection*
- Tagline variants: *Flow through your knowledge* · *Your team's knowledge, in one current* · *Read less. Know more.*

---

## VISUAL FOUNDATIONS

The brand metaphor is **ink moving through paper**. Knowledge enters as documents (paper), flows through the ingestion pipeline (ink lines), and surfaces as answers (clear water). Every visual decision laddered up to that.

### Colour

A small, deliberate palette. Not a SaaS rainbow.

- **Ink** `#0E1B2C` — primary text, headings, the wordmark. Near-black with a navy undertone so it reads as "ink" not "carbon."
- **Current** `#2E6F8E` — the brand teal. Used for primary actions, links, the flow lines. Calm, watery, never neon.
- **Current deep** `#1B4A63` — hover/pressed state for primary buttons; rare large fills.
- **Paper** `#F5F1E8` — the canvas. Warm cream, never cool grey. Background of marketing pages.
- **Paper soft** `#FAF7F0` — app surfaces (slightly lighter so cards lift off marketing pages cleanly).
- **Mist** `#E7E1D3` — hairlines, dividers, deselected pill backgrounds.
- **Sand** `#D9B271` — secondary accent. Used sparingly for highlights, the "Pro" pill, hover dots.
- **Ember** `#C24A3A` — danger, deactivate, destructive confirms. A muted brick, not a stoplight red.
- **Moss** `#5C7A4F` — success, "Ready" status. Pulled from the same paper-and-pigment family.

The palette is **warm**. Backgrounds tint toward cream, not white. Photography is treated the same way — warm grade, low contrast, slight grain.

### Type

Two families do all the work, plus a mono for technical surfaces.

- **Instrument Serif** — display. Used for marketing hero (60–96px), section openers (44px), and the wordmark itself. Tight tracking, slightly oversized italic for emphasis. Carries the "literary, considered" half of the brand.
- **Geist** — UI sans. Used for everything else: body, buttons, nav, form fields, microcopy. 14/16/18 px in product; 16/18 px on marketing.
- **JetBrains Mono** — only inside the ingestion log, document IDs, API responses, and the developer docs.

Vertical rhythm uses a 4 px base. Body line-height 1.55; display line-height 1.05–1.1 (let the serifs breathe but stay tight).

### Spacing

8-step scale on a 4 px base: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 px`. The jumps after 24 keep things from feeling generically Material.

Layout containers cap at **1180 px** for marketing, **1440 px** for the admin console, **820 px** for reading surfaces (the document detail view). Generous left/right padding (24–48 px) on every page.

### Backgrounds

- Marketing pages use the warm **Paper** background, full bleed, with a single hand-drawn **flow line** (a long, gentle SVG curve in `Current` at 8–14 % opacity) running across the hero. Never a gradient mesh, never a hero photograph.
- App surfaces use **Paper soft**. Cards sit on it with a 1 px **Mist** border, no shadow.
- One repeating motif allowed: the **flow line** SVG can be reused as a section divider, a loading state, and the icon inside the wordmark.

No purple gradients, no glassmorphism, no animated noise. The brand earns trust by being quiet.

### Borders & corners

- Default radius is **8 px** for inputs, buttons, cards.
- Pills and chips: **999 px** (fully rounded).
- Modals: **16 px**.
- Marketing hero cards and the wordmark capsule: **20 px**.
- Borders are always **1 px solid Mist** at rest. Focused inputs get a 1 px Current border + a 3 px Current-at-12 % outer ring.

### Shadows & elevation

Shadows are used sparingly and are warm-toned, never grey-black.

- `--shadow-1` — `0 1px 2px rgba(14, 27, 44, 0.04)` for cards-at-rest.
- `--shadow-2` — `0 4px 16px rgba(14, 27, 44, 0.06)` for menus and the file dropzone hover state.
- `--shadow-3` — `0 16px 48px rgba(14, 27, 44, 0.10)` for modals.

Floating UI almost always uses a border + tiny shadow combo rather than a big shadow alone — keeps things crisp on the cream background.

### Motion

- Default ease: `cubic-bezier(0.2, 0.8, 0.2, 1)` ("flow" easing — fast settle, gentle finish).
- Durations: 120 ms (state changes), 200 ms (panels, drawers), 400 ms (page transitions), 600 ms (flow-line draw on the hero).
- Hover on primary buttons: lighten 4 %, no movement. Press: darken 6 % + 1 px translate-y. No bounce. No spring.
- Loading: the **flow line** strokes itself across the top of any panel that's waiting on the ingestion worker. No spinners except in the document row where status pills already convey progress.

### States

- **Hover (interactive):** background lightens by 4 % (paper) or darkens by 4 % (filled). Cursor pointer. Text-only links underline.
- **Pressed:** background darkens by 6 %. The button translates 1 px down.
- **Focus:** 2 px Current outline at 100 % offset 2 px. Never removed for accessibility.
- **Disabled:** opacity 0.45, no pointer events. Never grey out the text colour — preserve hierarchy.
- **Selected (nav, tabs):** Ink text, 2 px Current underline 6 px below the baseline. No filled pill backgrounds for nav.

### Transparency & blur

Used only in two places: (1) the modal backdrop (`rgba(14, 27, 44, 0.4)` over a 12 px backdrop blur), and (2) the sticky marketing header (Paper at 80 % alpha + 16 px blur once the user scrolls past 80 px).

### Cards

- Background: Paper soft.
- Border: 1 px Mist.
- Radius: 12 px (default) or 20 px (marketing).
- Padding: 24 px (default) / 32 px (marketing).
- No shadow at rest. `--shadow-2` only on interactive hover.
- Cards never have a coloured left border, gradient fill, or emoji corner. Hierarchy is created with type and a single Sand or Current dot when needed.

### Imagery vibe

If photography is used (rare — illustration is preferred): warm grade, paper-grain overlay at 8 %, desaturated mid-tones, no people-on-laptops stock. Better: still life of books, paper, ink, water. Best: no photography, use the flow-line illustration system.

---

## ICONOGRAPHY

The codebase ships no icon set. We use **[Lucide](https://lucide.dev/)** via CDN — its calm 1.5 px stroke and squared-off terminals match the considered, paper-and-ink mood better than Heroicons (too geometric) or Phosphor (too playful).

- **Stroke:** 1.5 px (Lucide's default; do not change).
- **Size:** 16 px in dense UI · 20 px in nav, buttons · 24 px in marketing.
- **Colour:** inherits `currentColor`. Never use coloured icons except inside status pills.
- **Filled variants:** never. The brand reads as line-drawn ink.

File-type glyphs (PDF, DOCX, PPTX) are custom 24 px line drawings in `assets/file-glyphs/` — same 1.5 px stroke, label inside, Current accent on the dog-ear. Built into a single SVG sprite so they sit alongside Lucide consistently.

The **wordmark** is a custom lockup — see `assets/logo.svg`. It uses the Instrument Serif lowercase italic `i` with the flow-line passing through it as the dot. Mark-only version exists in `assets/mark.svg` for favicons and avatars.

**No emoji** in product UI. No Unicode dingbats. Decorative flourishes come from the flow-line SVG system, not glyphs.

> **Substitution flag:** Lucide is a CDN substitution because the codebase has no icon system of its own. If the team adopts a different icon library, swap the CDN link in `colors_and_type.css` and update this section.

---

## Font substitution flag

No font files shipped with the codebase. Choices were made fresh:

- **Instrument Serif** — from Google Fonts. Free / open.
- **Geist** — from Vercel / Google Fonts. Free / open.
- **JetBrains Mono** — from Google Fonts. Free / open.

All three are loaded via `@import` in `colors_and_type.css`. If a brand owner provides proper licensed cuts (e.g. a custom serif), swap the `@import` URLs and update this file. **Flagging this for review** — Instrument Serif is the only opinionated choice and may want a second look.
