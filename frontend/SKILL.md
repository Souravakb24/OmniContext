---
name: inflowmind-design
description: Use this skill to generate well-branded interfaces and assets for InflowMind, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts *or* production code, depending on the need.

## Quick orientation

InflowMind is a multi-tenant knowledge platform. Tagline: **Flow through your knowledge.** Visual metaphor: **ink moving through paper.** Backgrounds are warm cream, primary brand colour is a calm "Current" teal, type pairs Instrument Serif (display, italic emphasis) with Geist (UI). Voice is calm, second-person, sentence-cased everywhere. No emoji in product UI. Lucide icons only.

## Where to find things

- `README.md` — content fundamentals, visual foundations, iconography rules
- `colors_and_type.css` — all design tokens (drop into any HTML to inherit the system)
- `assets/` — logo, mark, flow-line motif, file-type glyphs
- `preview/` — design system cards (colour, type, components)
- `ui_kits/marketing-site/` — public homepage recreation
- `ui_kits/member-app/` — member surfaces (library, upload, ingestion, ask)
- `ui_kits/admin-console/` — admin surfaces (members, collections, usage)

## When to lift vs invent

Lift directly from the UI kits when the screen you're building exists there — sidebar nav, document row, ingestion drawer, status pills, member table, modals. Invent only when the surface isn't already covered, and stay inside the system: use the existing tokens, pair Instrument Serif with Geist, prefer the flow-line motif over new ornamentation, never introduce a new accent colour.
