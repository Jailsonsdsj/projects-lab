// Study content by blob SHA (F-17, PRD 02): GET /api/study/content/<sha>/<name>.
// The SHA chooses the bytes; the name only sets the type and the download
// name. Immutable, so the service worker keeps it for offline reading.
import { Hono } from "hono";
import { database } from "../../core/db";
import { GitHubError, getBlob, githubDeps } from "../../core/github";
import type { LabEnv } from "../../core/lab";

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

const TYPES: Record<string, string> = {
  md: "text/markdown; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const STATUS = {
  github_token_invalid: 502,
  github_rate_limited: 503,
  not_found: 404,
  github_conflict: 409,
} as const;

export function contentRoutes() {
  const app = new Hono<LabEnv>();

  app.get("/content/:sha/:name", async (c) => {
    const sha = c.req.param("sha");
    if (!SHA.test(sha))
      return c.json({ error: "bad_request", message: "Not a blob SHA." }, 400);
    const name = c.req.param("name").replace(/[^\w.-]/g, "_");
    const extension = name.split(".").pop()?.toLowerCase() ?? "";

    // A missing token is the named 502 (PRD 02), never a 404 or an empty list.
    let deps: ReturnType<typeof githubDeps>;
    try {
      deps = githubDeps(c.env, database(c.env));
    } catch (error) {
      if (error instanceof GitHubError)
        return c.json({ error: error.code, message: error.message }, 502);
      throw error;
    }

    try {
      const body = await getBlob(deps, sha);
      return new Response(body, {
        headers: {
          "Content-Type": TYPES[extension] ?? "application/octet-stream",
          "Cache-Control": "private, max-age=31536000, immutable",
          "Content-Disposition": `inline; filename="${name}"`,
          // Served from the app's own origin: never sniffed, never scripted
          // (an SVG opened directly runs no script here).
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        },
      });
    } catch (error) {
      if (!(error instanceof GitHubError)) throw error;
      if (error.retryAfter) c.header("Retry-After", String(error.retryAfter));
      return c.json(
        { error: error.code, message: error.message },
        STATUS[error.code],
      );
    }
  });

  return app;
}
