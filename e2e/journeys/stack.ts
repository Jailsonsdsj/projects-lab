// Where the journeys' real stack lives (scripts/e2e-stack.sh), and the one way
// a journey writes behind the app's back: SQL on the same local D1, for what
// only Claude or time would do (a course recorded over MCP, a new login window).
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

export const PORT = 8788;
export const STATE = path.join(tmpdir(), "projects-lab-e2e");

const API = path.join(import.meta.dirname, "../../packages/api");

/** Runs SQL on the stack's local D1; returns the rows of the last statement. */
export function sql<T = Record<string, unknown>>(command: string): T[] {
  const out = execFileSync(
    path.join(API, "node_modules/.bin/wrangler"),
    [
      "d1",
      "execute",
      "projects-lab",
      "--local",
      "--persist-to",
      STATE,
      "--json",
      "--command",
      command,
    ],
    { cwd: API, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const results = JSON.parse(out) as { results: T[] }[];
  return results.at(-1)?.results ?? [];
}
