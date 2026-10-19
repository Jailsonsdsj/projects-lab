# Study backlog

The owner's study backlog: areas, topics, levels, priorities, statuses and grades. It replaces cs-learning-lab's `learning-backlog.md`. The `study-course-builder` skill (moving to `study-materials`, R2-1) reads and writes it through `study_*` tools instead of editing a file, and the owner edits it in the app. Source: cs-learning-lab `backlog-rules.md` and the skill's Workflow D. Courses are in `11`, exams and grades in `12`, the roadmap in `13`.

## Areas

Every topic sits in exactly one area. An area has a **name** and a **two-letter prefix** used in topic IDs. Seeded with the seven areas of today's backlog, in this order:

| Area | Prefix | Covers |
|---|---|---|
| CS Fundamentals | CS | Algorithms, data structures, complexity, operating systems, networking, compilers, discrete math |
| Frontend | FE | Frameworks, rendering strategies, browser APIs, CSS architecture, accessibility, frontend performance |
| Backend | BE | Server runtimes, APIs (REST, GraphQL, gRPC), auth, queues, background jobs, backend languages |
| Databases and Data | DB | SQL, NoSQL, modeling, indexing, transactions, ORMs, caching, data pipelines |
| DevOps and Cloud | DO | Git workflows, CI/CD, containers, orchestration, cloud providers, IaC, observability |
| Software Architecture | SA | Design patterns, system design, distributed systems, clean architecture, DDD |
| Security | SE | Web security, OWASP, cryptography basics, secrets management, threat modeling |

- **A new area** (AI and Machine Learning, Mobile, Testing and Quality…) is added when a topic fits none of these, with a prefix no area has. Don't force a topic into a poor fit; a framework that spans areas goes where its main learning value is (Next.js → Frontend).
- An area is **never deleted** and its **prefix never changes** (topic IDs carry it). Its name can be edited. An area with no topics still shows, with "No topics yet".

## Topics

| Field | Rule |
|---|---|
| **ID** | Area prefix + a sequence, two digits minimum: `FE-01`, `FE-02` … `FE-100`. Assigned on creation, **never renumbered or reused**, even after removal |
| **Skill** | Exactly one `skill` (the shared registry, architecture §5). The topic's name is the skill's canonical name. One topic per skill |
| **Area** | Fixed on creation, since the ID carries its prefix |
| **Level** | Fast track, Essential, Specialized, or unset ("—") until chosen. Changing the level keeps the same topic: a different level of the same skill is never a second row |
| **Priority** | P1 (next up), P2 (soon), P3 (later). Default P2 |
| **Status** | Not started, In progress, Done |
| **Grade** | The latest graded exam's grade (`12`), integer tenths, shown with one decimal. Derived at read time; "—" until an exam is graded |
| **Started** | The owner's local date (`user.timezone`) when the topic first went In progress: set by recording its first course (`11`) or by hand |
| **Finished** | The latest graded exam's date (`12`), derived. "—" until then |
| **Note** | One short line, at most 120 characters: a review suggestion, module progress ("m2 of 3") |

**Status** is stored and editable by hand ("mark X as in progress"). Recording a course moves a Not started topic to In progress; recording a grade moves it to Done (`12`). Marking Done by hand without an exam is allowed and leaves the grade "—", so the skill is not *verified* for Career (below).

**Removing** a topic is a soft delete: it leaves the backlog and its ID stays taken. Adding the same skill again **restores** it, with its ID, courses and exams, instead of making a second topic.

## Backlog view and summary

- **Grouped by area**, in area order. Inside an area: In progress, then Not started, then Done; then P1 → P3; then by ID.
- **Summary**, computed at read time: per area and in total, the count per status and the **average grade of Done topics that have one** (mean of tenths, rounded to a whole tenth, shown with one decimal). Every area appears, including empty ones.

## Operations

Each operation is one service function, called by the `/api/study` route and by the MCP tool (thin adapter). Writes take `Idempotency-Key` / `idempotencyKey` and are audited (`02-integration`).

| Operation | App | MCP tool | Notes |
|---|---|---|---|
| Read the backlog | Backlog tab | `study_list_backlog` `{ area?, status? }` | Compact rows: ID, skill, area, level, priority, status, grade, started, finished, note |
| Summary | Home card, Backlog header | `study_get_summary` | What `/backlog` reports, plus a suggested next topic: the first Not started P1, else P2 |
| Add topics | Add sheet | `study_add_topics` `{ topics: [{ skill, area, level?, priority?, note? }] }` | `skill` is a name or alias, found first (`core_find_skill` rules) and created only when none matches. An existing topic is returned, never duplicated; a removed one is restored. `/add` |
| Edit a topic | Topic sheet | `study_update_topic` `{ topicId, level?, priority?, status?, note? }` | "mark X as in progress", "change the level of Z" |
| Remove a topic | Topic sheet → confirm | `study_remove_topic` `{ topicId }` | Soft delete |
| Add an area | Backlog → Add area | `study_add_area` `{ name, prefix }` | Prefix: two letters, not taken |

`topicId` in tools is the display ID (`FE-01`). Errors follow `02-integration`: unknown topic or area → `not_found`; a taken prefix → `conflict`.

**The Study contract** (architecture §4), consumed by Career: `ensureTopics` is "Add topics" by `skillId` (gaps from a job posting land as Not started with the job named in the note); `skillStatus` reports **verified** for a topic Done with grade ≥ 70 (A-8).

## Screens

- **Backlog** (`/study`, first tab): `PageHeader` "Backlog"; a summary strip (in progress, not started, done, average grade); one `.group` per area with `ListRow`s showing ID, skill, level, a priority badge, a status badge and the grade; a status filter. Tap a row → **topic sheet**: edit level, priority, status and note; links to its course (`11`) and exams (`12`); Remove (danger confirm). **Add** opens a sheet: skill (with lookup), area, level, priority.
- **Home card** (`00-platform`): in progress, not started, average grade, and "Continue" for the In progress topic with the most recent course.
- States per `00-platform`: skeleton, empty ("No topics yet. Add one here, or ask Claude to `/add` it."), error with Retry, offline with the saved copy.

## Invariants (merged into `99-data-model.md`)

S-1 to S-9 in `99-data-model.md` § Study Lab: area prefix and name rules, per-area ID counter, topic ID never reused, one topic per skill, allowed levels, priorities and statuses, note length, area fixed on a topic, and no hard deletes of areas or topics.

## Decisions

Settled by the owner on 2026-10-19, as proposed in the draft:

1. **Topic ↔ skill:** every topic references exactly one `skill`, at most one topic per skill, and the topic's name is the skill's name.
2. **Topic IDs:** a per-area counter claimed in the same `db.batch()` as the insert; removal is a soft delete, so an ID never comes back.
3. **Status** is stored and editable by hand; a course or a grade moves it forward.
4. **Grade and Finished** are derived from the latest graded exam, so a retake needs no "previous 6.5" note: the attempts are the history (`12`).
5. **Areas:** seed the seven above; new ones by Claude or the app; never deleted; prefix fixed.
6. **Import:** a one-off Phase 2 task imports cs-learning-lab's `learning-backlog.md` (one topic today, `CS-01 Big-O notation`), keeping its IDs.
7. **Smaller choices:** area fixed per topic; re-adding restores; manual Done allowed without an exam; note capped at 120 characters.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
