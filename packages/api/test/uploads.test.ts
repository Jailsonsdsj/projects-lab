// Signed uploads (F-18, PRD 02 "Uploads"): Claude's whole path through the
// real Worker, then every refusal, each checked against R2: nothing written.

import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  type CreatedUpload,
  type CreateUploadInput,
  UPLOAD_MAX_BYTES,
} from "@projects-lab/shared";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { createUpload, uploadSigningKey } from "../src/core/uploads";
import { uploadsRoutes } from "../src/core/uploads-routes";
import { db } from "./db";
import { callTool, mcp, seedOwner, signInClaude } from "./oauth-flow";

const PDF = "application/pdf";
const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill);
const input = (n = 2048): CreateUploadInput => ({
  kind: "resume",
  filename: "Jane Doe CV.pdf",
  contentType: PDF,
  bytes: n,
});

let token: string;
beforeAll(async () => {
  token = (await signInClaude(await seedOwner())).tokens.access_token ?? "";
});

const isError = (message: { result?: unknown } | null) =>
  Boolean((message?.result as { isError?: boolean } | undefined)?.isError);

/** The PUT route on a clock the test controls. In-Worker requests carry no
 *  Content-Length (only real network requests do), so it's set here as curl
 *  would; `length` overrides it to model a client that lies. */
function putApp(clock: { now: number }) {
  const app = new Hono<{ Bindings: Env }>();
  app.route(
    "/api/uploads",
    uploadsRoutes(() => clock.now),
  );
  return (
    upload: CreatedUpload,
    body: Uint8Array | ReadableStream<Uint8Array>,
    type = PDF,
    length = body instanceof Uint8Array ? body.byteLength : 0,
  ) =>
    app.request(
      new URL(upload.uploadUrl).pathname,
      {
        method: "PUT",
        headers: { "Content-Type": type, "Content-Length": String(length) },
        body,
      },
      env,
    );
}

const files = env.FILES as R2Bucket;
const stored = async (uploadId: string) =>
  (await files.list({ prefix: `uploads/${uploadId}/` })).objects;

describe("Claude's path", () => {
  it("core_create_upload, then curl's PUT, puts exactly that file in R2", async () => {
    const created = await callTool(token, "core_create_upload", input());
    expect(created.isError).toBe(false);
    const upload = created.value as CreatedUpload;
    expect(upload.uploadUrl).toMatch(
      /^https:\/\/lab\.example\/api\/uploads\/[\w-]+\.\d+\.[\w-]+$/,
    );

    const res = await SELF.fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": PDF },
      body: bytes(2048),
    });
    expect(res.status).toBe(204);

    const [object] = await stored(upload.uploadId);
    expect(object?.key).toBe(`uploads/${upload.uploadId}/Jane_Doe_CV.pdf`);
    const file = await files.get(object?.key ?? "");
    expect(file?.httpMetadata?.contentType).toBe(PDF);
    expect(new Uint8Array(await (file as R2ObjectBody).arrayBuffer())).toEqual(
      bytes(2048),
    );
    const row = await db()
      .prepare("SELECT used_at FROM upload WHERE id = ?")
      .bind(upload.uploadId)
      .first<{ used_at: string | null }>();
    expect(row?.used_at).toBeTruthy();
    const audit = await db()
      .prepare("SELECT ok FROM mcp_call WHERE tool = 'core_create_upload'")
      .all();
    expect(audit.results).toEqual([{ ok: 1 }]);
  });

  it("refuses to create an upload over the cap or of a type not allowed", async () => {
    const tooBig = await mcp(token, "tools/call", {
      name: "core_create_upload",
      arguments: input(UPLOAD_MAX_BYTES + 1),
    });
    expect(isError(tooBig.message)).toBe(true);
    const png = await mcp(token, "tools/call", {
      name: "core_create_upload",
      arguments: { ...input(), contentType: "image/png" },
    });
    expect(isError(png.message)).toBe(true);
    expect(
      (
        await db()
          .prepare("SELECT COUNT(*) AS n FROM upload")
          .first<{ n: number }>()
      )?.n,
    ).toBe(1); // only the first test's upload
  });
});

