# Data model

SQLite / D1 dialect. Times are UTC ISO-8601 text unless noted. Booleans are `INTEGER` 0/1 (D1 has no boolean). IDs are text. Grades are integer tenths, 0–100; no floats anywhere. Derived state (readiness, summaries, averages, statuses) is computed at read time and never stored.

Core tables are unprefixed. Each lab adds a section below with its own tables (`learn_*`, `career_*`) and invariants.

## Core

```sql
-- One row in practice. Lab tables carry user_id where they need it, so a second
-- person is a migration, not a rewrite. The KDF runs in the browser: the server
-- stores the derived key's hash, never the passphrase.
user(
  id,
  auth_key_hash,
  kdf_salt,
  kdf_iterations,                        -- integer; the value lives in packages/shared
  timezone,                              -- IANA name; resolves the owner's local day
  created_at,
  last_exported_at?,                     -- last full export (backup); null = never
  session_version                        -- integer >= 0, default 0; JWTs carry it as `sv` (01-identity)
)

-- Idempotency store shared by /api routes and MCP write tools. A response is
-- stored only when the request succeeded. Pruned on a window set in 90-services.
mutation(
  key,                                   -- PK: the Idempotency-Key / idempotencyKey value
  scope,                                 -- route ("POST /api/...") or MCP tool name
  response_json,
  created_at
)

-- Login rate limit: 10 attempts per 15-minute window per hashed IP. Shared by
-- the app login and the OAuth sign-in page.
auth_attempt(
  ip_hash,
  window_start,                          -- integer, epoch seconds
  count,                                 -- integer >= 1
  PRIMARY KEY(ip_hash, window_start)
)

-- The shared entity: one row per learnable skill. Study topics, declared
-- profile skills and job requirements all reference it.
skill(
  id,
  name,                                  -- canonical ("PostgreSQL"), unique ignoring case
  aliases_json,                          -- JSON array of strings ("Postgres"); default '[]'
  created_at,
  deleted_at?                            -- the only way to remove a skill (C-7)
)

-- Audit of every MCP write, so the owner can see what Claude changed.
-- Pruned after 90 days.
mcp_call(
  id,
  tool,                                  -- core_* | study_* | career_*
  client_name,                           -- OAuth client that made the call
  ok,                                    -- 0/1
  created_at
)

-- GitHub metadata by path (study-materials), with its ETag, so the next read
-- sends If-None-Match and takes a free 304 (02-integration, F-17). A copy of
-- GitHub's answer, replaced whenever it sends a new one. No invariants.
github_cache(
  path,                                  -- PK: path in the repository
  etag,
  body_json,                             -- the entry or folder listing the app uses
  fetched_at
)
```

Every column above without `?` is `NOT NULL`.

## Core invariants

