# Integration

How Claude reaches Projects Lab: one remote MCP server on the same Worker, the tools it exposes, the Claude surfaces that connect to it, how study content is read from `study-materials`, and where Claude's documents go (Documents). Source: architecture §6–7 and the round-2 answers it cites (R2-1 to R2-10, and R3-1). Sign-in and consent are in `01-identity-and-access.md`.

## MCP endpoint

- `/mcp`, Streamable HTTP, built with the Agents SDK's stateless `createMcpHandler`: no Durable Objects, no server-side session. Each request stands alone.
- **Only OAuth access tokens** (F-14): issuer `PUBLIC_ORIGIN`, resource `<origin>/mcp`, one scope `projects-lab`, clients registered by metadata document (CIMD) or dynamically (DCR). A missing or invalid token gets `401` with a `WWW-Authenticate` challenge pointing at the resource metadata; a session JWT is refused.
- The handler knows the user (`props.userId`) and the client (the grant's `metadata.clientName`), which the audit records.

## Tool conventions

- **Names** match `^(core|study|career)_[a-z_]+$` (C-4), verb first after the prefix: `study_list_backlog`, `career_map_job`. Each lab registers its tools at mount time; `mountLabs` refuses a name without its lab's prefix. Core tools are registered by the MCP module.
- **One description per tool**, one or two sentences: what it does and when Claude should use it.
- **Thin adapters.** A tool's input schema is the shared Zod schema of the matching `/api` route; the handler validates, calls the **same service function**, and maps the result. No SQL and no business logic in a tool (F-15 checks this; H-05 tests every tool's schema).
- **Reads are compact**: the fields Claude needs, not whole rows. Lists take `limit` (default 50, max 200) and `cursor`, and return `nextCursor` when there is more.
- **Writes are idempotent**: every write tool takes an optional `idempotencyKey` (at most 200 characters) and goes through the same `mutation` table as `/api`, with the tool name as its scope. A retry with the key gets the stored result; the key on another tool is `idempotency_key_reused`; a key whose first call hasn't finished is `idempotency_key_in_progress`.
- **Every write is audited**: one `mcp_call` row per call to a write tool (tool, client name, `ok`, time), replays and failures included, so the owner sees what Claude did. Reads aren't audited.
- **Never file content as an argument**, base64 or otherwise: a model has to generate it token by token. Claude's documents go straight to the owner and the app stores none (R3-1, architecture §6.4); the only upload is the owner's profile photo, in the app with a session.

### Errors

A failed call returns an MCP tool result with `isError: true` and a JSON body `{ error, message }`. `message` tells Claude what to fix; never a stack trace. Input that fails the tool's schema never reaches the tool: the MCP SDK answers it with `isError: true` and its own plain-text message naming the field ("Input validation error: … query: …").

