# Projects Lab — Backlog

One task per Claude Code session: `/task <ID>`. A task reads **only** its Load files. After merging, rewrite its Done-when cell as ✅ plus what was found.

Sizes: S ≈ 20 min · M ≈ 45 min · L ≈ 90 min (split an L that runs past 2 h). **Human** = you do it by hand; an agent must not.

## Progress (counts merged to `main`)

| Phase | Done | Total | Status |
|---|---|---|---|
| 0 Foundation | 2 | 22 | In progress |
| Spikes | 0 | 3 | Blocked by F-20 |
| 1 Design system | 0 | 12 | Blocked by D-00 (Claude Design) |
| 2 Study Lab | — | — | Detailed after PRD `10`–`13` |
| 3 Career Lab | — | — | Detailed after PRD `20`–`24` and the spikes |
| Hardening | 0 | 5 | — |
| Go-Live | 0 | 5 | — |

_Post-launch and TD are tracked separately and excluded from the totals._

## Before F-01 (by hand, playbook §6)

Create the `projects-lab` repo and the `developer` branch · `npx wrangler d1 create projects-lab` (preview later, for G-03) · `npx wrangler r2 bucket create projects-lab-images` · `npx wrangler kv namespace create OAUTH_KV` · set the two Cloudflare GitHub secrets · create the fine-grained GitHub token (Contents: read, `study-materials` only) and keep it for F-17 · copy the agent scaffold (`CLAUDE.md`, `AGENTS.md` symlink, `.claude/`) · write down the D1 and KV IDs.

---

