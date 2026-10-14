---
description: Verify and commit the current backlog task directly on main
---

Pre-launch flow: commit straight to `main`, no branch and no PR. The PR flow
returns after the app launches.

1. Run `pnpm typecheck && pnpm lint && pnpm test`. Fix anything that fails.
2. Run `pnpm --filter web build` and `npx wrangler deploy --dry-run`, once the
   web build and the wrangler config exist. Until then, say they were skipped.
3. Re-read the "Done when" column for this task in docs/backlog.md and confirm
   each criterion is actually met. Say which, one line each.
4. Update the progress table at the top of docs/backlog.md, and rewrite this
   task's "Done when" cell as ✅ plus what was found.
5. Make sure you are on `main`, then commit everything, backlog included, with
   a conventional-commit message derived from the diff that names the task ID.
   No `Co-Authored-By` trailer and no Claude signature of any kind.
6. Do not push. Report the commit hash and leave pushing to the owner.
