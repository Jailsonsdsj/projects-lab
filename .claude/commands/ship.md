---
description: Verify, commit and push the current backlog task to developer
---

Feature work is committed and pushed to `developer`. Never commit to `main`;
the owner decides when `developer` goes to `main`. No PRs until after launch.

1. Run `pnpm typecheck && pnpm lint && pnpm test`. Fix anything that fails.
2. Run `pnpm --filter web build` and `npx wrangler deploy --dry-run`, once the
   web build and the wrangler config exist. Until then, say they were skipped.
3. Re-read the "Done when" column for this task in docs/backlog.md and confirm
   each criterion is actually met. Say which, one line each.
4. Update the progress table at the top of docs/backlog.md, and rewrite this
   task's "Done when" cell as ✅ plus what was found.
   If the task added or changed anything the owner uses (a screen or view, an
   MCP tool, a pnpm script, a slash command, a script, a workflow), update
   docs/user-guide.md to match; `pnpm lint` checks that each is mentioned.
5. Make sure you are on `developer` (stop and say so if you are on `main`),
   then commit everything, backlog included, with a conventional-commit message
   derived from the diff that names the task ID. No `Co-Authored-By` trailer
   and no Claude signature of any kind.
6. Push with `git push origin developer` and report the commit hash.
