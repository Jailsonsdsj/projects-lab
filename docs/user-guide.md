# Projects Lab — User guide

How to use Projects Lab day to day, how to run its workflows with Claude, and every command in this repository. It's for the owner. The specs behind each feature are in [`docs/prd/`](prd/) ([index](README.md)); task status is in [`backlog.md`](backlog.md).

**This guide is kept current by rule:** any change that adds or changes something you use (a screen, an MCP tool, a `pnpm` command, a slash command, a script or a workflow) updates this file in the same commit, and `pnpm lint` fails when a tool, route, command or script is missing from it. See [Keeping this guide current](#keeping-this-guide-current).

## Contents

1. [Getting started](#getting-started)
2. [Home](#home)
3. [Study Lab](#study-lab)
4. [Career Lab](#career-lab)
5. [Connections and Settings](#connections-and-settings)
6. [Working with Claude](#working-with-claude)
7. [Workflows](#workflows)
8. [MCP tool reference](#mcp-tool-reference)
9. [Backup and restore](#backup-and-restore)
10. [Developing Projects Lab](#developing-projects-lab)
11. [Troubleshooting](#troubleshooting)
12. [Keeping this guide current](#keeping-this-guide-current)

---

## Getting started

**What it is.** One web app with two labs that share data: **Study Lab** (what you're learning, courses, exams, grades) and **Career Lab** (profile, jobs, documents, job search, interviews). The app has no AI of its own: Claude reads and writes it through its MCP connector, and you use the app to see, check and edit.

**Open it.** Production: `https://projects-lab.jailson-junior36.workers.dev`. On iPhone or iPad, Share → **Add to Home Screen** installs it as an app. When a new version is deployed, a toast says "A new version of Projects Lab is ready." with **Reload**.

**Sign in** (`/login`). Type your passphrase and **Sign in**. The key is derived in your browser; the passphrase never leaves the device.

- A session lasts **90 days** on that device. When it expires, the login screen says "Session expired" and you sign in again.
- **10 attempts per 15 minutes**, successful or not. After that, wait for the window to end.
- The owner account is created once with `pnpm provision` (see [owner-only steps](#owner-only-steps)); there is no sign-up.

**Find your way around.**

- **Phone:** tabs at the bottom for the current lab. **Tablet and desktop:** a side rail with the lab's tabs and Settings at the bottom.
- **Lab switcher** (the button with the lab's name at the top): Home, Study Lab, Career Lab. Each lab has its own accent colour.
- Every screen has distinct states: loading, empty (with what to do next), error (with **Retry**) and **offline** ("You're offline", with **Retry**). Screens you've opened show their last saved copy while offline.

## Home

`/`: one card per lab.

- **Study card:** topics in progress, not started, your average grade, and **Continue** for the course you're on (it opens the course).
- **Career card:** tracked jobs and the best match's readiness and gaps.
- **Backup reminder:** "No backup yet." or "No backup in a while." (after 30 days) with **Back up**, which opens Settings.

## Study Lab

### Backlog — `/study`

Every topic you want to learn, grouped by **area** (CS Fundamentals, Frontend, Backend, Databases and Data, DevOps and Cloud, Software Architecture, Security, plus any you add). Each topic has an ID like `FE-03`, a level (Fast track, Essential, Specialized), a priority (P1 next up, P2 soon, P3 later), a status (Not started, In progress, Done) and, once graded, a grade.

- **Add a topic:** **Add** (or **Add a topic** on an empty backlog) → skill (it tells you if it matches an existing skill or is new), area (or a new area with a two-letter prefix), level, priority → **Add to backlog**. A skill already in the backlog is never duplicated.
- **Edit:** tap a topic → its sheet: level, priority, status, note; its exams with grades; **Remove** (with confirmation).
- **Filter and search:** status tabs (All, Not started, In progress, Done) and the search box.

### Courses — `/study/courses`

Courses Claude recorded, grouped by area, in progress first. Tap one to read it.

**Reader** (`/study/courses/:courseId`): full screen, one lesson per page with previous and next, the lesson outline (a sheet on phone, beside the text on tablet), diagrams, and **Show answer key** per lesson so answers stay hidden while you study. A course you've opened once reads offline.

### Grades — `/study/grades`

Graded exams, newest first, with the average grade of Done topics. Tap an exam to open it (`/study/exams/:examId`): its questions, the results once graded, and **Open the PDF**.

## Career Lab

### Jobs — `/career`

Three views at the top:

- **Tracked:** your jobs, best readiness first, each with readiness (`ready/required`), status and fit decision. Tap one to open the **job** (`/career/jobs/:jobId`):
  - the readiness meter: **Verified** (passed a Study exam with ≥ 7.0), **Declared** (in your profile) and **Gap**;
  - each requirement with where it stands ("Passed FE-03 · 8.5", "In your profile · no exam yet", "Not in your profile or backlog");
  - **Add to Study backlog** on a gap: pick the area and priority, and the topic lands in Study with the job named in its note;
  - status (evaluated → applied → interviewing → offer / rejected / withdrawn), notes, the fit score and the posting.
- **Openings** (`?view=openings`): what the weekly job search found. **Keep**, **Dismiss**, or **Track** (copies a prompt for Claude to map it as a job). Openings still new after 30 days are muted.
- **Search criteria** (`?view=criteria`): lanes, rate floor, hours, work shape and the rest of what the weekly search uses. Only you edit them; the search only reads them.

### Skills — `/career/skills`

Your declared skills by level, each **verified** (Study proved it) or **declared**, plus "Verified in Study, not declared" suggestions.

### Profile — `/career/profile`

Your photo (upload or remove, up to 2 MB), person and contact, links, experiences with their facts (unverified facts are badged; verify them here), education and languages. Everything edits through sheets.

**Copy panel:** "Tap Copy, then paste into the form": your standard fields and standard answers, and, for a job you pick, its form answers, self-introduction and salary range. It works offline.

### Documents — `/career/documents`

The app stores no documents: Claude writes them and gives them to you. This tab is each job's **application kit**: which facts the last document used, the self-introduction, the salary range and the form answers, with **Ask Claude for a document** (copies a prompt such as "Write my resume for … with `career_document_brief`").

### Interviews — `/career/interviews`

- **Answers** (default view): prepared answers, grouped by job and then general, with a Google Drive video if you attached one (paste a Drive link; the video stays in Drive).
- **Stories** (`?view=stories`): STAR stories (situation, task, action, result) with their skills and facts.
- **Practice** (`?view=practice`): the drill log: date, mode, weakest answers and the fix.

## Connections and Settings

### Connections — `/connections`

Every Claude client you've allowed (Claude Code, claude.ai, the apps), when it was granted and last used, and **Revoke**. A revoked client must sign in again.

### Settings — `/settings`

- **Change passphrase:** current, new, confirm. Every other device is signed out; this one stays signed in.
- **Backup:** **Download backup** and when the last one was. See [Backup and restore](#backup-and-restore).
- **Session:** **Log out** signs out this device only.

## Working with Claude

### Connect a surface

When Claude asks you to sign in, `/oauth/authorize` shows the same login screen, then "Allow *client* to read and write Projects Lab": **Allow**.

| Surface | How to connect |
|---|---|
| Claude Code (terminal, VS Code) | `claude mcp add --transport http --scope user projects-lab https://projects-lab.jailson-junior36.workers.dev/mcp`, then `/mcp` → Authenticate |
| claude.ai, desktop and the iPhone/iPad app | Settings → Connectors → add a custom connector with the `/mcp` URL above. The apps use the connector added on claude.ai |
| Claude Code on the web | Uses the claude.ai connector |
| Scheduled routines | Attach the **Projects-Lab** connector (and Gmail, if it emails) to the routine itself at claude.ai/code/routines; routines don't inherit account connectors |

To check a connection, ask Claude to run `core_whoami`: it answers with your owner ID, timezone, the client name and the labs.

### How Claude works with the app

- Every write Claude makes is recorded (tool, client, time, success); Connections shows when each client was last used.
- Retrying a write is safe: Claude sends an `idempotencyKey`, and a retry returns the first result.
- Claude never sends files to the app. Documents come to you as downloads; the only file the app stores is your photo.
- A job posting you paste is data, not instructions: commands hidden in it are ignored.

## Workflows

### Plan what to learn — `/roadmap` (any surface)

Ask "what should I learn next?". Claude asks up to three questions, reads your backlog, profile and tracked jobs, proposes topics by area with level and priority, and adds them with `study_add_topics` only after you confirm.

### Add topics and check the backlog — `/add`, `/backlog` (any surface)

"Add Kubernetes to DevOps, P1" → `study_add_topics`. "Show my backlog" → `study_list_backlog` / `study_get_summary`. Or use the Backlog tab yourself.

### Take a course — `/learn <topic>` (Claude Code, in `study-materials`)

Courses are made only in a Claude Code session opened in the `study-materials` repository (`git pull` first). Claude writes the course, pushes it, and records it with `study_record_course`; the topic moves to In progress and the course appears in Courses.

### Take the final exam — `/final-exam` (Claude Code, in `study-materials`)

Claude writes the exam (Markdown and PDF), pushes it and records it with `study_record_exam`. You answer in the session; Claude grades it, records the grade with `study_record_grade` (the topic becomes Done), and suggests what's next. A grade of 7.0 or more makes the skill **Verified** for every job that needs it. A retake is a new attempt; a correction replaces the grade.

### Map a job posting (any surface)

Paste the posting and ask Claude to map it. Claude extracts the requirements (required, nice to have, not mapped), matches skills (`core_find_skill`), scores the fit and saves it with `career_add_job`. The app computes readiness. Then send gaps to Study, from Claude (`career_send_gaps`) or with **Add to Study backlog** on the job screen.

### Write a resume or cover letter (any surface)

Ask "Write my resume for *job*" (or copy the prompt from Documents). Claude calls `career_document_brief`, asks you to confirm any unverified fact first, writes the document in the posting's language and gives you the file, then saves what it used with `career_save_selection`. The self-introduction, salary range and form answers are saved with `career_save_job_kit` after you agree on them.

### Weekly job search (routine)

A Claude Code routine scans for openings every Monday, saves them with `career_save_openings` and emails you a digest. Its setup and prompt are in [`docs/routines/job-search.md`](routines/job-search.md). Review the results in Jobs → Openings.

### Interview practice (any surface)

Ask Claude to drill you ("practise negotiation for Evalco"). It reads your weak spots with `career_list_drills`, runs the drill and logs it with `career_log_drill`. Prepared answers and stories are saved with `career_save_answer` and `career_save_story`.

### Keep the profile current (any surface or the app)

"Add this experience…", "this fact is confirmed" → `career_save_experience`, `career_save_fact`, `career_declare_skill`. Or edit in Profile and Skills.

## MCP tool reference

Read tools change nothing. Write tools take an optional `idempotencyKey` and are audited.

**Platform**

| Tool | Kind | What it does |
|---|---|---|
| `core_whoami` | read | Proves the connection: owner, client, labs |
| `core_find_skill` | read | Finds a skill by name or alias |

**Study Lab**

| Tool | Kind | What it does |
|---|---|---|
| `study_list_backlog` | read | The backlog, optionally by area or status |
| `study_get_summary` | read | Counts, average grade and the suggested next topic |
| `study_add_topics` | write | Adds topics; an existing skill is never duplicated |
| `study_update_topic` | write | Changes a topic's level, priority, status or note |
| `study_remove_topic` | write | Removes a topic (soft) |
| `study_add_area` | write | Adds an area with a two-letter prefix |
| `study_record_course` | write | Records a course pushed to `study-materials` |
| `study_list_courses` | read | Recorded courses, optionally for one topic |
| `study_record_exam` | write | Records an exam's Markdown and PDF |
| `study_record_grade` | write | Records or corrects a grade; the topic becomes Done |
| `study_list_exams` | read | Exams and grades, optionally for one topic |

**Career Lab**

| Tool | Kind | What it does |
|---|---|---|
| `career_get_profile` | read | The whole profile, compact |
| `career_update_person` | write | Name, headline, contact, summary, languages |
| `career_set_links` | write | Replaces the profile links |
| `career_save_experience` | write | Adds or edits an experience |
| `career_save_education` | write | Adds or edits an education entry |
| `career_save_fact` | write | Adds or edits a fact; verified only after you confirm |
| `career_declare_skill` | write | Declares a skill with level and years |
| `career_remove_item` | write | Removes an experience, education or fact (soft) |
| `career_remove_skill` | write | Removes a declared skill |
| `career_add_job` | write | Saves a mapped posting with its requirements and fit |
| `career_list_jobs` | read | Tracked jobs with readiness |
| `career_get_job` | read | One job: requirements, readiness, next gaps |
| `career_update_job` | write | Status, note or fit |
| `career_update_requirement` | write | A requirement's type or skill |
| `career_send_gaps` | write | Sends gaps to the Study backlog |
| `career_remove_job` | write | Stops tracking a job; its Study topics stay |
| `career_document_brief` | read | Everything a document for a job is written from |
| `career_save_selection` | write | Which items a document used |
| `career_save_job_kit` | write | Self-introduction, salary range and form answers |
| `career_save_standard_answers` | write | Your standard form answers |
| `career_get_search_criteria` | read | The job search criteria (edited only in the app) |
| `career_save_openings` | write | Saves openings found; known URLs are skipped |
| `career_list_openings` | read | Openings, paged |
| `career_update_opening` | write | Keeps or dismisses an opening |
| `career_list_stories` | read | Interview stories |
| `career_save_story` | write | Adds or edits a STAR story |
| `career_list_answers` | read | Prepared answers, by job or general |
| `career_save_answer` | write | Adds or edits an answer, with a Drive video link |
| `career_log_drill` | write | Logs a practice drill |
| `career_list_drills` | read | Recent drills and weak spots |

## Backup and restore

**Back up:** Settings → Backup → **Download backup** saves `projects-lab-backup-<date>.json`: every row of your data and your photo. It contains your passphrase's hash, so keep it somewhere private (not in a shared folder). Home reminds you after 30 days.

**Restore** (into a fresh environment):

1. `pnpm tsx scripts/restore-backup.ts <backup.json>` checks the backup against the repo's migrations and writes `scripts/out/restore/restore.sql` plus the files.
2. It prints the commands: run the `--local` ones to check on a local database, then the `--remote` ones for production (yours to run).

For a recent mistake, Cloudflare's **D1 Time Travel** restores the whole database to a point in time (`wrangler d1 time-travel restore`, yours to run). Details: [`prd/90-services.md`](prd/90-services.md).

## Developing Projects Lab

### The task loop (Claude Code in this repository)

1. **`/task <ID>`**: Claude reads the backlog row and only its Load files, restates the task, and plans; a task touching more than three files waits for your approval.
2. Claude builds, tests and break-tests it, takes screenshots for UI work, and runs the full checks.
3. **`/ship`**: typecheck, lint, tests, web build and wrangler dry run; the Done-when check; the backlog row and progress table; a commit to `developer` and a push.

`main` changes only through pull requests you merge; merging deploys.

### Slash commands

| Command | What it does |
|---|---|
| `/task <ID>` | Start a backlog task: read its row and Load files, plan, wait for approval |
| `/ship` | Check, record in the backlog, commit to `developer` and push |
| `/ds <component>` | Build or change a UI component from the design system only |

Agents Claude can use here: `explore` (find where code lives), `reviewer` (review a diff against the spec), `test-runner` (run tests, report failures).

### `pnpm` commands

| Command | What it does |
|---|---|
| `pnpm dev` | Runs the web app (Vite) and the Worker (`wrangler dev`) locally |
| `pnpm seed` | Resets the local database and files and loads sample data (dev passphrase `projects-lab-dev`); stop `pnpm dev` first |
| `pnpm test` | Unit and integration tests in every package (if the machine is busy, run one package: `pnpm --filter api test`) |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` | Biome, plus the boundary, workflow, KDF, token and user-guide checks |
| `pnpm lint:tokens` | Only the design-token check (no literal colours or sizes) |
| `pnpm format` | Formats with Biome |
| `pnpm e2e` | Browser tests in WebKit at four widths, against a mocked API |
| `pnpm e2e:journeys` | End-to-end journeys on the real local stack (Worker, D1 and the built app) |
| `pnpm verify:triggers` | Checks every database rule on a throwaway local database |
| `pnpm db:generate` | Generates a migration from the Drizzle schema |
| `pnpm types` | Regenerates the Worker's binding types |
| `pnpm design:extract` | Pulls tokens and component CSS out of the design bundle |
| `pnpm provision` | Creates the owner account (`--local` or `--remote`); the remote run is yours |

### Scripts

| Script | What it does |
|---|---|
| `scripts/restore-backup.ts` | A Settings backup → SQL and files to restore it |
| `scripts/import-backlog.ts` | cs-learning-lab's backlog → SQL to import it once |
| `scripts/import-resume.ts` | The master resume → SQL plus a report of what to confirm |
| `scripts/provision.ts` | Behind `pnpm provision` |
| `scripts/seed.sh` | Behind `pnpm seed` |
| `scripts/e2e-stack.sh` | Starts the real local stack for `pnpm e2e:journeys` |
| `scripts/verify-triggers.sh` | Behind `pnpm verify:triggers` |
| `scripts/design-extract.ts` | Behind `pnpm design:extract` |
| `scripts/check-boundaries.sh`, `check-workflows.sh`, `check-kdf-constant.sh`, `check-tokens.sh`, `check-user-guide.sh` | The checks inside `pnpm lint` |

Run the `.ts` scripts with `pnpm tsx scripts/<name>.ts …`. Their output goes to `scripts/out/`, which is never committed (it can hold personal data).

### Owner-only steps

Claude never runs these; they're yours:

- `pnpm provision --remote` (create the production owner).
- Any `--remote` command: `wrangler d1 execute … --remote` for imports and restores, `wrangler d1 time-travel restore`.
- `wrangler secret put TOKEN_SIGNING_KEY` / `GITHUB_TOKEN`.
- Merging `developer` into `main` (that deploys).
- Creating and changing routines at claude.ai/code/routines.

### Local setup

1. `pnpm install`.
2. `cp packages/api/.dev.vars.example packages/api/.dev.vars` and fill in `TOKEN_SIGNING_KEY`, `GITHUB_TOKEN` (read-only on `study-materials`) and `PUBLIC_ORIGIN`.
3. `pnpm seed`, then `pnpm dev`, and sign in with `projects-lab-dev`.

The component gallery for every UI state is at `/dev/ui` in development.

## Troubleshooting

| You see | Do this |
|---|---|
| "Session expired" on the login screen | Sign in again |
| Too many attempts at sign-in | Wait for the 15-minute window to end |
| Sign-in says there's no owner (`not_provisioned`) | The owner wasn't created: `pnpm provision` (`--remote` in production) |
| "You're offline" | Reconnect and tap **Retry**; opened screens show their saved copy |
| A course says to open it online first | Open it once online; then it reads offline |
| A course says its file is no longer in study-materials | The file was moved or deleted; ask Claude to record the course again |
| Claude reports `github_token_invalid` or `github_rate_limited` | The GitHub token expired or hit its limit: renew it with `wrangler secret put GITHUB_TOKEN` or wait |
| Claude can't reach the app | Check Connections; revoke and reconnect the client, then run `core_whoami` |
| Local web tests time out | The machine is busy (TD-02): run each package's tests on its own |

## Keeping this guide current

The rule, in [`CLAUDE.md`](../CLAUDE.md) and in `/ship`: **a change that adds or changes something you use updates this guide in the same commit**: a screen or view, an MCP tool, a `pnpm` command, a slash command, a script, or a workflow.

`scripts/check-user-guide.sh` (part of `pnpm lint`, so it runs in CI) fails when this guide doesn't mention:

- every MCP tool registered in `packages/api/src`;
- every web route in `packages/web/src`;
- every `pnpm` script in the root `package.json`;
- every slash command in `.claude/commands/`;
- every script in `scripts/`.

The check makes sure each one is mentioned. Whether the description is right is what the rule and `/ship` cover.
