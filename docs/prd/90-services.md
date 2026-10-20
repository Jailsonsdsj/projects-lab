# Services

Where Projects Lab runs, what it keeps and for how long, how the owner backs it up and restores it, and what leaves the app. Architecture is `docs/architecture.md`; the data model `99-data-model.md`.

## Hosting

| Piece | Where | Notes |
|---|---|---|
| App and API | One Cloudflare Worker (`projects-lab`) with static assets | `run_worker_first`: `/api/*`, `/mcp`, `/oauth/*`, `/.well-known/*` |
| Data | D1 `projects-lab` | Every row the owner has; migrations in `packages/api/migrations` |
| Files | R2 `projects-lab-images` | The profile photo only (R3-1: documents are never stored; video never goes to R2) |
| OAuth | KV `OAUTH_KV` | Claude's grants and tokens, hashed by `workers-oauth-provider` |
| Schedule | One Cron Trigger, `0 3 * * *` | The daily prune (below) |

## Retention (the daily prune, F-19)

Operational rows only; the owner's data is never pruned. Windows in `shared/core/retention.ts`:

| Table | Kept | Why |
|---|---|---|
| `mutation` | 7 days | Idempotency replays; an in-flight claim from a dead Worker clears with it |
| `auth_attempt` | 7 days | Login rate-limit windows (15 minutes each) |
| `mcp_call` | 90 days | The audit of what Claude changed, shown in Connections |

## Backup and restore (H-02)

**The owner's copy: Settings → Backup → Download backup.** One file, `projects-lab-backup-<date>.json`:

- **What's in it:** every row of every table that holds the owner's data (`BACKUP_TABLES` in `shared/core/backup.ts`, parents before children): the user row, the skill registry, the MCP audit, every Study and Career table; and every file in R2 (the photo), as base64.
- **What isn't, on purpose** (`BACKUP_EXCLUDED`): `mutation`, `auth_attempt`, `github_cache`, rebuilt by use; OAuth grants (KV), so Claude reconnects after a restore. A test fails if a new table is in neither list.
- **It's sensitive:** it holds the passphrase's hash and KDF salt (so a restored app takes the same passphrase), contact details and everything career-related. Keep it somewhere private; Settings says so.
- **How it's made:** `GET /api/backup/data` (session only; an OAuth token can't reach `/api/backup`, and no tool exports) sends the rows, the migrations applied, and the list of files; the browser fetches each file (`GET /api/backup/files/<key>`) and saves the whole. The Worker does no file work (10 ms CPU).
- **When:** `POST /api/backup/done` records `user.last_exported_at` on the server after the browser saved the file. It's never kept in the browser. Home reminds when there's never been a backup or the last is older than 30 days (`BACKUP_NUDGE_DAYS`), linking to Settings.

**Restore: a script, the owner's step against production.** `pnpm tsx scripts/restore-backup.ts <backup.json>` checks the backup's migrations against the repo's (a backup from newer code is refused; newer migrations here are applied first), writes `scripts/out/restore/restore.sql` and each file, and prints the commands: `wrangler d1 execute … --file` and `wrangler r2 object put …`, with `--local` to check on a throwaway local D1 and `--remote` for production (the owner's). The target is a database with the same migrations and nothing of the owner's yet (a fresh environment); the seeded Study areas are updated in place. The triggers stay on, so the SQL loads in an order they accept: tables parents first, exams ungraded in attempt order then graded (S-14, S-16), rows removed later loaded live and marked removed last (a saved selection may cite them, K-15). Only inserts and updates.

**Proof:** the API's backup test seeds every table through the real routes, exports, restores into an empty second database and bucket with the same migrations, and compares every table row for row and the photo byte for byte.

**The first fallback for a recent mistake:** D1 Time Travel, Cloudflare's point-in-time restore of the whole database (`wrangler d1 time-travel restore`, the owner's), within its retention window. The backup file is the copy the owner holds, outside Cloudflare.

## What leaves the app

| To | What | How |
|---|---|---|
| Claude (any surface) | What the `core_*`, `study_*` and `career_*` tools return | MCP over OAuth, audited per write |
| GitHub | Nothing written; reads `study-materials` by blob SHA | A read-only token (Contents read) |
| Google Drive | Nothing; the app embeds Drive's own player for a file ID the owner pasted | A sandboxed `<iframe>` |
| Gmail | The weekly job digest, sent by the owner's Claude routine through its Gmail connector, not by the app | `docs/routines/job-search.md` |
| The owner's device | The backup file | Settings → Backup |

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
