// OAuth for Claude (F-14a): the whole flow through the real Worker entry,
// OAuthProvider included: register → /oauth/authorize (passphrase, consent) →
// code → tokens → /mcp. docs/prd/01-identity-and-access.md, architecture §6.2.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  type AuthorizePage,
  deriveAuthKey,
  generateSalt,
  hashAuthKey,
  OAUTH_CONSENT_ELEMENT_ID,
  OAUTH_SCOPE,
} from "@projects-lab/shared";
import { sign } from "hono/jwt";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_ATTEMPT_LIMIT } from "../src/core/auth/rate-limit";
import { signingKey } from "../src/core/auth/session";
import { publicOrigin } from "../src/core/oauth/origin";
import { db } from "./db";

const ORIGIN = "https://lab.example"; // PUBLIC_ORIGIN in vitest.config.ts
const RESOURCE = `${ORIGIN}/mcp`;
const REDIRECT = "https://client.example/callback";
let authKey: string;

beforeAll(async () => {
  const salt = generateSalt();
  authKey = await deriveAuthKey("the owner's passphrase", salt, 1);
  await db()
    .prepare(
      `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at)
       VALUES ('owner', ?, ?, 1, 'UTC', '2026-01-01T00:00:00.000Z')`,
    )
    .bind(await hashAuthKey(authKey), salt)
    .run();
});

let ipCounter = 0;
const freshIp = () => `10.2.0.${++ipCounter}`;

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return { verifier, challenge };
}

async function register(
  metadata: Record<string, unknown> = {},
): Promise<{ client_id: string; client_secret?: string }> {
  const res = await SELF.fetch(`${ORIGIN}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude Test",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      ...metadata,
    }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

/** Opens the consent page as a browser would: its page data and cookies. */
async function openConsent(clientId: string, challenge: string, state = "s1") {
  const url = new URL(`${ORIGIN}/oauth/authorize`);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT,
    state,
    scope: OAUTH_SCOPE,
    resource: RESOURCE,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }))
    url.searchParams.set(k, v);
  const res = await SELF.fetch(url, { redirect: "manual" });
  const html = await res.text();
  const json = html.match(
    new RegExp(
      `<script type="application/json" id="${OAUTH_CONSENT_ELEMENT_ID}">(.*?)</script>`,
    ),
  )?.[1];
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return {
    res,
    html,
    page: json ? (JSON.parse(json) as AuthorizePage) : null,
    cookie,
  };
}

function decide(body: Record<string, unknown>, cookie: string, ip = freshIp()) {
  return SELF.fetch(`${ORIGIN}/oauth/authorize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: ORIGIN,
      "CF-Connecting-IP": ip,
    },
    body: JSON.stringify(body),
  });
}

