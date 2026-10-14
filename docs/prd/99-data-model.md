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
  last_exported_at?                      -- last full export (backup); null = never
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

Every column a CHECK references is `NOT NULL`, so a NULL can't slip past the check. Two checks prove C-1 to C-8 and every NULL case, and their probe lists must stay in sync: `packages/api/test/invariants.test.ts` (`pnpm test`) attempts each write through the D1 binding, and `scripts/verify-triggers.sh` (`pnpm verify:triggers`) runs the same probes after `wrangler d1 migrations apply` on a fresh local D1.

## Notes for the build

- **Schema source:** Drizzle `sqliteTable` definitions with `check()` for C-2 to C-6; `drizzle-kit generate` produces `0000_init`, which is never hand-edited. Triggers go in their own `--custom` migration.
- **Skill lookup** is by `name` or any alias, case-insensitively, ignoring soft-deleted rows; C-8 makes it return at most one live skill. "Deduplicate" means look up before insert. A soft-deleted skill's name stays taken (C-1): restore it instead of re-creating it.
- **`mcp_call` records writes only**, and records failed ones too (`ok = 0`); reads are not audited.
- **`last_exported_at`** is written by the export flow (90-services) and read by the home screen to nudge a backup.

## Decisions

Settled by the owner on 2026-10-14.

1. **`mutation.scope` stays.** The same key with a different scope is rejected with 422, never replayed. Implemented by the idempotency middleware (F-12).
2. **Aliases are unique among live skills.** Enforced by C-8.
3. **Skills are never hard-deleted.** C-7 rejects every delete, so core triggers never name a lab table.
4. **Session revocation** (logout everywhere, passphrase change) is decided in `01-identity-and-access.md`. If it needs `user.session_version`, that arrives in its own migration.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