## Phase 0 — Foundation (`F-`)

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| F-01 | Workspace: pnpm workspaces `shared`/`api`/`web`, `tsconfig` build mode, Biome, `.nvmrc`, `engines`, `packageManager`, pnpm build-script allow-list, `.gitignore`, `.dev.vars.example`, root scripts, stub `src/index.ts` per package | M | Sonnet | `CLAUDE.md`, `docs/architecture.md` §4 | ✅ Passes on a clean export of the tree. pnpm 12 replaced `onlyBuiltDependencies` with `allowBuilds`; local pnpm must be ≥ 12 (Homebrew had 8.5.1). Untracked `.DS_Store` and `.wrangler/`. Lab boundary rules (`noRestrictedImports`) added here; `api/src/mcp/` is not restricted |
| F-02 | Worker + `/api/health` + `wrangler.jsonc`: D1 `DB`, R2 `FILES`, KV `OAUTH_KV`, assets with `run_worker_first` = `["/api/*","/mcp","/oauth/*","/.well-known/*"]`, observability, `preview` env; `pnpm types` | S | Sonnet | `docs/architecture.md` §3 | ✅ Dry-run passes. Local `wrangler dev`: `/` and SPA routes are served by assets with no Worker trace; `/api/*`, `/mcp`, `/oauth/*`, `/.well-known/*` reach Hono. Assets point at the `packages/web/static` placeholder until Vite lands (then `../web/dist`). R2 is `projects-lab-images` (arch §3 updated). `env.preview` has no bindings yet (G-03), so generated `Env` bindings are optional until then. Compat date 2026-10-13: Wrangler 4.150's workerd tops out there |
| F-03 | Dependency baseline: resolve every dependency `@latest`, TS on 5.x, report anything >1 minor behind | S | Haiku | `package.json` files | No version was typed from memory; report lists each package with its resolved version |
| F-04 | Core schema `0000_init` via `drizzle-kit generate`: `user` (incl. `last_exported_at`), `mutation`, `auth_attempt`, `skill`, `mcp_call` | M | Opus | `docs/prd/99-data-model.md` (core), `docs/architecture.md` §5 | Migration applies locally from scratch; every CHECK-referenced column is `NOT NULL`; the generated file is not hand-edited |
| F-05 | Trigger migration (`--custom --name triggers`) for the core invariants + `scripts/verify-triggers.sh` | M | Opus | `docs/prd/99-data-model.md` (core) | A duplicate skill name differing only in case is rejected; a referenced skill can't be hard-deleted; a bad `mcp_call.tool` is rejected; each NULL case is rejected; permitted writes succeed |
| F-06 | Trigger tests in `@cloudflare/vitest-pool-workers` | M | Sonnet | F-05 migration, `vitest.config.ts` | Each forbidden write is **attempted through the binding** and fails; removing one trigger makes its test fail |
| F-07 | Seed script: reset local D1 **and** R2 with sample data | S | Sonnet | `docs/prd/99-data-model.md` (core) | Running it twice leaves the same state; it refuses `--remote` |
| F-08 | Auth API: shared KDF constants and `generateSalt()` in `shared/core`; `/api/auth/salt`, `/login`, `/logout`; rate limit 10/15 min per hashed IP; deterministic owner query; config read outside `try` | L | Opus | `docs/prd/01-identity-and-access.md`, playbook §8 | Wrong key → 401; 11th attempt in a window → 429 **and** the window expires; no user → same timing path; unset `TOKEN_SIGNING_KEY` → named error, not 401; iteration count exists in one file only |
| F-09 | `pnpm provision` (tsx): hidden passphrase prompt, ≥12 chars, refuses if a user exists, `--verify <url>` | M | Opus | `docs/prd/01-identity-and-access.md` | Second run refuses without deleting; `--verify` logs in without writing; no provisioning route exists |
| F-10 | Login screen, logout, session-expiry message, 401 → clear token → `/login` | M | Sonnet | `docs/prd/01-identity-and-access.md`, `docs/design-system.md` | An expired session lands on `/login` with the expiry message; no screen shows a raw 401 |
| F-11 | Change passphrase (re-derives in the browser, rotates salt, invalidates sessions) | M | Opus | `docs/prd/01-identity-and-access.md` | Old passphrase is rejected afterwards; old JWTs are rejected; a wrong current passphrase changes nothing |
| F-12 | Helpers: per-route idempotency middleware (response stored only on success), `chunkedInsert`, conditional-insert helper | M | Opus | playbook §7–8 | A replay returns the stored response; a failed request stores nothing and re-executes; 21+ rows insert in one `batch()`; middleware is not mounted by wildcard |
| F-13 | Lab module boundary: lab registry (routes, tools, screens), `shared/contracts/study.ts` stub, Biome `noRestrictedImports` rules | M | Sonnet | `docs/architecture.md` §4 | An import from `core` into a lab, or lab→lab, **fails `pnpm lint`** (proved by a deliberately bad file that's then removed); a stub lab mounts at `/api/<lab>` |
| F-14 | OAuth: `workers-oauth-provider` wraps the Worker; `/oauth/authorize` reuses the passphrase login, then consent; shared rate limit | L | Opus | `docs/prd/01-identity-and-access.md`, `docs/prd/02-integration.md`, `docs/architecture.md` §6.2 | An OAuth token is **rejected on `/api/*`**; a session JWT is **rejected on `/mcp`**; a wrong passphrase on the sign-in page issues no code; KV holds no plaintext token |
| F-15 | MCP endpoint: stateless `createMcpHandler` at `/mcp`, per-lab tool registry, `core_whoami`, `core_find_skill`, `mcp_call` audit, `idempotencyKey` on writes | M | Opus | `docs/prd/02-integration.md`, `docs/architecture.md` §6.3 | MCP Inspector lists only registered tools; an unauthenticated call is refused; every write leaves one `mcp_call` row; a tool handler contains no SQL |
| F-16 | Connections screen: list grants (client, last use), Revoke | M | Sonnet | `docs/prd/01-identity-and-access.md` | After Revoke, that client's next MCP call is refused |
| F-17 | GitHub read client: `GITHUB_TOKEN` secret, metadata by path with ETag, blob by SHA, image proxy, `User-Agent`, named errors | M | Sonnet | `docs/prd/02-integration.md`, `docs/architecture.md` §7 | Content served by SHA carries `immutable`; a `304` path makes no body fetch; a bad token yields the named error, never an empty list; no write call to GitHub exists |
| F-18 | Signed uploads: `core_create_upload` + `PUT /api/uploads/<token>` to R2 with `UPLOAD_SIGNING_KEY`, 10-min TTL, size and type cap | M | Opus | `docs/architecture.md` §6.4 | An expired, reused, oversized or wrong-type upload is rejected and writes nothing to R2; no tool accepts file content as an argument |
| F-19 | Daily Cron Trigger pruning `mutation`, `auth_attempt` (>7 days) and `mcp_call` (>90 days) | S | Sonnet | `docs/prd/90-services.md` | Rows older than the windows are gone and newer ones remain, in a test that runs the scheduled handler |
| F-20 | `ci.yml` (playbook §9) + `deploy.yml` + first deploy **(Human)**: migrations remote, deploy, `wrangler secret put` × 3, health check, then merge | M | Sonnet | playbook §9 | PR CI uses no Cloudflare secret and no `--remote`; first `deploy.yml` run is green on a no-op deploy |
| F-21 | Linux-container CI reproduction script | S | Haiku | `.github/workflows/ci.yml` | It reproduces a deliberately broken fresh-clone build that passes on macOS |
| F-22 | Branch protection on `main` requiring `ci` **(Human)** | S | — | — | A red PR can't be merged |

## Spikes (`SP-`) — after F-20, before any lab work

Record each result in the Done-when cell; they change PRD `02`, `22` and `23`.

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| SP-01 | Connect each surface and call `core_whoami`: Claude Code in VS Code, Claude Code on the web, claude.ai custom connector, the mobile app **(Human + Sonnet)** | S | Sonnet | `docs/architecture.md` §6.5 | Each surface marked works / works with a setting (named) / doesn't |
| SP-02 | Signed upload from Claude Code (`curl`) and from the claude.ai chat sandbox | S | Sonnet | `docs/architecture.md` §6.4 | Upload path per surface recorded; R2 holds the test files, then they're deleted |
| SP-03 | A Claude Code scheduled task calls `core_whoami` and emails you through the Gmail connector | S | Sonnet | `docs/architecture.md` §8 | Works, or the Gmail-API fallback is chosen and added as a Career task |

## Phase 1 — Design system (`D-`)

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| D-00 | **(Human, Claude Design)** New calm theme on sticker-collector's structure: neutral surfaces, one accent per lab, phone and tablet frames, every component incl. toasts, empty, error and offline states, skeletons, `Prose`; motion as ms + cubic-bezier. Export the bundle to `docs/design/` and prune foreign themes | L | — | `docs/architecture.md` §9 | Bundle committed; no screen in it uses a component missing from the bundle |
| D-01 | Tokens only: colours incl. `--color-lab-accent` per `data-lab`, type, spacing, radii, **border widths**, **breakpoints**, motion | M | Sonnet | `docs/design/` (explore agent inventory first) | Every value traceable to the bundle; no component in the diff |
| D-02 | Primitives batch 1, ported from sticker-collector: Button, Input, Textarea, `Field` (with `useId()` fallback), Chip, Checkbox, Badge, Tabs | M | Sonnet | `docs/design-system.md`, sticker-collector `components/ui` | An `Input` with no `id` is still labelled; gaining an error doesn't drop focus |
| D-03 | Primitives batch 2: Sheet, Dialog, OptionsMenu, Toast, ProgressBar, EmptyState, Skeleton, ImageTile, **Prose** | M | Sonnet | `docs/design-system.md` | Prose renders headings, tables, code blocks and callouts from the course template with tokens only |
| D-04 | App shell: lab switcher, bottom tabs on phone, side rail on tablet, `data-lab` accent, home route | M | Sonnet | `docs/prd/00-platform.md`, `docs/design-system.md` | Switching lab changes the accent without a page reload; no horizontal scroll at phone width |
| D-05 | Home screen with a cross-lab summary (placeholder cards until labs exist) | S | Sonnet | `docs/prd/00-platform.md` | A lab with no data shows its empty state, not an error |
| D-06 | `/dev/ui` kitchen sink + `docs/design-system.md` inventory | M | Sonnet | `components/ui` | Every primitive appears in every variant × state, at phone and tablet widths |
| D-07 | Token guard `check-tokens.sh` with `--self-test` (port) | S | Haiku | sticker-collector `scripts/check-tokens.sh` | Self-test catches `#ff0000`, a px font-size and a px border width; CI runs the self-test before the scan |
| D-08 | Component test harness (jsdom + RTL, behaviour only), `asyncUtilTimeout` < `testTimeout` | S | Sonnet | `vitest.config.ts` | One behaviour test per interactive primitive; no snapshot exists |
| D-09 | Inventory drift check: every export in `components/ui` is listed in `design-system.md` | S | Haiku | `docs/design-system.md` | An unlisted component fails CI |
| D-10 | Error boundary, `errorElement` on every top-level route, distinct error / offline / empty states | M | Sonnet | `docs/design-system.md` | A thrown route error never shows React Router's default page; a failed read never renders as "nothing here yet" |
| D-11 | PWA shell: `vite-plugin-pwa`, phone + tablet icons, any orientation, `NetworkFirst` (3 s) for `/api`, `CacheFirst` for `/api/study/content/*` | M | Sonnet | `docs/architecture.md` §7 | Data written is visible on the next read without navigating; the shell opens offline |

## Phase 2 — Study Lab (`ST-`) · outline, detailed after PRD `10`–`13`

Keystone first: **ST-01** backlog rules as pure functions in `shared/study` (ID allocation, sort, summary, grade tenths), Opus, full and mutation-tested. Then `learn_*` schema and invariants; import `learning-backlog.md`; `study_*` MCP tools; move `study-course-builder` to `study-materials` and point it at the tools; backlog screens; course reader; grades and exam links; roadmap. Archive cs-learning-lab last.

## Phase 3 — Career Lab (`CA-`) · outline, detailed after PRD `20`–`24`

Keystone first: **CA-01** readiness (verified / declared / gap) and requirement-to-skill normalization as pure functions, Opus. Then `career_*` schema; profile with the master-resume import; jobs and the Study contract; documents with signed uploads; search criteria and the scheduled task; openings; self-introductions; copy panel; interviews with Drive links.

## Hardening (`H-`)

| ID | Task | Size | Model | Load | Done when |
|---|---|---|---|---|---|
| H-01 | Offline vs server error states across every lab screen | M | Sonnet | `docs/design-system.md` | Airplane mode shows the offline state on every screen; no screen shows a stack trace |
| H-02 | Backup/export (D1 + R2) and restore; updates `user.last_exported_at` on the server | L | Opus | `docs/prd/90-services.md` | A restore into an empty local DB reproduces every row and file; `last_exported_at` lives nowhere in `localStorage` |
| H-03 | E2E journey 1: log in → add a backlog topic → read a course | M | Sonnet | `e2e/` | Passes 3 runs in a row |
| H-04 | E2E journey 2: map a job → gap lands in the Study backlog → readiness updates | M | Sonnet | `e2e/` | Passes 3 runs in a row |
| H-05 | MCP contract test: every registered tool's schema and its idempotent replay | M | Opus | `docs/prd/02-integration.md` | A tool added without a test fails CI |

## Go-Live (`G-`)

Playbook §17 unchanged: **G-00** merge and watch deploy · **G-01** provision the owner from the deployed commit **(Human)** · **G-02** real phone **and tablet** check · **G-03** `verify-triggers.sh --remote` on preview, then delete the preview DB · **G-04** first backup stored off-device. Add: connect Claude (claude.ai connector + Claude Code) to production and run `core_whoami` from each surface used.

## Post-launch (`P-`)

| ID | Item | From |
|---|---|---|
| P-01 | Browse every Markdown file in `study-materials`, by folder | R2-3 |
| P-02 | App uploads interview videos to Drive (Google OAuth) | R2-13 |
| P-03 | Claude in Chrome fills job forms through the MCP connector | R2-12 |
| P-04 | Designed desktop layout | A-1 |

## Tech debt register (`TD-`)

| ID | Debt | Where it came from | Cost of leaving it |
|---|---|---|---|
| — | _None yet_ | | |
