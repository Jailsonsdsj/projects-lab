# Career profile

The owner's professional profile as structured records: the single source of truth every career document is written from (R3-1, architecture §6.4). It replaces `Master Resume — source of truth.md` (study-materials `_Misc`) and career-os's `context/master-resume.md`. The owner edits it in the app; Claude reads it and adds to it through `career_*` tools. Sources: round 1 Q8, the master resume's structure, career-os's non-negotiable rules. Jobs and readiness are `21`, documents `22`.

## What the profile holds

| Record | Fields | Notes |
|---|---|---|
| **Person** (one) | Full name, headline, location, timezone, email, phone, summary (≤ 600 characters), languages (name + level) | Contact details are what the copy panel (`22`) copies |
| **Links** | Label, URL, kind (`linkedin`, `github`, `portfolio`, `scholar`, `other`) | Ordered |
| **Photo** | One image in R2 (`profile/photo.<ext>`), uploaded in the app with a session | The only upload the app has (R3-1). JPEG, PNG or WebP, ≤ 2 MB; the app shows initials without one |
| **Education** | Institution, degree, field, start, end (or in progress), notes | Dates as `YYYY-MM` or `YYYY` |
| **Experiences** | Organization, title, kind (`job`, `contract`, `research`, `project`), start, end (or current), location, summary | Ordered newest first |
| **Facts** | Text (≤ 300 characters), its experience or education (or none), **verified** (yes/no), skills it evidences | The bullets a document selects from. One fact, one claim |
| **Declared skills** | A skill from the registry (architecture §5), level (`familiar`, `working`, `strong`), years, note | What the owner claims; readiness `Declared` (`21`) |

## Rules

- **Never fabricate.** A document may only use what the profile holds: Claude selects, orders, rewords to the posting's vocabulary, and never adds an experience, a skill or a number (career-os rule 1, R3-1).
- **Unverified facts stay out.** A fact marked not verified (the old `[UNVERIFIED]` tag) is excluded from documents until the owner confirms it; `career_document_brief` lists it separately so Claude can ask (career-os rule 2).
- **A skill is stored once.** Declared skills reference the shared registry, so a skill named in a fact, a declaration, a job requirement and a Study topic is one row (`core_find_skill` rules: name or alias, ignoring case).
- **Verified by Study.** A topic Done with grade ≥ 7 makes its skill *verified* (A-8). Claude **offers** to declare it in the profile (or to add a fact citing the course and grade); it never adds silently.
- **Added once, used everywhere.** A new skill, experience or fact is added once, in the app or through a `career_*` write tool, and every later document can use it.
- **Order matters.** Experiences, education, links and facts keep the owner's order; a document reorders by relevance, the profile doesn't.

## Seed: the master-resume import (R2-14)

A one-off Phase 3 task, like Study's ST-10: a tested parser reads `Master Resume — source of truth.md` into the records above (Contact → person and links; Education; each experience heading → an experience with its bullets as facts; Skills → declared skills through the registry; "Facts to add once true" → not imported, reported). `[UNVERIFIED]` bullets import as **not verified**. The owner runs the SQL once; `_Misc` profile files are deleted from `study-materials` only after the import is checked in the app (A-6). career-os's `context/master-resume.md` is compared first: anything only it has is listed for the owner to merge.

## Operations

Each is one service, called by `/api/career` and by the MCP tool. Writes are idempotent and audited (`02-integration`).

| Operation | App | MCP tool |
|---|---|---|
| Read the profile | Profile tab | `career_get_profile` (all records, compact; facts with verified and skill IDs) |
| Edit the person, links | Profile → edit sheets | `career_update_person`, `career_set_links` |
| Add / edit / reorder / remove an experience or education | Profile → sheets | `career_save_experience`, `career_save_education`, `career_remove_item` |
| Add / edit a fact, verify it | Experience sheet | `career_save_fact` (`verified` only by the owner in the app, or by Claude after the owner confirms in the chat) |
| Declare / update / remove a skill | Skills tab | `career_declare_skill`, `career_remove_skill` |
| Photo | Profile → photo | App only: `PUT /api/career/photo` with a session (no tool takes a file) |

## Screens

- **Profile** (`/career/profile`): photo with initials fallback (`ImageTile`), person, links, then experiences with their facts (unverified ones badged), education, languages. Edit through sheets, as Study's topic sheet. The bundle's "Profile copy panel" screens (`22`) build on it.
- **Skills** (`/career/skills`): declared skills grouped by level, each with its readiness badge (`verified` when Study proved it, else `declared`), and "Verified in Study, not declared" suggestions to declare (A-8).
- States per `00-platform`.

## Invariants (merged into `99-data-model.md`)

K-1 to K-8 in `99-data-model.md` § Career Lab: one person row, link kinds and URLs, photo key and type, date formats and order, fact length and verified as 0/1, one declaration per skill, levels, no hard delete of facts a job's selection still references.

## Decisions

Approved by the owner on 2026-10-19 as proposed, **flagged to refine later** (CA-00: job filters, refusal rules, thresholds):

1. **Facts are the unit documents select**, each with a `verified` flag; an experience's summary is never used as a claim on its own.
2. **Unverified facts are excluded** from documents until confirmed, and listed in the brief.
3. **Declared skill levels** are `familiar`, `working`, `strong` (no 1–10 scale).
4. **A-8 is an offer**: a skill verified in Study is suggested for the profile, never added silently.
5. **The photo** is JPEG/PNG/WebP up to 2 MB, one at a time, uploaded only in the app.
6. **The master-resume import** follows ST-10's shape (parser + SQL the owner runs), comparing career-os's copy first.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
