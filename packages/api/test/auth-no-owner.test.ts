// /api/auth before provisioning: this file's storage has no user row.

import { env } from "cloudflare:workers";
import { deriveAuthKey, generateSalt } from "@projects-lab/shared";
import { describe, expect, it } from "vitest";
import { verifyAuthKey } from "../src/core/auth/routes";
import { loginRequest, testApp } from "./auth-app";

describe("with no owner", () => {
  it("GET /api/auth/salt returns 404 not_provisioned", async () => {
    const res = await testApp().app.request("/api/auth/salt", {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_provisioned" });
  });

  it("login answers exactly like a wrong key: 401 invalid_passphrase, no cookie", async () => {
    const key = await deriveAuthKey("anything at all", generateSalt(), 1);
    const res = await testApp().app.request(
      "/api/auth/login",
      loginRequest(key, "198.51.100.50"),
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_passphrase" });
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("verifyAuthKey runs the same hash-and-compare with no stored hash", async () => {
    const key = await deriveAuthKey("anything at all", generateSalt(), 1);
    await expect(verifyAuthKey(key, null)).resolves.toBe(false);
    // An empty candidate must not match the empty stand-in either.
    await expect(verifyAuthKey("", null)).resolves.toBe(false);
  });
});
