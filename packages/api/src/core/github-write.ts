// The one GitHub write path (ST-13c; docs/architecture.md §2): the exam files
// the app writes for an exam taken in it. github.ts stays GET-only with the
// read token; this file has its own token (`GITHUB_WRITE_TOKEN`, Contents read
// and write, study-materials only). Only labs/study/exam-files.ts imports it,
// and that allows exam files only; a test checks both.
import { bytesToBase64 } from "@projects-lab/shared";
import { API, encodePath, GitHubError, USER_AGENT } from "./github";

export interface GitHubWriteDeps {
  token: string;
  /** "owner/name" */
  repo: string;
  fetch: typeof fetch;
}

/** The write token and the repository. Read outside any `try`: missing is its own named error. */
export function githubWriteDeps(env: Env): GitHubWriteDeps {
  const token = env.GITHUB_WRITE_TOKEN;
  if (!token)
    throw new GitHubError(
      "github_token_invalid",
      "GITHUB_WRITE_TOKEN is unset: locally, add it to packages/api/.dev.vars; " +
        "in production the owner runs `wrangler secret put GITHUB_WRITE_TOKEN` with a " +
        "fine-grained token (Contents: read and write) on study-materials only.",
    );
  const repo = env.STUDY_MATERIALS_REPO as string | undefined;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo))
    throw new Error(
      "STUDY_MATERIALS_REPO must be owner/name in wrangler.jsonc `vars`.",
    );
  return { token, repo, fetch: (input, init) => fetch(input, init) };
}

async function send(
  deps: GitHubWriteDeps,
  method: "PUT" | "DELETE",
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const response = await deps.fetch(
    `${API}/repos/${deps.repo}/contents/${encodePath(path)}`,
    {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${deps.token}`,
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (response.ok) return response;
  if (response.status === 401 || response.status === 403)
    throw new GitHubError(
      "github_token_invalid",
      `GITHUB_WRITE_TOKEN was refused (GitHub answered ${response.status}): check its expiry ` +
        "and that it can write Contents on study-materials.",
    );
  if (response.status === 409 || response.status === 422)
    throw new GitHubError(
      "github_conflict",
      `study-materials already has ${path}, or it changed meanwhile.`,
    );
  if (response.status === 429)
    throw new GitHubError(
      "github_rate_limited",
      "GitHub's rate limit is used up; try again in a minute.",
      Number(response.headers.get("retry-after")) || 60,
    );
  throw new Error(`GitHub answered ${response.status} to ${method} ${path}`);
}

/** Creates a new file (never overwrites one); answers the new blob's SHA. */
export async function putFile(
  deps: GitHubWriteDeps,
  path: string,
  text: string,
  message: string,
): Promise<{ sha: string }> {
  const response = await send(deps, "PUT", path, {
    message,
    content: bytesToBase64(new TextEncoder().encode(text)),
  });
  const reply = (await response.json()) as { content?: { sha?: string } };
  return { sha: String(reply.content?.sha ?? "") };
}

/** Deletes a file this path wrote, by its blob SHA. */
export async function deleteFile(
  deps: GitHubWriteDeps,
  path: string,
  sha: string,
  message: string,
): Promise<void> {
  await send(deps, "DELETE", path, { message, sha });
}

/** Replaces a file's content, given the blob SHA it has now; answers the new SHA. */
export async function updateFile(
  deps: GitHubWriteDeps,
  path: string,
  text: string,
  message: string,
  sha: string,
): Promise<{ sha: string }> {
  const response = await send(deps, "PUT", path, {
    message,
    content: bytesToBase64(new TextEncoder().encode(text)),
    sha,
  });
  const reply = (await response.json()) as { content?: { sha?: string } };
  return { sha: String(reply.content?.sha ?? "") };
}
