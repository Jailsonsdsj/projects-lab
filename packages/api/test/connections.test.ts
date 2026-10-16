// /api/connections (F-16): the owner's Claude connections and Revoke, through
// the real Worker, with clients that went through the whole OAuth flow.

import type { Connection } from "@projects-lab/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import {
  bearer,
  mcp,
  seedOwner,
  sessionJwt,
  signInClaude,
  token,
} from "./oauth-flow";

let authKey: string;
let session: string;

beforeAll(async () => {
  authKey = await seedOwner();
  session = await sessionJwt();
});

const list = async () => {
  const res = await bearer("/api/connections", session);
  expect(res.status).toBe(200);
  return ((await res.json()) as { connections: Connection[] }).connections;
};

describe("/api/connections", () => {
  it("lists each client's grant, with its last write as last use", async () => {
    const web = await signInClaude(authKey, { client_name: "Claude" });
    await signInClaude(authKey, {
      client_name: "Claude Code",
      redirect_uris: ["http://localhost:33418/callback"],
    });
    await db()
      .prepare(
        "INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('c1', 'core_test_write', 'Claude', 1, '2026-10-16T09:00:00.000Z')",
      )
      .run();

    const connections = await list();
    const byName = Object.fromEntries(
      connections.map((c) => [c.clientName, c]),
    );
    expect(byName.Claude).toMatchObject({
      origin: "client.example",
      lastUsedAt: "2026-10-16T09:00:00.000Z",
    });
    expect(byName["Claude Code"]).toMatchObject({
      origin: "localhost",
      lastUsedAt: null,
    });
    expect(Date.parse(byName.Claude?.grantedAt ?? "")).not.toBeNaN();
    expect(web.tokens.access_token).toBeTruthy();
  });

  it("revokes one client: its next MCP call is refused, the other still works", async () => {
    const revoked = await signInClaude(authKey, { client_name: "To revoke" });
    const kept = await signInClaude(authKey, { client_name: "To keep" });
    const target = (await list()).find((c) => c.clientName === "To revoke");
    expect(target).toBeDefined();

    const res = await bearer(
      `/api/connections/${target?.id}`,
      session,
      "DELETE",
    );
    expect(res.status).toBe(204);

    const refused = await mcp(revoked.tokens.access_token ?? "", "tools/list");
    expect(refused.res.status).toBe(401);
    const refresh = await token({
      grant_type: "refresh_token",
      refresh_token: revoked.tokens.refresh_token ?? "",
      client_id: revoked.client.client_id,
    });
    expect(refresh.res.status).toBe(400);
    expect(refresh.body.error).toBe("invalid_grant");

    const still = await mcp(kept.tokens.access_token ?? "", "tools/list");
    expect(still.res.status).toBe(200);
    expect((await list()).map((c) => c.clientName)).not.toContain("To revoke");
  });

  it("answers 404 for a grant the owner doesn't hold", async () => {
    const res = await bearer(
      "/api/connections/no-such-grant",
      session,
      "DELETE",
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("needs a session (an OAuth token won't do)", async () => {
    const { tokens } = await signInClaude(authKey);
    expect(
      (await bearer("/api/connections", tokens.access_token ?? "")).status,
    ).toBe(401);
    expect((await bearer("/api/connections", "")).status).toBe(401);
  });
});
