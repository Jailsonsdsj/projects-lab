// The GitHub read client and study content by SHA (F-17, PRD 02). GitHub is
// replaced by a recorded fetch: every request it saw is checked.

import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type GitHubDeps,
  GitHubError,
  getBlob,
  getMetadata,
  githubDeps,
} from "../src/core/github";
import { app } from "../src/index";
import { db } from "./db";
import { seedOwner, sessionJwt } from "./oauth-flow";

const SHA = "a".repeat(40);
const API = "https://api.github.com/repos/owner/study-materials";

type Route = (request: Request) => Response;

/** A stand-in for GitHub: answers by URL and records every request. */
function fakeGitHub(routes: Record<string, Route>) {
  const requests: Request[] = [];
  const bodiesRead: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    const route = routes[request.url];
    if (!route) return new Response("not found", { status: 404 });
    const response = route(request);
    // Track which response bodies the client actually reads.
    if (!response.body) return response;
    const url = request.url;
    const tracked = response.body.pipeThrough(
      new TransformStream({
        start() {},
        transform(chunk, controller) {
          bodiesRead.push(url);
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(tracked, response);
  }) as typeof globalThis.fetch;
  return { fetch, requests, bodiesRead };
}

const deps = (fetch: typeof globalThis.fetch): GitHubDeps => ({
  token: "test-token",
  repo: "owner/study-materials",
  db: db(),
  fetch,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getMetadata", () => {
  const path = "Study Lab/frontend/react/react__fast-track.md";
  const url = `${API}/contents/Study%20Lab/frontend/react/react__fast-track.md`;
  const file = {
    type: "file",
    name: "react__fast-track.md",
    path,
    sha: SHA,
    size: 1200,
  };

  it("stores the ETag, then a 304 is answered from D1 without reading a body", async () => {
    let calls = 0;
    const github = fakeGitHub({
      [url]: (request) => {
        calls += 1;
        if (request.headers.get("If-None-Match") === '"v1"')
          return new Response(null, { status: 304 });
        return Response.json(file, { headers: { ETag: '"v1"' } });
      },
    });
    const first = await getMetadata(deps(github.fetch), path);
    expect(first).toEqual({
      type: "file",
      name: file.name,
      path,
      sha: SHA,
      size: 1200,
    });
    expect(github.bodiesRead).toEqual([url]);

    const second = await getMetadata(deps(github.fetch), path);
    expect(second).toEqual(first);
    expect(calls).toBe(2);
    expect(github.requests[1]?.headers.get("If-None-Match")).toBe('"v1"');
    expect(github.bodiesRead).toEqual([url]); // the 304 read nothing more
  });

  it("lists a folder's entries", async () => {
    const github = fakeGitHub({
      [`${API}/contents/Study%20Lab/frontend`]: () =>
        Response.json([
          {
            type: "dir",
            name: "react",
            path: "Study Lab/frontend/react",
            sha: SHA,
            size: 0,
          },
        ]),
    });
    expect(await getMetadata(deps(github.fetch), "Study Lab/frontend")).toEqual(
      [
        {
          type: "dir",
          name: "react",
          path: "Study Lab/frontend/react",
          sha: SHA,
          size: 0,
        },
      ],
    );
  });
});

describe("GitHub errors", () => {
  it("names a bad token, never an empty list", async () => {
    const github = fakeGitHub({
      [`${API}/contents/Study%20Lab`]: () =>
        Response.json({ message: "Bad credentials" }, { status: 401 }),
    });
    const failure = getMetadata(deps(github.fetch), "Study Lab");
    await expect(failure).rejects.toBeInstanceOf(GitHubError);
    await expect(failure).rejects.toMatchObject({
      code: "github_token_invalid",
    });
    await expect(failure).rejects.toThrow(/GITHUB_TOKEN is unset or expired/);
  });

  it("names a missing token, with the fix", () => {
    expect(() => githubDeps({ ...env, GITHUB_TOKEN: undefined }, db())).toThrow(
      /GITHUB_TOKEN is unset or expired.*wrangler secret put GITHUB_TOKEN/,
    );
  });

  it("says when GitHub's rate limit is used up, and for how long", async () => {
    const now = 1_760_000_000_000;
    const github = fakeGitHub({
      [`${API}/git/blobs/${SHA}`]: () =>
        new Response("limit", {
          status: 403,
          headers: {
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(now / 1000 + 120),
          },
        }),
    });
    await expect(
      getBlob({ ...deps(github.fetch), now: () => now }, SHA),
    ).rejects.toMatchObject({ code: "github_rate_limited", retryAfter: 120 });
  });
});

describe("GET /api/study/content/:sha/:name", () => {
  let session: string;

  beforeAll(async () => {
    await seedOwner();
    session = await sessionJwt();
  });

  const content = (path: string, withSession = true) =>
    app.request(
      path,
      withSession ? { headers: { Authorization: `Bearer ${session}` } } : {},
      env,
    );

  /** GitHub, as the route reaches it through the global fetch. */
  const serveBlob = (route: Route) => {
    const github = fakeGitHub({ [`${API}/git/blobs/${SHA}`]: route });
    vi.spyOn(globalThis, "fetch").mockImplementation(github.fetch);
    return github;
  };

  it("serves the blob as immutable, typed by the name's extension", async () => {
    const github = serveBlob(() => new Response("# React\n"));
    const res = await content(`/api/study/content/${SHA}/react__fast-track.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(res.headers.get("Content-Type")).toBe(
      "text/markdown; charset=utf-8",
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await res.text()).toBe("# React\n");

    const [request] = github.requests;
    expect(request?.headers.get("Accept")).toBe(
      "application/vnd.github.raw+json",
    );
    expect(request?.headers.get("User-Agent")).toBe("projects-lab");
    expect(request?.headers.get("Authorization")).toBe(
      "Bearer test-github-token",
    );
  });

  it("proxies images the same way, sandboxed", async () => {
    serveBlob(() => new Response("<svg/>"));
    const res = await content(`/api/study/content/${SHA}/diagram.svg`);
    expect(res.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(res.headers.get("Content-Security-Policy")).toMatch(/sandbox/);
  });

  it("maps GitHub's errors to the PRD's: 502 token, 503 rate limit, 404", async () => {
    serveBlob(() => new Response("", { status: 401 }));
    const bad = await content(`/api/study/content/${SHA}/a.md`);
    expect(bad.status).toBe(502);
    expect(await bad.json()).toMatchObject({ error: "github_token_invalid" });

    serveBlob(
      () => new Response("", { status: 429, headers: { "retry-after": "30" } }),
    );
    const limited = await content(`/api/study/content/${SHA}/a.md`);
    expect(limited.status).toBe(503);
    expect(limited.headers.get("Retry-After")).toBe("30");

    serveBlob(() => new Response("", { status: 404 }));
    expect((await content(`/api/study/content/${SHA}/a.md`)).status).toBe(404);
  });

  it("refuses a malformed SHA and a missing session", async () => {
    expect((await content("/api/study/content/not-a-sha/a.md")).status).toBe(
      400,
    );
    expect(
      (await content(`/api/study/content/${SHA}/a.md`, false)).status,
    ).toBe(401);
  });
});

describe("no write call to GitHub", () => {
  it("the client sends GET only, and nothing else in the Worker calls GitHub", () => {
    const sources = import.meta.glob<string>("../src/**/*.ts", {
      eager: true,
      query: "?raw",
      import: "default",
    });
    const client = sources["../src/core/github.ts"] ?? "";
    expect(client).toContain('method: "GET"');
    expect(client).not.toMatch(/method:\s*"(?!GET")/);
    const callers = Object.entries(sources)
      .filter(([, source]) => source.includes("api.github.com"))
      .map(([path]) => path);
    expect(callers).toEqual(["../src/core/github.ts"]);
  });
});
