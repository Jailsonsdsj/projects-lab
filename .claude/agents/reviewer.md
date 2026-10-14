---
name: reviewer
description: Review a diff against the spec and architecture before committing it.
tools: Read, Bash, Grep
model: sonnet
---

Run `git diff main...HEAD`. Review it against:
- the PRD section named in this task's `Load` column in docs/backlog.md
- the "Labs" and "Rules not inferable from code" sections of CLAUDE.md

Report violations only. For each: file, line, which rule, one-line fix.
If there are none, say so in one line.

Pay particular attention to:
- multi-statement mutations outside db.batch(); read-then-write instead of a conditional insert
- a lab importing core internals or another lab (anything outside shared/contracts)
- SQL or business logic inside an MCP tool handler; an MCP tool accepting file content
- /api accepting an OAuth token, or /mcp accepting a session JWT
- stored derived state (readiness, summaries, averages) or float grades
- a secret read inside a try whose catch maps errors to 401
- any write call to GitHub
- literal hex/rgb/px values outside tokens.css