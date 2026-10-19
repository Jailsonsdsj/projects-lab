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
  pdf_path,                              -- "…__exam-<n>.pdf", unique (S-15)
  created_at,
  grade?,                                -- integer tenths 0..100 (S-16)
  graded_at?
)
```

Every column above without `?` is `NOT NULL`.

## Study Lab invariants

| # | Invariant | Mechanism | Lands in |
|---|---|---|---|
| S-1 | `learn_area.prefix` is two uppercase letters, unique | `CHECK (length(prefix) = 2 AND prefix NOT GLOB '*[^A-Z]*')`; unique index | Study schema (Phase 2) |
| S-2 | `learn_area.name` is never blank and unique ignoring case | `CHECK (length(trim(name)) > 0)`; unique index on `name COLLATE NOCASE` | Study schema |
| S-3 | `learn_area.next_seq` is an integer >= 1 | `CHECK (typeof(next_seq) = 'integer' AND next_seq >= 1)` | Study schema |
| S-4 | An area is never deleted and its prefix never changes | `BEFORE DELETE` and `BEFORE UPDATE OF prefix` triggers | Study triggers |
| S-5 | `learn_topic.code` is unique, so an ID is never reused (rows are never deleted, S-9) | Unique index | Study schema |
| S-6 | At most one topic per skill | Unique index on `skill_id`; FK to `skill` (C-7 keeps it) | Study schema |
| S-7 | `level`, `priority` and `status` take only their listed values | `CHECK (level IN (…))`, `CHECK (typeof(priority) = 'integer' AND priority BETWEEN 1 AND 3)`, `CHECK (status IN (…))`, lists from `packages/shared` | Study schema |
| S-8 | `learn_topic.note` is at most 120 characters | `CHECK (length(note) <= 120)`, the cap from `packages/shared` | Study schema |
| S-9 | A topic is never hard-deleted, and its `area_id` and `code` never change | `BEFORE DELETE` and `BEFORE UPDATE OF area_id, code` triggers | Study triggers |
| S-10 | `learn_course.level` is one of the three levels | `CHECK (level IN (…))`, list from `packages/shared` | Study schema |
| S-11 | `learn_course.module` is an integer from 1 to 4, and 1 unless the level is Specialized | `CHECK (typeof(module) = 'integer' AND module BETWEEN 1 AND 4 AND (level = 'specialized' OR module = 1))` | Study schema |
| S-12 | `learn_course.path` is unique, under `Study Lab/`, ending in `.md` | Unique index; `CHECK (path GLOB 'Study Lab/*.md')` | Study schema |
| S-13 | `learn_exam.attempt` is an integer >= 1, unique per topic and level | `CHECK (typeof(attempt) = 'integer' AND attempt >= 1)`; unique index on `(topic_id, level, attempt)` | Study schema |
| S-14 | A new attempt is one past the topic's highest at that level | `BEFORE INSERT` trigger comparing with `MAX(attempt)` | Study triggers |
| S-15 | Exam paths are unique, under `Study Lab/`, ending in `.md` and `.pdf` | Unique indexes; `CHECK (md_path GLOB 'Study Lab/*.md' AND pdf_path GLOB 'Study Lab/*.pdf')` | Study schema |
| S-16 | An exam is created ungraded; `grade` (integer 0..100) and `graded_at` are set together; once graded, `grade` stays an integer 0..100 (it can be corrected, never cleared) and `graded_at` never changes | `BEFORE INSERT` and `BEFORE UPDATE OF grade, graded_at` triggers (`grade` is nullable, so a trigger, not a CHECK) | Study triggers |
| S-17 | `learn_exam.level` is one of the three levels | `CHECK (level IN (…))` | Study schema |

**Build notes.** A topic's code is claimed in one `db.batch()`: `UPDATE learn_area SET next_seq = next_seq + 1 WHERE id = ?`, then `INSERT INTO learn_topic (…) SELECT …, prefix || '-' || printf('%02d', next_seq - 1), … FROM learn_area WHERE id = ?`, never read-then-write. All Study probes join `invariants.test.ts` and `verify-triggers.sh`.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
