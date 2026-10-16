// The OAuth flow as Claude's clients run it, through the real Worker entry:
// register → /oauth/authorize (passphrase, consent) → code → tokens. Shared by
// the OAuth (F-14) and MCP (F-15) tests.

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
import { expect } from "vitest";
import { signingKey } from "../src/core/auth/session";
import { db } from "./db";

export const ORIGIN = "https://lab.example"; // PUBLIC_ORIGIN in vitest.config.ts
export const RESOURCE = `${ORIGIN}/mcp`;
export const REDIRECT = "https://client.example/callback";

let ipCounter = 0;
export const freshIp = () => `10.2.0.${++ipCounter}`;

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  return { verifier, challenge };
}

export async function register(
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
export async function openConsent(
  clientId: string,
  challenge: string,
  state = "s1",
) {
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

export function decide(
  body: Record<string, unknown>,
  cookie: string,
  ip = freshIp(),
) {
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

export async function token(params: Record<string, string>, basic?: string) {
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
export async function signInClaude(
  authKey: string,
  metadata: Record<string, unknown> = {},
) {
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

export const bearer = (path: string, value: string, method = "GET") =>
  SELF.fetch(`${ORIGIN}${path}`, {
    method,
    headers: { Authorization: `Bearer ${value}` },
  });

export async function sessionJwt() {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: "owner", sv: 0, iat: now, exp: now + 60 },
    signingKey(env),
    "HS256",
  );
}

export async function kvDump(): Promise<string> {
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

/** The owner (1 KDF iteration); returns the authKey a browser would send. */
export async function seedOwner(): Promise<string> {
  const salt = generateSalt();
  const authKey = await deriveAuthKey("the owner's passphrase", salt, 1);
  await db()
    .prepare(
      `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at)
       VALUES ('owner', ?, ?, 1, 'UTC', '2026-01-01T00:00:00.000Z')`,
    )
    .bind(await hashAuthKey(authKey), salt)
    .run();
  return authKey;
}

/** A JSON-RPC response: a result, or a protocol error. */
export type JsonRpcMessage = {
  result?: unknown;
  error?: { code: number; message: string };
} | null;

/** One MCP JSON-RPC request through the Worker, as a client sends it. The
 *  test runner's fetch adds no Host header; real requests always carry one,
 *  and the MCP handler's DNS-rebinding guard reads it. */
export async function mcp(
  token: string | null,
  method: string,
  params: Record<string, unknown> = {},
) {
  const res = await SELF.fetch(`${ORIGIN}/mcp`, {
    method: "POST",
    headers: {
      Host: new URL(ORIGIN).host,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  // A JSON body, or a server-sent event whose data line is the message.
  const data = text.startsWith("{")
    ? text
    : (text.match(/^data: (.*)$/m)?.[1] ?? "null");
  return { res, message: JSON.parse(data) as JsonRpcMessage };
}

/** A tools/call's result: its JSON payload and whether it's an error. */
export async function callTool(
  token: string,
  name: string,
  args: Record<string, unknown> = {},
) {
  const { message } = await mcp(token, "tools/call", { name, arguments: args });
  const result = message?.result as {
    isError?: boolean;
    content: { text: string }[];
  };
  return {
    isError: Boolean(result.isError),
    value: JSON.parse(result.content[0]?.text ?? "null"),
  };
}
