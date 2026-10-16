// The owner is created only by `pnpm provision` (docs/prd/01-identity-and-access.md):
// no HTTP route creates a user.
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { db } from "./db";

describe("no provisioning route", () => {
  it.each([
    ["POST", "/api/auth/provision"],
    ["POST", "/api/auth/register"],
    ["POST", "/api/auth/signup"],
    ["POST", "/api/provision"],
    ["POST", "/api/users"],
    ["PUT", "/api/auth/salt"],
  ])("%s %s is 404 and creates nothing", async (method, path) => {
    const res = await app.request(
      path,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authKey: "x", salt: "y", passphrase: "z" }),
      },
      env,
    );
    expect(res.status).toBe(404);
    const row = await db().prepare("SELECT count(*) AS n FROM user").first();
    expect(row).toEqual({ n: 0 });
  });
});
