# Study roadmap

Gap analysis and roadmap proposals: Claude suggests what to learn next and, once the owner agrees, adds it to the backlog. The app adds no screen and no table for it; the roadmap is a conversation that ends in `study_add_topics` (`10`). Source: cs-learning-lab `study-course-builder` Workflow E.

## Flow (`/roadmap`, "what should I learn next?")

1. **Ask at most three short questions:** target role or stack, current strengths, weekly study time. Skip any the context already answers.
2. **Read what's known** over MCP:
   - the backlog (`study_list_backlog`): never propose a topic it already has, at any status;
   - the Career profile and tracked jobs (`career_*` tools, Career PRD `20`–`21`): their roles are the target, and their gaps are already in the backlog through the Study contract (`ensureTopics`), so they aren't proposed again.
3. **Propose** topics grouped by area, each with a level and a priority, ordered so prerequisites come first, as one compact table in the chat.
4. **After the owner confirms or edits**, add them as Not started with `study_add_topics` (skills found or created by the registry rules, `10`). Nothing is added before that.

## Where it runs

Any surface (Claude Code, claude.ai, the mobile app): it needs only MCP tools, no repository. The learner profile ("experienced front-end engineer, aiming at full-stack") comes from the Career profile when it exists; until then Claude asks or reads `study-materials/CLAUDE.md` in Claude Code.

## Boundaries

- **The Study lab's code never reads Career data.** Claude combines the two over MCP; the only code path from Career to Study is the Study contract (architecture §4).
- **No prerequisite links are stored.** Order is expressed by priority (P1 first) and, when it matters, the note ("after BE-03").
- **No roadmap history.** A roadmap's result is the topics it added (each MCP write is audited in `mcp_call`).

## Invariants

None of its own: it writes only through `study_add_topics`, held by S-1 to S-9.

## Decisions

Settled by the owner on 2026-10-19, as proposed in the draft:

1. **No roadmap screen or table**; the backlog is the roadmap's output.
2. **Claude reads Career data itself** over MCP; Study code doesn't.
3. **Prerequisites as priority and note**, not stored links.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
