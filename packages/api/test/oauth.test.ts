// OAuth for Claude (F-14a): the whole flow through the real Worker entry,
// OAuthProvider included: register → /oauth/authorize (passphrase, consent) →
// code → tokens → /mcp. docs/prd/01-identity-and-access.md, architecture §6.2.

import { SELF } from "cloudflare:test";
import { deriveAuthKey, generateSalt } from "@projects-lab/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_ATTEMPT_LIMIT } from "../src/core/auth/rate-limit";
import { publicOrigin } from "../src/core/oauth/origin";
import {
  bearer,
  decide,
  freshIp,
  kvDump,
  mcp,
  ORIGIN,
  openConsent,
  pkce,
  REDIRECT,
  register,
  seedOwner,
  sessionJwt,
  signInClaude,
  token,
} from "./oauth-flow";

let authKey: string;

beforeAll(async () => {
  authKey = await seedOwner();
});

describe("two credentials, never interchangeable", () => {
  it("an OAuth access token reaches /mcp, and is refused on /api", async () => {
    const { tokens } = await signInClaude(authKey);
    const listed = await mcp(tokens.access_token ?? "", "tools/list");
    expect(listed.res.status).toBe(200); // past the token check (F-15)

    const api = await bearer("/api/study/summary", tokens.access_token ?? "");
    expect(api.status).toBe(401);
    expect(await api.json()).toEqual({ error: "unauthorized" });
  });

  it("a session JWT is refused on /mcp, and accepted on /api", async () => {
    const jwt = await sessionJwt();
    const refused = await mcp(jwt, "tools/list");
    expect(refused.res.status).toBe(401);
    expect(refused.res.headers.get("WWW-Authenticate")).toMatch(/^Bearer /);
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
    const { client, tokens } = await signInClaude(authKey);
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
    const confidential = await signInClaude(authKey, {
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