async function token(params: Record<string, string>, basic?: string) {
  const res = await SELF.fetch(`${ORIGIN}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(basic ? { Authorization: `Basic ${basic}` } : {}),
    },
    body: new URLSearchParams(params),
  });
  return { res, body: (await res.json()) as Record<string, string> };
}

/** Register, consent with the right passphrase, exchange the code. */
async function signInClaude(metadata: Record<string, unknown> = {}) {
  const client = await register(metadata);
  const { verifier, challenge } = await pkce();
  const consent = await openConsent(client.client_id, challenge);
  const decided = await decide(
    { decision: "allow", handle: consent.page?.handle, authKey },
    consent.cookie,
  );
  expect(decided.status).toBe(200);
  const { redirectTo } = (await decided.json()) as { redirectTo: string };
  const code = new URL(redirectTo).searchParams.get("code") ?? "";
  const basic = client.client_secret
    ? btoa(`${client.client_id}:${client.client_secret}`)
    : undefined;
  const { res, body } = await token(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: RESOURCE,
      ...(basic ? {} : { client_id: client.client_id }),
    },
    basic,
  );
  expect(res.status).toBe(200);
  return { client, code, basic, tokens: body };
}

const bearer = (path: string, value: string, method = "GET") =>
  SELF.fetch(`${ORIGIN}${path}`, {
    method,
    headers: { Authorization: `Bearer ${value}` },
  });

async function sessionJwt() {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: "owner", sv: 0, iat: now, exp: now + 60 },
    signingKey(env),
    "HS256",
  );
}

async function kvDump(): Promise<string> {
  const kv = env.OAUTH_KV;
  if (!kv) throw new Error("OAUTH_KV is not bound");
  const parts: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ cursor });
    for (const key of page.keys) {
      parts.push(key.name, JSON.stringify(key.metadata ?? null));
      parts.push((await kv.get(key.name)) ?? "");
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return parts.join("\n");
}

describe("two credentials, never interchangeable", () => {
  it("an OAuth access token reaches /mcp, and is refused on /api", async () => {
    const { tokens } = await signInClaude();
    const mcp = await bearer("/mcp", tokens.access_token ?? "", "POST");
    expect(mcp.status).toBe(501); // past the token check; the server is F-15
    expect(await mcp.json()).toEqual({ error: "mcp_not_ready" });

    const api = await bearer("/api/study/summary", tokens.access_token ?? "");
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "unauthorized" });
  });

  it("a session JWT is refused on /mcp, and accepted on /api", async () => {
    const jwt = await sessionJwt();
    const mcp = await bearer("/mcp", jwt, "POST");
    expect(mcp.status).toBe(401);
    expect(mcp.headers.get("WWW-Authenticate")).toMatch(/^Bearer /);
    expect((await bearer("/api/study/summary", jwt)).status).toBe(200);
  });
});

describe("GET /oauth/authorize", () => {
  it("serves the app's page with the consent details, unframeable and uncached", async () => {
    const client = await register();
    const { res, html, page, cookie } = await openConsent(
      client.client_id,
      (await pkce()).challenge,
    );
    expect(res.status).toBe(200);
    expect(html).toContain('<div id="root">');
    expect(page).toMatchObject({
      clientName: "Claude Test",
      redirectHost: "client.example",
      redirectIsLoopback: false,
    });
    expect(page?.handle).toBeTruthy();
    expect(cookie).toMatch(/__Host-oauth-/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const framing = `${res.headers.get("X-Frame-Options")} ${res.headers.get("Content-Security-Policy")}`;
    expect(framing).toMatch(/DENY|frame-ancestors 'none'/);
  });

  it("can't be broken out of by a client name", async () => {
    const evil = "</script><script>alert(1)</script>";
    const client = await register({ client_name: evil });
    const { html, page } = await openConsent(
      client.client_id,
      (await pkce()).challenge,
    );
    expect(html).not.toContain("<script>alert(1)");
    expect(page?.clientName).toBe(evil); // intact, as data
  });

  it("shows an unknown client as text, never redirecting to it", async () => {
    const { res, html } = await openConsent("no-such-client", "x".repeat(43));
    expect(res.status).toBe(400);
    expect(res.headers.get("Location")).toBeNull();
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
    expect(html.length).toBeGreaterThan(0);
  });
});

describe("POST /oauth/authorize", () => {
  it("issues no code for a wrong passphrase, and the same page can try again", async () => {
    const client = await register();
    const consent = await openConsent(
      client.client_id,
      (await pkce()).challenge,
    );
    const before = await kvDump();
    const wrong = await deriveAuthKey("not it", generateSalt(), 1);

    const refused = await decide(
      { decision: "allow", handle: consent.page?.handle, authKey: wrong },
      consent.cookie,
    );
    expect(refused.status).toBe(401);
    const body = await refused.json();
    expect(body).toEqual({ error: "invalid_passphrase" });
    expect(JSON.stringify(body)).not.toMatch(/code|redirect/);
    expect(await kvDump()).toBe(before); // no grant, no code

    const retried = await decide(
      { decision: "allow", handle: consent.page?.handle, authKey },
      consent.cookie,
    );
    expect(retried.status).toBe(200);
  });

  it("verifies the passphrase for the sign-in step without using the handle", async () => {
    const client = await register();
    const consent = await openConsent(
      client.client_id,
      (await pkce()).challenge,
    );
    const wrong = await deriveAuthKey("not it", generateSalt(), 1);
    const handle = consent.page?.handle;

    const refused = await decide(
      { decision: "verify", handle, authKey: wrong },
      consent.cookie,
    );
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: "invalid_passphrase" });

    const verified = await decide(
      { decision: "verify", handle, authKey },
      consent.cookie,
    );
    expect(verified.status).toBe(204);
    const allowed = await decide(
      { decision: "allow", handle, authKey },
      consent.cookie,
    );
    expect(allowed.status).toBe(200); // the handle was still unused
  });

  it("sends Deny back to the client as access_denied, with its state", async () => {
    const client = await register();
    const consent = await openConsent(
      client.client_id,
      (await pkce()).challenge,
      "st-9",
    );
    const res = await decide(
      { decision: "deny", handle: consent.page?.handle },
      consent.cookie,
    );
    const { redirectTo } = (await res.json()) as { redirectTo: string };
    const url = new URL(redirectTo);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("state")).toBe("st-9");
    expect(url.searchParams.get("code")).toBeNull();
  });

  it("refuses a handle from another browser (no cookie)", async () => {
    const client = await register();
    const consent = await openConsent(
      client.client_id,
      (await pkce()).challenge,
    );
    const res = await decide(
      { decision: "allow", handle: consent.page?.handle, authKey },
      "",
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "consent_expired" });
  });

  it("shares the login's rate limit", async () => {
    const client = await register();
    const consent = await openConsent(
      client.client_id,
      (await pkce()).challenge,
    );
    const ip = freshIp();
    for (let i = 0; i < AUTH_ATTEMPT_LIMIT; i++)
      await SELF.fetch(`${ORIGIN}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
        body: JSON.stringify({ authKey: "wrong" }),
      });
    const res = await decide(
      { decision: "allow", handle: consent.page?.handle, authKey },
      consent.cookie,
      ip,
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
  });
});

