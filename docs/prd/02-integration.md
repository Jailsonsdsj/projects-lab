# Integration

How Claude reaches Projects Lab: one remote MCP server on the same Worker, the tools it exposes, the Claude surfaces that connect to it, how study content is read from `study-materials`, and how files from Claude arrive (superseded by R3-1: see Uploads). Source: architecture §6–7 and the round-2 answers it cites (R2-1 to R2-10, and R3-1). Sign-in and consent are in `01-identity-and-access.md`.

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
| `core_create_upload` | write | `{ kind, filename, contentType, bytes, idempotencyKey? }` | `{ uploadId, uploadUrl, expiresAt }` (see Uploads) | F-18; **superseded by R3-1**, removed by F-23 |

## Surfaces

Priority A > B > D (R2-7). SP-01 filled in "Works" (2026-10-16); SP-02, redefined by R3-1, fills in "Documents": how each surface gets a generated PDF and DOCX onto the owner's device.

| Surface | Connects as | Works (SP-01, 2026-10-16) | Client name · registered by | Documents (SP-02) |
|---|---|---|---|---|
| A · Claude Code, VS Code | Remote HTTP MCP server at user scope (`claude mcp add --transport http --scope user projects-lab <origin>/mcp`); `/mcp` → Authenticate signs in through the browser | **Works**, no setting | "Claude Code" · its own client (origin not checked) | Expected: written to the Mac's disk |
| B · Claude Code on the web | The claude.ai connector, not a registration of its own | **Works**, no setting reported | "Claude" · CIMD, via claude.ai | Expected: stays in the cloud container |
| C · Claude chat, web and desktop | Custom connector, Settings → Connectors | **Works**, no setting | "Claude" · CIMD (`https://claude.ai/oauth/mcp-oauth-client-metadata`, seen in the logs) | Expected: download, with file creation on in claude.ai |
| D · Claude app, phone and tablet | The connector added on claude.ai | **Works** on iPhone and iPad, no setting | "Claude" · CIMD, via claude.ai | As C |
| Scheduled task | A Claude Code scheduled task using the connector (and Gmail, SP-03) | Unverified (SP-03) | | — |

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

## Uploads (R2-10)

> **Superseded by R3-1 (2026-10-17).** Resumes, cover letters and other career files are generated on demand by Claude from the profile and returned to the owner; the app never stores them (architecture §6.4). Nothing uses the flow below. It stays in the code until **F-23** removes it; then this section becomes "documents are returned to the owner; no upload route". The `upload` table goes in TD-01.

Resumes and cover letters are Word or PDF files made by Claude and stored in R2. Video never goes to R2: interview videos are Google Drive links (R2-13).

1. Claude calls `core_create_upload { kind, filename, contentType, bytes }`. The Worker checks `kind`, type and size, records the upload, and returns `uploadUrl`: `PUT <origin>/api/uploads/<token>`, signed with `UPLOAD_SIGNING_KEY`, valid for **10 minutes**, for **this one upload**.
2. Claude Code runs `curl --upload-file <file> -H "Content-Type: <type>" <uploadUrl>`. The Worker checks the signature and expiry, that the upload is unused (a conditional write, never read-then-write), that `Content-Type` and `Content-Length` match what was declared, then streams the body to R2. Anything that fails writes nothing.
3. Claude calls the lab tool that attaches the stored upload (by `uploadId`) to its record (Career PRD `22`).
4. Where Claude can't run `curl`, it hands the owner the file, and the owner drops it on the same record in the app.

**The upload URL is its own credential.** `PUT /api/uploads/<token>` is the only `/api` route without a session: `curl` in a Claude session has neither the session JWT nor an OAuth token. The token authorizes exactly one PUT of the declared file and nothing else.

**Limits and storage:**

- **Kinds:** `resume` and `cover_letter`.
- **Types:** PDF (`application/pdf`) and Word (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
- **Size cap:** 10 MB per file.
- **Storage:** R2 key `uploads/<uploadId>/<filename>`, with the filename reduced to letters, digits, `.`, `-` and `_`.
- **Tracking:** a new `upload` table (id, kind, filename, content_type, bytes, created_at, used_at?) holds each upload's state; F-18 adds it with its invariants.

| Status | `error` | When |
|---|---|---|
| 400 | `bad_request` | `core_create_upload` input fails its schema, or an unknown `kind` |
| 403 | `upload_invalid` | The signature doesn't verify |
| 410 | `upload_expired` | More than 10 minutes after it was issued |
| 409 | `upload_used` | The upload already has its file |
| 413 | `upload_too_large` | Declared or sent size over the cap, or not the declared size |
| 415 | `upload_wrong_type` | A type not allowed for the kind, or not the declared type |

## Invariants (merged into `99-data-model.md`)

- C-4 and C-5 (`mcp_call.tool` prefix, `mcp_call.ok` 0/1) already hold.
- **With F-18:** `upload.bytes` is an integer from 1 to the cap; `upload.kind` and `upload.content_type` come from the allowed lists; `upload.used_at`, once set, never changes.

## Decisions (owner, 2026-10-16)

The choices architecture left open, as recommended in the draft:

1. **Only writes are audited.** The Connections screen's "last use" is the last write unless the OAuth provider records last use (F-16 checks).
2. **Lists** page with `limit` (default 50, max 200) and `cursor`.
3. **Content by SHA** is `private, max-age=31536000, immutable`.
4. **Uploads:** kinds `resume` and `cover_letter`, PDF and Word, 10 MB, R2 key `uploads/<uploadId>/<filename>`, tracked in a new `upload` table (F-18). Career PRD `22` may add kinds.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
