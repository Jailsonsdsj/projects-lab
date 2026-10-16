// The read-only GitHub client for `study-materials` (F-17; PRD 02, "Study
// content"; architecture §7). GET only: the app never writes to GitHub, and a
// test fails if anything here could. Don't rely on the Workers Cache API:
// metadata ETags live in D1 (`github_cache`), content is immutable by SHA.

const API = "https://api.github.com";
const USER_AGENT = "projects-lab"; // GitHub refuses requests without one

export type GitHubErrorCode =
  | "github_token_invalid"
  | "github_rate_limited"
  | "not_found";

/** A GitHub failure the routes turn into the PRD 02 error table. */
export class GitHubError extends Error {
  constructor(
    readonly code: GitHubErrorCode,
    message: string,
    /** Seconds until GitHub's rate limit resets (github_rate_limited). */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface GitHubDeps {
  token: string;
  /** "owner/name" */
  repo: string;
  db: D1Database;
  fetch: typeof fetch;
  now?: () => number;
}

/**
 * The token and repository from the Worker's env. Read outside any try: a
 * missing token is the named error, never an empty course list.
 */
export function githubDeps(env: Env, db: D1Database): GitHubDeps {
  const token = env.GITHUB_TOKEN;
  if (!token)
    throw new GitHubError(
      "github_token_invalid",
      "GITHUB_TOKEN is unset or expired: locally, set it in packages/api/.dev.vars; " +
        "in production the owner runs `wrangler secret put GITHUB_TOKEN` with a " +
        "fine-grained token (Contents: read) on study-materials.",
    );
  const repo = env.STUDY_MATERIALS_REPO as string | undefined;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error(
      "STUDY_MATERIALS_REPO must be owner/name in wrangler.jsonc `vars`.",
    );
  return { token, repo, db, fetch: (input, init) => fetch(input, init) };
}

/** One GET to the GitHub API, with its errors named. */
async function get(
  deps: GitHubDeps,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const response = await deps.fetch(`${API}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${deps.token}`,
      "User-Agent": USER_AGENT,
      ...headers,
    },
  });
  if (response.ok || response.status === 304) return response;

  const exhausted =
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0");
  if (exhausted) {
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
    const retryAfter =
      Number(response.headers.get("retry-after")) ||
      (reset > now ? reset - now : 60);
    throw new GitHubError(
      "github_rate_limited",
      `GitHub's rate limit is used up; try again in ${retryAfter} seconds.`,
      retryAfter,
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new GitHubError(
      "github_token_invalid",
      `GITHUB_TOKEN is unset or expired: GitHub answered ${response.status}. ` +
        "Check the token's expiry and that it can read study-materials.",
    );
  if (response.status === 404)
    throw new GitHubError("not_found", "No such file in study-materials.");
  throw new Error(`GitHub answered ${response.status} for ${path}`);
}

/** A file or folder entry, the fields the app uses. */
export interface GitHubEntry {
  type: "file" | "dir";
  name: string;
  path: string;
  /** The blob SHA: content is fetched and cached by it. */
  sha: string;
  size: number;
}

const entry = (raw: Record<string, unknown>): GitHubEntry => ({
  type: raw.type === "dir" ? "dir" : "file",
  name: String(raw.name),
  path: String(raw.path),
  sha: String(raw.sha),
  size: Number(raw.size ?? 0),
});

const encodePath = (path: string) =>
  path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

/**
 * A file's or folder's metadata by path. Sends the stored ETag; a 304 is
 * answered from D1 without reading a body (and costs no rate limit).
 */
export async function getMetadata(
  deps: GitHubDeps,
  path: string,
): Promise<GitHubEntry | GitHubEntry[]> {
  const cached = await deps.db
    .prepare(
      "SELECT etag, body_json AS bodyJson FROM github_cache WHERE path = ?",
    )
    .bind(path)
    .first<{ etag: string; bodyJson: string }>();

  const response = await get(
    deps,
    `/repos/${deps.repo}/contents/${encodePath(path)}`,
    cached ? { "If-None-Match": cached.etag } : {},
  );
  if (response.status === 304 && cached)
    return JSON.parse(cached.bodyJson) as GitHubEntry | GitHubEntry[];

  const raw = (await response.json()) as
    | Record<string, unknown>
    | Record<string, unknown>[];
  const value = Array.isArray(raw) ? raw.map(entry) : entry(raw);
  const etag = response.headers.get("etag");
  if (etag)
    await deps.db
      .prepare(
        `INSERT INTO github_cache (path, etag, body_json, fetched_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (path) DO UPDATE SET etag = excluded.etag,
           body_json = excluded.body_json, fetched_at = excluded.fetched_at`,
      )
      .bind(path, etag, JSON.stringify(value), new Date().toISOString())
      .run();
  return value;
}

/** A blob's bytes by SHA, streamed (never buffered in the Worker). */
export async function getBlob(
  deps: GitHubDeps,
  sha: string,
): Promise<ReadableStream<Uint8Array>> {
  const response = await get(deps, `/repos/${deps.repo}/git/blobs/${sha}`, {
    Accept: "application/vnd.github.raw+json",
  });
  if (!response.body) throw new Error(`GitHub sent no body for blob ${sha}`);
  return response.body;
}