describe("tokens", () => {
  it("rotates refresh tokens: the old one dies once its replacement is used", async () => {
    const { client, tokens } = await signInClaude();
    const first = await token({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token ?? "",
      client_id: client.client_id,
    });
    expect(first.res.status).toBe(200);
    const second = await token({
      grant_type: "refresh_token",
      refresh_token: first.body.refresh_token ?? "",
      client_id: client.client_id,
    });
    expect(second.res.status).toBe(200);
    const stale = await token({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token ?? "",
      client_id: client.client_id,
    });
    expect(stale.res.status).toBe(400);
    expect(stale.body.error).toBe("invalid_grant");
  });

  it("leaves no plaintext token, code or client secret in KV", async () => {
    const confidential = await signInClaude({
      token_endpoint_auth_method: "client_secret_basic",
    });
    expect(confidential.client.client_secret).toBeTruthy();
    const refreshed = await token(
      {
        grant_type: "refresh_token",
        refresh_token: confidential.tokens.refresh_token ?? "",
      },
      confidential.basic,
    );
    const secrets = [
      confidential.code,
      confidential.client.client_secret ?? "",
      confidential.tokens.access_token ?? "",
      confidential.tokens.refresh_token ?? "",
      refreshed.body.access_token ?? "",
      refreshed.body.refresh_token ?? "",
    ];
    for (const secret of secrets) expect(secret.length).toBeGreaterThan(10);

    const stored = await kvDump();
    // The scan really read the grants: their userId is stored as plain metadata.
    expect(stored).toContain("owner");
    for (const secret of secrets) expect(stored).not.toContain(secret);
  });
});

describe("PUBLIC_ORIGIN", () => {
  it("names the fix when it's missing, and refuses anything but a bare origin", () => {
    expect(() => publicOrigin({})).toThrow(
      /PUBLIC_ORIGIN is not set.*\.dev\.vars/,
    );
    expect(() =>
      publicOrigin({ PUBLIC_ORIGIN: "https://lab.example/app" }),
    ).toThrow("bare origin");
    expect(publicOrigin({ PUBLIC_ORIGIN: ORIGIN })).toBe(ORIGIN);
  });
});
