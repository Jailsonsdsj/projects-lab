# Projects Lab
One web app hosting labs (Study Lab, Career Lab) that share data. Single owner. The app has no LLM: Claude sessions write into it over MCP.

## Stack
One Cloudflare Worker (Hono) + static assets (Vite/React 19). D1 + Drizzle. R2. KV (OAuth only). pnpm workspaces.
packages/shared (zero deps: Zod, pure rules, constants, contracts) · packages/api · packages/web

## Read on demand, never by default
Task → docs/backlog.md (one row; load only its Load column) · Rules → docs/prd/<nn>-*.md
Infra → docs/architecture.md · UI → docs/design-system.md

## Labs
- Lab code lives in `api/src/labs/<lab>`, `web/src/labs/<lab>`, `shared/src/<lab>`.
- `core` never imports a lab. A lab never imports another lab: cross-lab calls go through `shared/src/contracts/` only. Biome enforces both.
- Tables: core unprefixed (`user`, `skill`, …); Study Lab `learn_*`; Career Lab `career_*`.
- MCP tools are named `core_*`, `study_*`, `career_*`, registered by their lab at mount time.

## Rules not inferable from code
- D1 has no interactive transactions: multi-statement writes go in one db.batch().
- Conditional insert for any decrement; never read-then-write.
- Derived state is computed at read time: readiness, summaries, averages, statuses. Never stored.
- Invariants are DB triggers. A RAISE(ABORT) means the code is wrong; never drop a trigger.
- Every column a CHECK references is NOT NULL.
- Never edit an applied migration. Triggers live in their own custom migration.
- Grades are integer tenths, 0–100 (8.5 → 85). No floats anywhere.
- 10 ms CPU free tier: no PDF generation, image processing or heavy crypto server-side; KDF runs in the browser.
- KDF params and every shared magic number live in packages/shared only.
- Every mutation accepts Idempotency-Key (per-route middleware, not wildcard). MCP write tools take `idempotencyKey` and use the same table.
- Two credentials, never interchangeable: session JWT for /api, OAuth access token for /mcp. Each surface rejects the other's token.
- MCP tool handlers are thin adapters: Zod-validate, then call the same service function as the /api route. No SQL or business logic in a tool.
- Never accept file content as an MCP tool argument (base64 or otherwise). Claude's documents go straight to the owner; the app stores none. The only upload is the owner's profile photo, in the app with a session.
- `study-materials` is read-only to the app (GITHUB_TOKEN, Contents read). Only Claude Code pushes there. Fetch content by blob SHA; don't rely on the Workers Cache API.
- Video never goes to R2. Interview videos are Google Drive links.
- assets.run_worker_first is ["/api/*","/mcp","/oauth/*","/.well-known/*"], never true.
- Read secrets (TOKEN_SIGNING_KEY, GITHUB_TOKEN) outside any try that maps errors to 401; a missing secret throws a message naming the fix.
- Never pin a dependency version from memory; report anything >1 minor behind.
- TypeScript stays on 5.x until Drizzle supports 7.
- Colours/type/spacing/border widths/breakpoints come from tokens.css; literals fail CI. A lab's colour is `--color-lab-accent` only.
- Layouts are designed for phone and tablet; desktop uses the tablet layout.

## Commands
pnpm dev | test | typecheck | lint | lint:tokens | seed | db:generate | types | provision | e2e

## Never do as an agent
Run `pnpm provision`, any `--remote` command, or `wrangler secret put`. Those are the owner's.

## Workflow
One backlog task per session: /task <ID>. Plan first if >3 files. Update the progress table before finishing.
