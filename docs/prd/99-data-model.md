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

-- One file Claude may upload through a signed URL (02-integration "Uploads",
-- F-18). The row exists from core_create_upload; used_at is set once, by the
-- accepted PUT. Lists and the cap come from packages/shared.
-- Unused after F-23 (R3-1: documents are never stored); TD-01 drops it.
upload(
  id,
  kind,                                  -- resume | cover_letter (C-11)
  filename,                              -- letters, digits, . - _ only
  content_type,                          -- PDF or Word (C-12)
  bytes,                                 -- integer 1..10 MB (C-10)
  r2_key,                                -- uploads/<id>/<filename>
  created_at,
  expires_at,                            -- 10 minutes after created_at
  used_at?                               -- set once, never changed (C-13)
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
| C-10 | `upload.bytes` is an integer from 1 to `UPLOAD_MAX_BYTES` (10 MB) | `CHECK (typeof(bytes) = 'integer' AND bytes BETWEEN 1 AND 10485760)`, the cap from `packages/shared` | `0005_upload` (F-18) |
| C-11 | `upload.kind` is one of `UPLOAD_KINDS` | `CHECK (kind IN (…))`, built from the shared list | `0005_upload` (F-18) |
| C-12 | `upload.content_type` is one of `UPLOAD_CONTENT_TYPES` (PDF, Word) | `CHECK (content_type IN (…))`, built from the shared list | `0005_upload` (F-18) |
| C-13 | `upload.used_at`, once set, never changes (a used upload's file can't be overwritten) | `BEFORE UPDATE OF used_at` trigger `upload_used_at_once` | `0006_upload_triggers` (F-18) |

Every column a CHECK references is `NOT NULL`, so a NULL can't slip past the check. Two checks prove C-1 to C-13 and every NULL case, and their probe lists must stay in sync: `packages/api/test/invariants.test.ts` (`pnpm test`) attempts each write through the D1 binding, and `scripts/verify-triggers.sh` (`pnpm verify:triggers`) runs the same probes after `wrangler d1 migrations apply` on a fresh local D1.

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

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
