# Identity and access

One owner. Two credentials that are never interchangeable: a **session JWT** for the app (`/api/*`) and an **OAuth access token** for Claude (`/mcp`). Each surface rejects the other's token. No third-party identity provider.

## Passphrase and KDF

- The passphrase **never leaves the device.** The browser stretches it with PBKDF2-SHA256 into a 32-byte `authKey`; the Worker only SHA-256s the `authKey` and compares. The free plan's 10 ms CPU budget can't run the KDF server-side, and the server never holding the passphrase is the stronger design anyway.
- KDF constants live in `packages/shared/src/core` and nowhere else: `KDF_ITERATIONS` (PBKDF2's cost; its value appears in `kdf.ts` only, enforced by `pnpm lint`), `SALT_BYTES` (16), `PASSPHRASE_MIN_LENGTH` (12), plus `generateSalt()` (base64), `deriveAuthKey(passphrase, salt, iterations)` and `hashAuthKey(authKey)`. Seeds, scripts and tests import them; no other file spells the number.
- `user` stores `auth_key_hash` (base64 SHA-256 of the `authKey`), `kdf_salt` and `kdf_iterations`. Login uses the **stored** iterations, so the cost can be raised later without locking the owner out.
- Minimum passphrase length: 12 characters, checked wherever a passphrase is chosen (provisioning, change passphrase).

## Provisioning

`pnpm provision` is the only way to create the owner (F-09). It prompts for the passphrase without echo, refuses if a user already exists (and deletes nothing), and `--verify <url>` logs in against a deployed app without writing. **No HTTP route creates a user.**

## Login

1. `GET /api/auth/salt` → `{ salt, iterations }` for the owner. The salt isn't secret. No owner → `404 { error: "not_provisioned" }`.
2. The browser derives `authKey = base64(PBKDF2-SHA256(passphrase, salt, iterations))`.
3. `POST /api/auth/login { authKey }`:
   - **Rate limit first:** 10 attempts per 15-minute fixed window per hashed IP (`auth_attempt`, `window_start = floor(now / 900) * 900`). Every attempt counts, successful or not. The 11th → `429` with `Retry-After` (seconds to the window's end). The next window starts from zero. The IP is hashed with HMAC-SHA256 keyed by `TOKEN_SIGNING_KEY`, so stored values can't be reversed by enumerating addresses.
   - Malformed body → `400`.
   - SHA-256 the `authKey` and constant-time compare it with `auth_key_hash`. **With no owner, compare against an empty hash anyway**: same code path, same timing, same `401 { error: "invalid_passphrase" }` as a wrong key.
   - Success → issue a session.
- The owner is read with one deterministic query: `SELECT … FROM user ORDER BY created_at, id LIMIT 1`.

## Sessions

- HS256 JWT signed with `TOKEN_SIGNING_KEY`. Claims: `sub` (user id), `iat`, `exp`, `sv` (session version). Lifetime 90 days.
- Returned in the login body **and** set as cookie `pl_session` (`HttpOnly; Secure; SameSite=Strict; Path=/`). `/api/*` accepts `Authorization: Bearer` or the cookie; the cookie exists for requests that can't set headers, such as `<img>` loading an R2 file.
- **Session version:** `user.session_version` (integer, starts at 0, never negative). A token whose `sv` differs from the stored value is rejected. Bumping it ends every session at once. The column arrives in F-08's migration, so every token ever issued carries `sv`.
- `TOKEN_SIGNING_KEY` is read **outside** any `try` that maps errors to 401. Unset, it throws an error naming the fix (`cp .dev.vars.example .dev.vars` locally, `wrangler secret put` in production), never a 401.

## Logout and expiry

- `POST /api/auth/logout` clears the cookie (`Max-Age=0`) and returns `204`; the client drops its token. It ends **this device's** session only. The JWT stays valid until it expires or `sv` changes; there is no server-side session list.
- Any `401` from `/api/*` makes the client clear its token and go to `/login`, except `invalid_passphrase` from the passphrase change, which the form shows as a wrong current passphrase while the session stays. When the token had expired, the login screen says "Session expired. Sign in again to pick up where you left off." No screen shows a raw 401.

## Change passphrase (F-11)

1. Signed-in client fetches the current salt and iterations, derives `currentAuthKey`, generates a new salt with `generateSalt()`, and derives `newAuthKey` with `KDF_ITERATIONS`.
2. `POST /api/auth/passphrase { currentAuthKey, newAuthKey, newSalt, newIterations }` with an `Idempotency-Key`. Rate-limited in the same `auth_attempt` bucket. `newIterations` can't be below `KDF_ITERATIONS`. Idempotency runs **before** the session check: a success ends the caller's session too, so a retry after a lost response carries a dead JWT and still gets the stored new session.
3. The Worker verifies `currentAuthKey` (constant-time). Wrong → `401`, **nothing changes**. Right → one `db.batch()` writes the new hash, salt and iterations and increments `session_version`; the response carries a fresh session for this device.
4. Every other session dies (old `sv`). The old passphrase no longer works.

## Claude: OAuth sign-in and consent

- `workers-oauth-provider` wraps the Worker; tokens, codes and client secrets are stored hashed in `OAUTH_KV`; refresh tokens rotate. Claude clients register dynamically.
- `/oauth/authorize` renders **the same login screen** (browser KDF, same rate limit), then a one-line consent: "Allow *{client name}* to read and write Projects Lab", Allow or Deny. One scope: everything.
- An OAuth access token is rejected on `/api/*`; a session JWT is rejected on `/mcp`. Tested both ways.

## Connections screen

Lists active OAuth grants: client name, when it was granted, last use, and **Revoke**. Revoke deletes the grant and its tokens; that client must sign in again. Last use comes from the provider if it records one, otherwise from the newest `mcp_call` row for that `client_name`.

## Errors

| Status | Body `error` | When |
|---|---|---|
| 400 | `bad_request` | Body fails its Zod schema |
| 401 | `invalid_passphrase` | Wrong key, or no owner |
| 401 | `unauthorized` | Missing, invalid or expired token, or stale `sv` |
| 404 | `not_provisioned` | `GET /api/auth/salt` with no owner |
| 429 | `too_many_attempts` | 11th attempt in a window; `Retry-After` set |

## Invariants (merged into `99-data-model.md`)

- C-9: `user.session_version` is `NOT NULL`, default 0, and an integer >= 0 (triggers in `0003_session_version_trigger`; see `99-data-model.md` for why not a CHECK).

## Open questions (owner to confirm)

1. **Passphrase change and Claude:** should it also revoke every OAuth grant? Proposed: no. Revoking is one tap on the Connections screen, and reconnecting Claude on every surface after each change is costly.
2. **Session lifetime:** 90 days (playbook default), or shorter?

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