| # | Invariant | Mechanism | Lands in |
|---|---|---|---|
| C-1 | `skill.name` is unique ignoring case | Unique index `skill_name_nocase` on `name COLLATE NOCASE` (Drizzle has no column collation); lookups must say `COLLATE NOCASE` to use it | `0000_init` (F-04) |
| C-2 | `skill.name` is never empty or blank | `CHECK (length(trim(name)) > 0)` | `0000_init` (F-04) |
| C-3 | `skill.aliases_json` is a JSON array | `CHECK (json_valid(aliases_json) AND json_type(aliases_json) = 'array')` | `0000_init` (F-04) |
| C-4 | `mcp_call.tool` matches `^(core\|study\|career)_[a-z_]+$` | `CHECK` with `GLOB` (D1 has no `REGEXP`): one of `core_?*`, `study_?*`, `career_?*`, and `NOT GLOB '*[^a-z_]*'` | `0000_init` (F-04) |
| C-5 | `mcp_call.ok` is 0 or 1 | `CHECK (ok IN (0, 1))` | `0000_init` (F-04) |
| C-6 | `auth_attempt.count` is at least 1 | `CHECK (count >= 1)` | `0000_init` (F-04) |
| C-7 | A `skill` is never hard-deleted, so no lab row can lose its skill. Removal is `deleted_at` | `BEFORE DELETE` trigger `skill_no_hard_delete` rejects every delete. Lab tables also get FKs to `skill` | `0001_triggers` (F-05) |
| C-8 | Among live skills, no alias equals another skill's name or alias, and no name equals another skill's alias (ignoring case). Restoring a soft-deleted skill is checked again | `BEFORE INSERT` and `BEFORE UPDATE OF name, aliases_json, deleted_at` triggers using `json_each` | `0001_triggers` (F-05) |
| C-9 | `user.session_version` is an integer >= 0 | `BEFORE INSERT` and `BEFORE UPDATE OF session_version` triggers (`typeof` check, so text can't slip past `>= 0`) | `0003_session_version_trigger` (F-08a) |
| C-10 | ~~`upload.bytes` is an integer from 1 to `UPLOAD_MAX_BYTES` (10 MB)~~ Retired | `CHECK (typeof(bytes) = 'integer' AND bytes BETWEEN 1 AND 10485760)`, the cap from `packages/shared` | `0005_upload` (F-18); dropped by `0007_drop_upload` (TD-01) |
| C-11 | ~~`upload.kind` is one of `UPLOAD_KINDS`~~ Retired | `CHECK (kind IN (…))`, built from the shared list | `0005_upload` (F-18); dropped by `0007_drop_upload` (TD-01) |
| C-12 | ~~`upload.content_type` is one of `UPLOAD_CONTENT_TYPES` (PDF, Word)~~ Retired | `CHECK (content_type IN (…))`, built from the shared list | `0005_upload` (F-18); dropped by `0007_drop_upload` (TD-01) |
| C-13 | ~~`upload.used_at`, once set, never changes (a used upload's file can't be overwritten)~~ Retired | `BEFORE UPDATE OF used_at` trigger `upload_used_at_once` | `0006_upload_triggers` (F-18); dropped by `0007_drop_upload` (TD-01) |

Every column a CHECK references is `NOT NULL`, so a NULL can't slip past the check. Two checks prove C-1 to C-9 and every NULL case (C-10 to C-13 were retired with the `upload` table by TD-01; their IDs are never reused), and their probe lists must stay in sync: `packages/api/test/invariants.test.ts` (`pnpm test`) attempts each write through the D1 binding, and `scripts/verify-triggers.sh` (`pnpm verify:triggers`) runs the same probes after `wrangler d1 migrations apply` on a fresh local D1.

## Notes for the build

- **Schema source:** Drizzle `sqliteTable` definitions with `check()` for C-2 to C-6; `drizzle-kit generate` produces `0000_init`, which is never hand-edited. Triggers go in their own `--custom` migration.
- **Never add `check()` to an existing table.** drizzle-kit then rebuilds the table, and its copy step selects the new column by its quoted name, which SQLite reads as a text literal: every existing row gets the column's *name* as its value. Add the column plain (drizzle emits `ALTER TABLE … ADD`) and enforce the rule with a trigger, as C-9 does. Read every generated migration that contains `__new_`.
- **Skill lookup** is by `name` or any alias, case-insensitively, ignoring soft-deleted rows; C-8 makes it return at most one live skill. "Deduplicate" means look up before insert. A soft-deleted skill's name stays taken (C-1): restore it instead of re-creating it.
- **`mcp_call` records writes only**, and records failed ones too (`ok = 0`); reads are not audited.
- **`last_exported_at`** is written by the export flow (90-services) and read by the home screen to nudge a backup.

## Decisions

Settled by the owner on 2026-10-14.

1. **`mutation.scope` stays.** The same key with a different scope is rejected with 422, never replayed. Implemented by the idempotency middleware (F-12, `packages/api/src/core/idempotency.ts`); an in-flight claim is `response_json = ''`.
2. **Aliases are unique among live skills.** Enforced by C-8.
3. **Skills are never hard-deleted.** C-7 rejects every delete, so core triggers never name a lab table.
4. **Session revocation** uses `user.session_version` (C-9): every session JWT carries it, and bumping it ends every session (`01-identity-and-access.md`). Added by `0002_session_version` in F-08a.

## Study Lab

_From `10-study-backlog.md` (decisions settled 2026-10-19), `11-study-courses.md` and `12-study-exams.md`. `13-study-roadmap.md` adds no table._

```sql
-- A backlog area. Seeded with the seven of 10-study-backlog; never deleted
-- (S-4), prefix fixed (S-4). next_seq is the next topic number, claimed in the
-- same batch as the topic insert.
learn_area(
  id,
  prefix,                                -- two uppercase letters, unique (S-1)
  name,                                  -- unique ignoring case, never blank (S-2)
  position,                              -- integer; display order
  next_seq,                              -- integer >= 1, default 1 (S-3)
  created_at
)

-- One topic per skill (S-6). Never hard-deleted (S-9): removal is deleted_at,
-- so code is never reused (S-5). Grade and Finished are derived from learn_exam
-- (12), never stored here.
learn_topic(
  id,
  code,                                  -- "FE-01": area prefix + printf('%02d'), unique (S-5)
  area_id,                               -- FK learn_area; fixed on creation (S-9)
  skill_id,                              -- FK skill; unique (S-6)
  level,                                 -- unset | fast_track | essential | specialized (S-7)
  priority,                              -- integer 1..3, default 2 (S-7)
  status,                                -- not_started | in_progress | done (S-7)
  note,                                  -- default ''; at most 120 characters (S-8)
  started_on?,                           -- owner-local date (YYYY-MM-DD) it first went in_progress
  created_at,
  updated_at,
  deleted_at?
)

-- A course file in study-materials, recorded by study_record_course after the
-- push (11). Upserted by path. Lesson count, minutes and title are read from
-- the file, never stored.
learn_course(
  id,
  topic_id,                              -- FK learn_topic
  level,                                 -- fast_track | essential | specialized (S-10)
  module,                                -- integer 1..4; 1 unless specialized (S-11)
  path,                                  -- "Study Lab/<area>/<topic>/<topic>__<level>.md", unique (S-12)
  recorded_at
)

-- One final-exam attempt (12). attempt counts per topic and level, like the
-- file names. grade and graded_at are set together; a correction changes grade only (S-16). A topic's
-- grade and Finished date come from its most recently graded row.
learn_exam(
  id,
  topic_id,                              -- FK learn_topic
  level,                                 -- fast_track | essential | specialized (S-17)
  attempt,                               -- integer >= 1; next in sequence (S-13, S-14)
  md_path,                               -- "…__exam-<n>.md", unique (S-15)
  pdf_path?,                             -- "…__exam-<n>.pdf", unique; null only for an app exam (S-15, S-22)
  source,                                -- claude | app (S-22); existing exams are claude
  created_at,
  grade?,                                -- integer tenths 0..100 (S-16)
  graded_at?,
  deleted_at?,                           -- deleted by the owner (ST-14): out of every read; null again on Undo (S-23, S-24, S-26)
  files_removed_at?                      -- its files removed from study-materials by the nightly run; then it stays deleted (S-25, S-26)
)

-- An exam made in the app (12 § Exams in the app, ST-13): what the model wrote,
-- the key it keeps from the owner until grading, the draft, the results.
learn_exam_paper(
  exam_id,                               -- PK, FK learn_exam; an app exam only (S-18)
  title,                                 -- not blank
  settings_json,                         -- the "Take the test" form (S-19: never changes)
  questions_json,                        -- questions only (S-19)
  key_json,                              -- never sent before grading (S-19)
  draft_json,                            -- the answers so far; frozen on submit (S-20)
  submitted_at?,                         -- set with results_json, once (S-21)
  results_json?,                         -- per question: accuracy, feedback (S-21)
  created_at,
  updated_at
)
```

Every column above without `?` is `NOT NULL`.

## Study Lab invariants

| # | Invariant | Mechanism | Lands in |
|---|---|---|---|
| S-1 | `learn_area.prefix` is two uppercase letters, unique | `CHECK (length(prefix) = 2 AND prefix NOT GLOB '*[^A-Z]*')`; unique index | `0008_study_tables` (ST-02) |
| S-2 | `learn_area.name` is never blank and unique ignoring case | `CHECK (length(trim(name)) > 0)`; unique index on `name COLLATE NOCASE` | `0008_study_tables` (ST-02) |
| S-3 | `learn_area.next_seq` is an integer >= 1 | `CHECK (typeof(next_seq) = 'integer' AND next_seq >= 1)` | `0008_study_tables` (ST-02) |
| S-4 | An area is never deleted and its prefix never changes | `BEFORE DELETE` and `BEFORE UPDATE OF prefix` triggers | `0009_study_triggers` (ST-02) |
| S-5 | `learn_topic.code` is unique, so an ID is never reused (rows are never deleted, S-9) | Unique index | `0008_study_tables` (ST-02) |
| S-6 | At most one topic per skill | Unique index on `skill_id`; FK to `skill` (C-7 keeps it) | `0008_study_tables` (ST-02) |
| S-7 | `level`, `priority` and `status` take only their listed values | `CHECK (level IN (…))`, `CHECK (typeof(priority) = 'integer' AND priority BETWEEN 1 AND 3)`, `CHECK (status IN (…))`, lists from `packages/shared` | `0008_study_tables` (ST-02) |
| S-8 | `learn_topic.note` is at most 120 characters | `CHECK (length(note) <= 120)`, the cap from `packages/shared` | `0008_study_tables` (ST-02) |
| S-9 | A topic is never hard-deleted, and its `area_id` and `code` never change | `BEFORE DELETE` and `BEFORE UPDATE OF area_id, code` triggers | `0009_study_triggers` (ST-02) |
| S-10 | `learn_course.level` is one of the three levels | `CHECK (level IN (…))`, list from `packages/shared` | `0008_study_tables` (ST-02) |
| S-11 | `learn_course.module` is an integer from 1 to 4, and 1 unless the level is Specialized | `CHECK (typeof(module) = 'integer' AND module BETWEEN 1 AND 4 AND (level = 'specialized' OR module = 1))` | `0008_study_tables` (ST-02) |
| S-12 | `learn_course.path` is unique, under `Study Lab/`, ending in `.md` | Unique index; `CHECK (path GLOB 'Study Lab/*.md')` | `0008_study_tables` (ST-02) |
| S-13 | `learn_exam.attempt` is an integer >= 1, unique per topic and level | `CHECK (typeof(attempt) = 'integer' AND attempt >= 1)`; unique index on `(topic_id, level, attempt)` | `0008_study_tables` (ST-02) |
| S-14 | A new attempt is one past the topic's highest at that level | `BEFORE INSERT` trigger comparing with `MAX(attempt)` | `0009_study_triggers` (ST-02) |
| S-15 | Exam paths are unique, under `Study Lab/`, ending in `.md` and `.pdf` (the `.pdf` rule moved to S-22's trigger in ST-13b, `pdf_path` being nullable) | Unique indexes; `CHECK (md_path GLOB 'Study Lab/*.md' AND pdf_path GLOB 'Study Lab/*.pdf')` | `0008_study_tables` (ST-02) |
| S-16 | An exam is created ungraded; `grade` (integer 0..100) and `graded_at` are set together; once graded, `grade` stays an integer 0..100 (it can be corrected, never cleared) and `graded_at` never changes | `BEFORE INSERT` and `BEFORE UPDATE OF grade, graded_at` triggers (`grade` is nullable, so a trigger, not a CHECK) | `0009_study_triggers` (ST-02) |
| S-17 | `learn_exam.level` is one of the three levels | `CHECK (level IN (…))` | `0008_study_tables` (ST-02) |
| S-18 | A paper belongs to an exam made in the app, one per exam | `BEFORE INSERT` trigger on `learn_exam_paper` (the exam's `source` is `app`); `exam_id` is the primary key | `0016_exam_source_and_paper_triggers` (ST-13b) |
| S-19 | A paper's questions, key, title and settings never change | `BEFORE UPDATE` trigger | `0016_exam_source_and_paper_triggers` (ST-13b) |
| S-20 | The draft freezes once the answers are submitted | `BEFORE UPDATE OF draft_json` trigger | `0016_exam_source_and_paper_triggers` (ST-13b) |
| S-21 | `submitted_at` and `results_json` are set together, once, and the results are JSON (a paper may be written submitted, as a restore does) | `BEFORE INSERT` and `BEFORE UPDATE` triggers; the other JSON columns `CHECK (json_valid(…))` | `0015_exam_source_and_paper`, `0016_…_triggers` (ST-13b) |
| S-22 | `learn_exam.source` is `claude` or `app` and never changes; only an `app` exam has no `.pdf`, and a `.pdf` is under `Study Lab/` | `CHECK (source IN (…))`; `BEFORE INSERT` and `BEFORE UPDATE OF pdf_path, source` triggers | `0015_exam_source_and_paper`, `0016_…_triggers` (ST-13b) |
| S-23 | An exam is created live: no `deleted_at` or `files_removed_at` on insert (a restore writes them afterwards: grade, then deleted, then files removed) | `BEFORE INSERT` trigger | `0019_exam_deleted_triggers` (ST-14a) |
| S-24 | A deleted exam isn't graded: its grade and `graded_at` don't change while `deleted_at` is set | `BEFORE UPDATE OF grade, graded_at` trigger | `0019_exam_deleted_triggers` (ST-14a) |
| S-25 | `files_removed_at` is set only on a deleted exam, and once | `BEFORE UPDATE OF files_removed_at` trigger | `0019_exam_deleted_triggers` (ST-14a) |
| S-26 | Once its files are removed, an exam stays deleted | `BEFORE UPDATE OF deleted_at` trigger | `0019_exam_deleted_triggers` (ST-14a) |

**Build notes.** The seven areas are seeded by `0010_study_areas` (fixed IDs `area-cs` … `area-se`). The tables live in `api/src/labs/study/schema.ts`, which `drizzle.config.ts` reads after core's. SQLite's INTEGER affinity turns numeric text (`'1'`, `'85'`) into integers, so only non-numeric text reaches the `typeof` checks. A topic's code is claimed in one `db.batch()`: `UPDATE learn_area SET next_seq = next_seq + 1 WHERE id = ?`, then `INSERT INTO learn_topic (…) SELECT …, prefix || '-' || printf('%02d', next_seq - 1), … FROM learn_area WHERE id = ?`, never read-then-write. All Study probes join `invariants.test.ts` and `verify-triggers.sh`.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*

## Career Lab

_From `20`–`24` (decisions approved 2026-10-19, flagged to refine in CA-00)._

```sql
-- The owner's person record: exactly one row (K-1). Contact details live here.
career_person(
  id,                                    -- always 'person' (K-1)
  full_name, headline, location, timezone, email, phone,
  summary,                               -- default ''; at most 600 characters
  languages_json,                        -- JSON array of { name, level }; default '[]'
  photo_key?, photo_type?,               -- set together: profile/photo.<ext>, image/jpeg|png|webp (K-3)
  updated_at
)

career_link(
  id, kind,                              -- linkedin | github | portfolio | scholar | other (K-2)
  label, url,                            -- url starts with https:// (K-2)
  position, created_at
)

career_education(
  id, institution, degree, field,
  start_on, end_on?,                     -- YYYY or YYYY-MM; no end = in progress (K-4)
  notes, position, created_at, deleted_at?
)

career_experience(
  id, organization, title,
  kind,                                  -- job | contract | research | project
  start_on, end_on?,                     -- YYYY or YYYY-MM; no end = current (K-4)
  location, summary, position, created_at, deleted_at?
)

-- One claim a document can use. Never hard-deleted (K-8): a job's selection may cite it.
career_fact(
  id,
  experience_id?, education_id?,         -- at most one of them
  text,                                  -- 1..300 characters (K-5)
  verified,                              -- 0/1 (K-5): 0 = excluded from documents
  position, created_at, updated_at, deleted_at?
)
career_fact_skill(fact_id, skill_id)     -- PK both; skill FK (C-7 keeps it)

-- What the owner claims (readiness Declared). One per skill (K-6).
career_declared_skill(
  skill_id,                              -- PK, FK skill
  level,                                 -- familiar | working | strong (K-7)
  years?,                                -- integer >= 0
  note, created_at, updated_at
)

-- A tracked job. Never hard-deleted (K-14). Readiness is derived, never stored.
career_job(
  id, company, role, seniority, language, -- language: the posting's (documents match it)
  work_shape,                            -- short text: contract/employment, hours, remote
  source_url?, posting,                  -- the pasted text (at most 20,000 characters)
  fit_total?, fit_constraints?, fit_skills?, fit_growth?, fit_pay?, fit_signal?,  -- K-10
  decision?,                             -- apply | maybe | skip (K-10)
  fit_notes,                             -- gaps to expect, questions to ask, red flags
  created_at, updated_at, deleted_at?
)

career_requirement(
  id, job_id,                            -- FK career_job
  text,                                  -- the posting's wording, at most 120 characters
  type,                                  -- required | nice | not_mapped (K-9)
  skill_id?,                             -- FK skill; null iff not_mapped (K-9, K-13)
  position
)

-- The application's history; its current status is the latest row (derived).
career_job_event(
  id, job_id, status,                    -- evaluated | applied | interviewing | offer | rejected | withdrawn | closed_silent (K-11, K-12)
  at, note                               -- note at most 500 characters
)

-- 22: what a job's documents were made from, and what its application copies (A-7).
career_job_item(job_id, item_kind, item_id, variant, position)  -- item_kind: fact | experience | education | skill (K-15)
career_job_kit(
  job_id,                                -- PK, FK career_job
  intro,                                 -- default ''; at most 1,500 characters (K-17)
  salary_min?, salary_max?,              -- integers, whole currency units (K-16)
  salary_currency?, salary_period?,      -- ISO code; hour | month | year (K-16)
  ats_score?, ats_scored_at?,            -- the last resume's ATS check, whole percent 0..100, set together (K-29, CA-17)
  ats_missing_json,                      -- default '[]': the keywords it missed, a JSON array of strings (K-30)
  updated_at
)
career_form_answer(id, job_id, question, answer, position)       -- answer at most 2,000 characters (K-17)
career_standard_answer(id, label, value, position)               -- label unique (K-18), value at most 300 (K-19)

-- 23: the search criteria (one row) and the openings the routine saves.
career_search_criteria(
  id,                                    -- always 'criteria' (K-20)
  queries_json, lanes_json, shapes_json, auto_reject_json, sources_json,  -- JSON arrays
  max_hours,                             -- integer >= 0 (K-21)
  timezone_note,
  rate_floor?, rate_currency?, rate_period?,  -- set together (K-21)
  max_age_days,                          -- integer >= 1 (K-21)
  updated_at
)
career_opening(
  id, url,                               -- unique (K-22)
  company, role, lane, posting, posted_on?, rate_text, why,
  status,                                -- new | kept | dismissed | tracked (K-22)
  job_id?,                               -- set exactly when tracked (K-23)
  created_at, updated_at
)

-- 24: stories, answers and the drill log.
career_story(id, title, situation, task, action, result, experience_id?, created_at, updated_at)  -- each part at most 600 (K-24)
career_story_fact(story_id, fact_id)     -- K-25
career_story_skill(story_id, skill_id)
career_answer(
  id, question, answer,                  -- question at most 200, answer at most 3,000
  drive_file_id?,                        -- Drive's file ID format (K-26)
  story_id?, job_id?,                    -- exist (K-27)
  created_at, updated_at
)
career_drill(id, at, mode, topic, weakest_json, fix)  -- mode: behavioral | technical | negotiation (K-28)
```

Every column above without `?` is `NOT NULL`.

## Career Lab invariants

| # | Invariant | Mechanism |
|---|---|---|
| K-1 | There is at most one person row | `CHECK (id = 'person')` with the PK |
| K-2 | A link's kind is one of the list; its URL starts with `https://` | `CHECK` |
| K-3 | The photo's key and type are set together, the type one of JPEG, PNG, WebP and the key that type's `profile/photo.<ext>` | Triggers (nullable columns) |
| K-4 | Education and experience dates are `YYYY` or `YYYY-MM`, and an end is not before the start | `CHECK` on `start_on`; triggers for `end_on` |
| K-5 | A fact's text is 1..300 characters; `verified` is 0 or 1; at most one of experience and education | `CHECK` (the parents by trigger) |
| K-6 | One declaration per skill | PK on `skill_id` |
| K-7 | A declared level is one of the list; `years`, when set, an integer ≥ 0 | `CHECK`; trigger for `years` |
| K-8 | A fact is never hard-deleted | `BEFORE DELETE` trigger |
| K-9 | A requirement's type is one of the list, and its skill is null exactly when it's not mapped | `CHECK (type IN (…))`; trigger for the pairing |
| K-10 | Fit scores are all set or all unset; set, they are integers within their maxima (25, 25, 20, 15, 15), the total is their sum and the decision one of the list | Triggers (nullable until scored). The 75/55 thresholds stay in `shared/career` `scoreFit`, so CA-00 can change them without a migration |
| K-11 | An event's status is one of the list | `CHECK` |
| K-12 | Events of a job are never edited or deleted (the history is append-only) | `BEFORE UPDATE` and `BEFORE DELETE` triggers |
| K-13 | A requirement's skill exists in the registry | FK to `skill` |
| K-14 | A job is never hard-deleted | `BEFORE DELETE` trigger |
| K-15 | A selection item's kind is one of the list and its item exists and isn't removed (a fact removed later stays cited, K-8) | `CHECK`; trigger for existence |
| K-16 | A salary range's minimum and maximum are integers with minimum ≤ maximum, set with a currency and a period from the list | Triggers (nullable) |
| K-17 | Intro and form-answer lengths | `CHECK` |
| K-18 | Standard answer labels are unique ignoring case | Unique index `COLLATE NOCASE` |
| K-19 | A standard answer's value is at most 300 characters | `CHECK` |
| K-20 | There is at most one criteria row | `CHECK (id = 'criteria')` |
| K-21 | `max_hours` ≥ 0 and `max_age_days` ≥ 1 integers; the rate floor, currency and period set together | `CHECK`; trigger for the floor |
| K-22 | An opening's URL is unique and `https://`, its status one of the list | Unique index; `CHECK` |
| K-23 | An opening has a job exactly when it's tracked | Trigger |
| K-24 | Each STAR part is at most 600 characters | `CHECK` |
| K-25 | A story's facts exist | FK |
| K-26 | A Drive file ID is 10–100 characters of letters, digits, `-` and `_` | Trigger (nullable) |
| K-27 | An answer's story and job exist | FK |
| K-28 | A drill's mode is one of the list | `CHECK` |
| K-29 | A kit's ATS score and its time are set together, and the score is a whole 0–100 | `BEFORE INSERT` and `BEFORE UPDATE` triggers (not a `CHECK`: one on the existing table would rebuild it, and the score is nullable) | `0021_job_kit_ats_triggers` (CA-17a) |
| K-30 | A kit's missing ATS keywords are a JSON array of strings | `BEFORE INSERT` and `BEFORE UPDATE` triggers | `0021_job_kit_ats_triggers` (CA-17a) |

**Build notes.** The master-resume import (`20`) follows ST-10: a tested parser, guarded SQL the owner runs once. The Study contract's `ensureTopics` carries the area Claude chooses (ST-03).
