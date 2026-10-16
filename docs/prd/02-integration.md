# Integration

How Claude reaches Projects Lab: one remote MCP server on the same Worker, the tools it exposes, the Claude surfaces that connect to it, how study content is read from `study-materials`, and how files from Claude arrive. Source: architecture §6–7 and the round-2 answers it cites (R2-1 to R2-10). Sign-in and consent are in `01-identity-and-access.md`.

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
- **Never file content as an argument**, base64 or otherwise: a model has to generate it token by token. Files arrive through `core_create_upload` (below).

### Errors

A failed call returns an MCP tool result with `isError: true` and a JSON body `{ error, message }`. `message` tells Claude what to fix; never a stack trace.

| `error` | When |
|---|---|
| `bad_request` | Input fails the tool's schema |
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
| `core_create_upload` | write | `{ kind, filename, contentType, bytes, idempotencyKey? }` | `{ uploadId, uploadUrl, expiresAt }` (see Uploads) | F-18 |

## Surfaces

Priority A > B > D (R2-7). SP-01 fills in "Works" and SP-02 "Uploads"; this table is where their results are recorded.

| Surface | Connects as | Works | Uploads |
|---|---|---|---|
| A · Claude Code, VS Code | Remote HTTP MCP server; OAuth in the browser | Expected (SP-01) | `curl --upload-file` (SP-02) |
| B · Claude Code on the web | Same server; the environment's network settings may need the app's domain | Unverified (SP-01) | `curl` if the sandbox reaches the app (SP-02) |
| C · Claude chat, web and desktop | Custom connector, Settings → Connectors | Documented | Probably none: the owner drops the file in the app (SP-02) |
| D · Claude app, phone and tablet | The connectors added on claude.ai | Documented | As C |
| Scheduled task | A Claude Code scheduled task using the connector (and Gmail, SP-03) | Unverified (SP-03) | As A |

## Study content: `study-materials`

- **Layout (R2-2).** Generated content lives under `study-materials/Study Lab/<area-slug>/<topic-slug>/`, slug paths only: `<topic>__<level>.md` (Specialized: `__<level>_m1.md`, `_m2` …), `<topic>__<level>__exam-<n>.md` and `.pdf`, and images in `_img/`. Other folders are untouched and shown only after launch (P-01).
- **Read-only to the app.** The Worker reads with `GITHUB_TOKEN`: a fine-grained token, Contents read, on `study-materials` only. No GitHub write call exists in the code; only Claude Code pushes.
- **Metadata by path** returns the blob SHA. The Worker sends `If-None-Match` with the ETag it has; a `304` costs no body fetch and doesn't count against GitHub's rate limit.
- **Content by SHA** at `GET /api/study/content/<sha>`, with `Cache-Control: private, max-age=31536000, immutable` (`private`: it needs a session). The service worker caches it (D-11, `CacheFirst`), which is what makes courses readable offline. Don't rely on the Workers Cache API.
- **Images** under `_img/` are proxied the same way, so the repository never needs to be public. An `<img>` sends the session cookie, which is why `/api` accepts it for reads.
- Every GitHub request sends a `User-Agent` (GitHub refuses requests without one).
- **Exams (R2-4)** are taken in Claude Code. The app shows the grade and links the Markdown and the PDF.

| Status | `error` | When |
|---|---|---|
| 502 | `github_token_invalid` | `GITHUB_TOKEN` unset, expired or without access; the message names the fix. Never an empty course list |
| 503 | `github_rate_limited` | GitHub's limit reached; `Retry-After` set |
| 404 | `not_found` | No file at that path or SHA |

## Uploads (R2-10)

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