| `error` | When |
|---|---|
| `bad_request` | Input the schema allows but a service refuses (the schema itself is checked by the SDK, above) |
| `not_found` | The record named doesn't exist |
| `conflict` | A rule refused the write (a duplicate, a trigger's `RAISE(ABORT)` that the service maps) |
| `idempotency_key_reused`, `idempotency_key_in_progress` | As above |
| `internal` | Anything else; logged on the Worker |

## Platform tools

Lab tools are specified in each lab's PRD.

| Tool | Kind | Input | Returns | Task |
|---|---|---|---|---|
| `core_whoami` | read | none | `{ owner: { id, timezone }, client, labs }`: proves the connection and names the client the grant belongs to | F-15 |
| `core_find_skill` | read | `{ query }` | `{ skill: { id, name, aliases } \| null }`: by name or alias, ignoring case and soft-deleted skills; at most one (C-8) | F-15 |
| `study_list_backlog` | read | `{ area?, status? }` | `{ areas, topics }`: the backlog in its order; each topic `{ id, skill, skillId, area, level, priority, status, grade, startedOn, finishedOn, note }` (`10`) | ST-04 |
| `study_get_summary` | read | none | Per-area and total counts by status, average grade of Done topics (tenths), `next` topic (`10`) | ST-04 |
| `study_add_topics` | write | `{ topics: [{ skill, area, level?, priority?, note? }], idempotencyKey? }` | `{ topics: [{ topic, created, restored }] }`; never duplicates a skill (`10`) | ST-04 |
| `study_update_topic` | write | `{ topicId, level?, priority?, status?, note?, idempotencyKey? }` | `{ topic }` (`10`) | ST-04 |
| `study_remove_topic` | write | `{ topicId, idempotencyKey? }` | `{ removed }`; soft delete (`10`) | ST-04 |
| `study_add_area` | write | `{ name, prefix, idempotencyKey? }` | `{ area: { prefix, name, position } }` (`10`) | ST-04 |

## Surfaces

Priority A > B > D (R2-7). SP-01 filled in "Works" (2026-10-16); SP-02 (redefined by R3-1) filled in "Documents" (2026-10-19): every surface turned `core_whoami` data into a one-page PDF and a DOCX and got both onto the owner's device; all opened on the Mac, iPhone and iPad.

| Surface | Connects as | Works (SP-01, 2026-10-16) | Client name · registered by | Documents (SP-02) |
|---|---|---|---|---|
| A · Claude Code, VS Code | Remote HTTP MCP server at user scope (`claude mcp add --transport http --scope user projects-lab <origin>/mcp`); `/mcp` → Authenticate signs in through the browser | **Works**, no setting | "Claude Code" · its own client (origin not checked) | **Works**: written to the Mac's disk. The Mac had no PDF/DOCX libraries; Claude installed reportlab and python-docx in a throwaway virtualenv |
| B · Claude Code on the web | The claude.ai connector, not a registration of its own | **Works**, no setting reported | "Claude" · CIMD, via claude.ai | **Works**: the web UI offers the files for download |
| C · Claude chat, web and desktop | Custom connector, Settings → Connectors | **Works**, no setting | "Claude" · CIMD (`https://claude.ai/oauth/mcp-oauth-client-metadata`, seen in the logs) | **Works**, with **Code execution and file creation** on (it already was): download |
| D · Claude app, phone and tablet | The connector added on claude.ai | **Works** on iPhone and iPad, no setting | "Claude" · CIMD, via claude.ai | **Works** on iPhone and iPad (the claude.ai setting applies): save from the chat |
| Scheduled task | A Claude Code routine (claude.ai/code/routines) with the **Projects-Lab and Gmail connectors attached to the routine** (account connectors aren't inherited; add them in the routine's settings) | **Works** (SP-03, 2026-10-19): `core_whoami` and Gmail `send_message` unattended, no permission prompt, fired within a minute of schedule (once 6 min late) | "Claude" · the claude.ai connector | — |

CPU per `/mcp` call is over the free tier's 10 ms (15–21 ms; `core_whoami` 10 ms), with no failed request; the fix is P-05 (post-launch). Both registration paths stay on: claude.ai uses CIMD, and Claude Code registers its own client.

## Study content: `study-materials`

- **Layout (R2-2).** Generated content lives under `study-materials/Study Lab/<area-slug>/<topic-slug>/`, slug paths only: `<topic>__<level>.md` (Specialized: `__<level>_m1.md`, `_m2` …), `<topic>__<level>__exam-<n>.md` and `.pdf`, and images in `_img/`. Other folders are untouched and shown only after launch (P-01).
- **Read-only to the app.** The Worker reads with `GITHUB_TOKEN`: a fine-grained token, Contents read, on `study-materials` only. No GitHub write call exists in the code; only Claude Code pushes.
- **Metadata by path** returns the blob SHA. The Worker sends `If-None-Match` with the ETag it has; a `304` costs no body fetch and doesn't count against GitHub's rate limit.
- **Content by SHA** at `GET /api/study/content/<sha>/<name>` (the SHA chooses the bytes; the name only sets the type and the download name), with `Cache-Control: private, max-age=31536000, immutable` (`private`: it needs a session). The service worker caches it (D-11, `CacheFirst`), which is what makes courses readable offline. Don't rely on the Workers Cache API.
- **Images** under `_img/` are proxied the same way, so the repository never needs to be public. An `<img>` sends the session cookie, which is why `/api` accepts it for reads. Content responses carry `X-Content-Type-Options: nosniff` and a sandboxing `Content-Security-Policy`, so an SVG opened directly runs no script on the app's origin.
- **Metadata ETags** live in D1 (`github_cache`), since the Workers Cache API isn't relied on and KV is for OAuth only. The repository is `STUDY_MATERIALS_REPO` in `wrangler.jsonc` `vars`.
- Every GitHub request sends a `User-Agent` (GitHub refuses requests without one).
- **Exams (R2-4)** are taken in Claude Code. The app shows the grade and links the Markdown and the PDF.

| Status | `error` | When |
|---|---|---|
| 502 | `github_token_invalid` | `GITHUB_TOKEN` unset, expired or without access; the message names the fix. Never an empty course list |
| 503 | `github_rate_limited` | GitHub's limit reached; `Retry-After` set |
| 404 | `not_found` | No file at that path or SHA |

## Documents (R3-1, replaces R2-10)

Resumes, cover letters and any other career file are generated on demand by Claude from the profile and **returned to the owner; the app stores none** (architecture §6.4). There is **no upload route**: Claude builds the file in its own sandbox from structured data it reads over MCP (Career PRD `22`, `career_document_brief`), and nothing file-sized crosses MCP in either direction. How each surface gets the file onto the owner's device is SP-02 (Surfaces, "Documents").

The only file the app stores is the owner's profile photo, uploaded in the app with a session (Career PRD `20`). Video never goes to R2: interview videos are Google Drive links (R2-13).

F-18 built signed uploads (`core_create_upload`, `PUT /api/uploads/<token>`, `UPLOAD_SIGNING_KEY`); F-23 removed them. Their `upload` table and its invariants were dropped in the next deploy by TD-01 (`0007_drop_upload`).

## Invariants (merged into `99-data-model.md`)

- C-4 and C-5 (`mcp_call.tool` prefix, `mcp_call.ok` 0/1) already hold.
- C-10 to C-13 (`upload`, F-18) are retired: TD-01 dropped the table (`0007_drop_upload`) in the deploy after F-23.

## Decisions (owner, 2026-10-16)

The choices architecture left open, as recommended in the draft:

1. **Only writes are audited.** The Connections screen's "last use" is the last write unless the OAuth provider records last use (F-16 checks).
2. **Lists** page with `limit` (default 50, max 200) and `cursor`.
3. **Content by SHA** is `private, max-age=31536000, immutable`.
4. ~~**Uploads:** kinds `resume` and `cover_letter`, PDF and Word, 10 MB, R2 key `uploads/<uploadId>/<filename>`, tracked in a new `upload` table (F-18).~~ Replaced by R3-1 (2026-10-17): documents are returned to the owner, never stored; removed by F-23.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