describe("PUT /api/uploads/:token refuses, and writes nothing to R2", () => {
  const t0 = Date.parse("2026-10-16T12:00:00Z");

  it("after 10 minutes: 410", async () => {
    const clock = { now: t0 };
    const upload = await createUpload(db(), env, input(), t0);
    clock.now = t0 + 10 * 60 * 1000;
    const res = await putApp(clock)(upload, bytes(2048));
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: "upload_expired" });
    expect(await stored(upload.uploadId)).toEqual([]);
  });

  it("a second time: 409, and the first file stays", async () => {
    const clock = { now: t0 };
    const put = putApp(clock);
    const upload = await createUpload(db(), env, input(), t0);
    expect((await put(upload, bytes(2048, 1))).status).toBe(204);
    const again = await put(upload, bytes(2048, 2));
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "upload_used" });
    const [object] = await stored(upload.uploadId);
    const file = (await files.get(object?.key ?? "")) as R2ObjectBody;
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes(2048, 1));
  });

  it("not the declared size: 413", async () => {
    const upload = await createUpload(db(), env, input(2048), t0);
    const res = await putApp({ now: t0 })(upload, bytes(4096));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "upload_too_large" });
    expect(await stored(upload.uploadId)).toEqual([]);
  });

  // Only reachable inside the Worker: on a real connection the runtime holds a
  // request to its Content-Length. This proves FixedLengthStream stops it
  // before R2 keeps anything. The runtime's test plumbing then logs two
  // "uncaught exception … client disconnected" lines from its own side of
  // the request stream; they're expected, not a failure in acceptUpload.
  it("a body longer than its own Content-Length: stopped before R2 keeps it", async () => {
    const upload = await createUpload(db(), env, input(2048), t0);
    // A stream that accepts being cancelled, as a real connection would be.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes(4096));
        controller.close();
      },
    });
    const res = await putApp({ now: t0 })(upload, body, PDF, 2048);
    expect(res.status).toBe(413);
    expect(await stored(upload.uploadId)).toEqual([]);
  });

  it("not the declared type: 415", async () => {
    const upload = await createUpload(db(), env, input(), t0);
    const res = await putApp({ now: t0 })(upload, bytes(2048), "text/html");
    expect(res.status).toBe(415);
    expect(await res.json()).toMatchObject({ error: "upload_wrong_type" });
    expect(await stored(upload.uploadId)).toEqual([]);
  });

  it("a tampered or borrowed URL: 403", async () => {
    const put = putApp({ now: t0 });
    const upload = await createUpload(db(), env, input(), t0);
    const other = await createUpload(db(), env, input(), t0);
    const tampered = {
      ...upload,
      uploadUrl: upload.uploadUrl.replace(/.$/, (c) => (c === "A" ? "B" : "A")),
    };
    expect((await put(tampered, bytes(2048))).status).toBe(403);
    // another upload's signature on this upload's id
    const [, , sig] =
      new URL(other.uploadUrl).pathname.split("/").pop()?.split(".") ?? [];
    const [id, exp] =
      new URL(upload.uploadUrl).pathname.split("/").pop()?.split(".") ?? [];
    const borrowed = {
      ...upload,
      uploadUrl: `https://lab.example/api/uploads/${id}.${exp}.${sig}`,
    };
    expect((await put(borrowed, bytes(2048))).status).toBe(403);
    expect(await stored(upload.uploadId)).toEqual([]);
  });

  it("without its signing key, the Worker names the fix", () => {
    expect(() => uploadSigningKey({})).toThrow(/UPLOAD_SIGNING_KEY is not set/);
  });
});

describe("no tool accepts file content as an argument", () => {
  it("every string any tool takes is short (≤ 1000) or one of a fixed list", async () => {
    const { message } = await mcp(token, "tools/list");
    const tools = (
      (message?.result ?? { tools: [] }) as {
        tools: { name: string; inputSchema: unknown }[];
      }
    ).tools;
    const unbounded: string[] = [];
    const walk = (schema: unknown, where: string) => {
      if (!schema || typeof schema !== "object") return;
      const s = schema as Record<string, unknown>;
      if (
        s.type === "string" &&
        !Array.isArray(s.enum) &&
        !(typeof s.maxLength === "number" && s.maxLength <= 1000)
      )
        unbounded.push(where);
      for (const [key, value] of Object.entries(s.properties ?? {}))
        walk(value, `${where}.${key}`);
      if (s.items) walk(s.items, `${where}[]`);
      for (const branch of ["anyOf", "oneOf", "allOf"] as const)
        for (const [i, sub] of ((s[branch] as unknown[]) ?? []).entries())
          walk(sub, `${where}|${i}`);
    };
    for (const tool of tools) walk(tool.inputSchema, tool.name);
    expect(tools.length).toBeGreaterThanOrEqual(3);
    expect(unbounded).toEqual([]);
  });
});
