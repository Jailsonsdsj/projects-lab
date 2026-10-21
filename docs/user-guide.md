# Projects Lab — User guide

How to use Projects Lab day to day, how to run its workflows with Claude, and every command in this repository. It's for the owner. The specs behind each feature are in [`docs/prd/`](prd/) ([index](README.md)); task status is in [`backlog.md`](backlog.md).

**This guide is kept current by rule:** any change that adds or changes something you use (a screen, an MCP tool, a `pnpm` command, a slash command, a script or a workflow) updates this file in the same commit, and `pnpm lint` fails when a tool, route, command or script is missing from it. See [Keeping this guide current](#keeping-this-guide-current).

## Contents

The guide has four parts:

1. **[Using the app](#using-the-app):** [Getting started](#getting-started) · [Home](#home) · [Study Lab](#study-lab) · [Career Lab](#career-lab) · [Connections, Guide and Settings](#connections-guide-and-settings)
2. **[Working with Claude](#working-with-claude):** [Connect Claude](#connect-claude) · [Workflows](#workflows) · [MCP tool reference](#mcp-tool-reference)
3. **[Developing Projects Lab](#developing-projects-lab):** [The task loop](#the-task-loop-claude-code-in-this-repository) · [Slash commands](#slash-commands) · [`pnpm` commands](#pnpm-commands) · [Scripts](#scripts) · [Owner-only steps](#owner-only-steps) · [Local setup](#local-setup) · [Testing in the dev environment](#testing-in-the-dev-environment)
4. **[Help](#help):** [Backup and restore](#backup-and-restore) · [Troubleshooting](#troubleshooting) · [Keeping this guide current](#keeping-this-guide-current)

In the app, the parts are the tabs of the **Guide** screen (`/guide`).

---

## Using the app

### Getting started

**What it is.** One web app with two labs that share data: **Study Lab** (what you're learning, courses, exams, grades) and **Career Lab** (profile, jobs, documents, job search, interviews). The app has no AI of its own: Claude reads and writes it through its MCP connector, and you use the app to see, check and edit.

**Open it.** Production: `https://projects-lab.jailson-junior36.workers.dev`. On iPhone or iPad, Share → **Add to Home Screen** installs it as an app. When a new version is deployed, a toast says "A new version of Projects Lab is ready." with **Reload**.

**Sign in** (`/login`). Type your passphrase and **Sign in**. The key is derived in your browser; the passphrase never leaves the device.

- A session lasts **90 days** on that device. When it expires, the login screen says "Session expired" and you sign in again.
- **10 attempts per 15 minutes**, successful or not. After that, wait for the window to end.
- The owner account is created once with `pnpm provision` (see [owner-only steps](#owner-only-steps)); there is no sign-up.

**Find your way around.**

- **Phone:** tabs at the bottom for the current lab (Home's are Home, Connections, Guide and Settings). **Tablet and desktop:** a side rail with the lab's tabs and Settings at the bottom.
- **Lab switcher** (the button with the lab's name at the top): Home, Study Lab, Career Lab. Each lab has its own accent colour.
- Every screen has distinct states: loading, empty (with what to do next), error (with **Retry**) and **offline** ("You're offline", with **Retry**). Screens you've opened show their last saved copy while offline.

### Home

`/`: one card per lab.

- **Study card:** topics in progress, not started, your average grade, and **Continue** for the course you're on (it opens the course).
- **Career card:** tracked jobs and the best match's readiness and gaps.
- **Backup reminder:** "No backup yet." or "No backup in a while." (after 30 days) with **Back up**, which opens Settings.

### Study Lab

#### Backlog — `/study`

Every topic you want to learn, grouped by **area** (CS Fundamentals, Frontend, Backend, Databases and Data, DevOps and Cloud, Software Architecture, Security, plus any you add). Each topic has an ID like `FE-03`, a level (Fast track, Essential, Specialized), a priority (P1 next up, P2 soon, P3 later), a status (Not started, In progress, Done) and, once graded, a grade.

- **Add a topic:** **Add** (or **Add a topic** on an empty backlog) → skill (it tells you if it matches an existing skill or is new), area (or a new area with a two-letter prefix), level, priority → **Add to backlog**. A skill already in the backlog is never duplicated.
- **Edit:** tap a topic → its sheet: level, priority, status, note; its exams with grades; **Remove** (with confirmation).
- **Filter and search:** status tabs (All, Not started, In progress, Done) and the search box.

#### Courses — `/study/courses`

Courses Claude recorded, grouped by area, in progress first. Tap one to read it.

**Reader** (`/study/courses/:courseId`): full screen, one lesson per page with previous and next, diagrams, and **Show answer key** per lesson so answers stay hidden while you study. A course you've opened once reads offline.

- **Quick check** (end of each lesson): answer and it checks itself against the lesson's answer key. Multiple choice (code questions too): tap an option and the right one turns green, yours red if it's wrong, with the key's explanation. True or false: mark each statement **True** or **False**; each turns green or red at once, and when all are marked you get the score and the explanation. Open questions: jot an answer in **Your answer** (not saved), tap **Show model answer**, then **Got it** or **Missed it** marks it green or red. **Try again** clears a question. Nothing is recorded: it's practice.

- **Outline** ("In this lesson", the lessons, the course): on phone, the list button opens it as a sheet. On tablet and desktop it's a column on the left; the **sidebar button** at the top left (as in Preview) hides it so the text uses the whole width, and shows it again. The reader remembers your choice on that device. Its **Exams** section lists this course's attempts: the grade, "Awaiting grade" (a Claude Code exam not graded yet) or "To answer" (an exam made in the app).
- **Take the test** (the header's button on tablet, the medal icon on phone, and at the end of the last page): the app writes a final exam for this course. Choose the number of questions (1–20, 10 by default) and, optionally, how many of each type (the counts must add up), which lessons to cover, and a focus. **Generate** takes up to a minute; the exam is saved beside the course in `study-materials` and opens. Each exam is written by the AI and billed to your Anthropic API account.

#### Grades — `/study/grades`

Graded exams, newest first, with the average grade of Done topics. Tap an exam to open it (`/study/exams/:examId`).

- **A Claude Code exam** shows its questions, the results once graded, and **Open the PDF**.
- **An exam made in the app** opens as a form: choices for multiple choice, True or False for each statement, a text box for open questions, a field for each blank in code. Your answers save themselves a moment after each change ("Saved") and come back when you reopen the exam; offline they save once you're back. **Submit answers** asks to confirm (and how many are unanswered, which score 0), then grades: multiple choice and true or false against the key, open and code answers by the AI. You see the grade, each question with your answer, the correct one, the points and feedback, and below 7.0 the review suggestions (also added to the topic's note). The exam file in `study-materials` gets the same Results. Submitting needs a connection; if grading fails, your answers stay saved.

### Career Lab

#### Jobs — `/career`

Three views at the top:

- **Tracked:** your jobs, best readiness first, each with readiness (`ready/required`), status and fit decision. Tap one to open the **job** (`/career/jobs/:jobId`):
  - the readiness meter: **Verified** (passed a Study exam with ≥ 7.0), **Declared** (in your profile) and **Gap**;
  - each requirement with where it stands ("Passed FE-03 · 8.5", "In your profile · no exam yet", "Not in your profile or backlog");
  - **Add to Study backlog** on a gap: pick the area and priority, and the topic lands in Study with the job named in its note;
  - status (evaluated → applied → interviewing → offer / rejected / withdrawn), notes, the fit score and the posting.
- **Openings** (`?view=openings`): what the weekly job search found. **Keep**, **Dismiss**, or **Track** (copies a prompt for Claude to map it as a job). Openings still new after 30 days are muted.
- **Search criteria** (`?view=criteria`): lanes, rate floor, hours, work shape and the rest of what the weekly search uses. Only you edit them; the search only reads them.

#### Skills — `/career/skills`

Your declared skills by level, each **verified** (Study proved it) or **declared**, plus "Verified in Study, not declared" suggestions.

#### Profile — `/career/profile`

Your photo (upload or remove, up to 2 MB), person and contact, links, experiences with their facts (unverified facts are badged; verify them here), education and languages. Everything edits through sheets.

**Copy panel:** "Tap Copy, then paste into the form": your standard fields and standard answers, and, for a job you pick, its form answers, self-introduction and salary range. It works offline.

#### Documents — `/career/documents`

The app stores no documents: Claude writes them and gives them to you. This tab is each job's **application kit**: which facts the last document used, the self-introduction, the salary range and the form answers, with **Ask Claude for a document** (copies a prompt such as "Write my resume for … with `career_document_brief`").

#### Interviews — `/career/interviews`

- **Answers** (default view): prepared answers, grouped by job and then general, with a Google Drive video if you attached one (paste a Drive link; the video stays in Drive).
- **Stories** (`?view=stories`): STAR stories (situation, task, action, result) with their skills and facts.
- **Practice** (`?view=practice`): the drill log: date, mode, weakest answers and the fix.

### Connections, Guide and Settings

#### Connections — `/connections`

Every Claude client you've allowed (Claude Code, claude.ai, the apps), when it was granted and last used, and **Revoke**. A revoked client must sign in again.

#### Guide — `/guide`

This guide, in the app. Its four parts are the tabs at the top (The app, Claude, Develop, Help), links to a section in another part open that part at the section, and links to other project files open them on GitHub. It's part of the installed app, so it reads offline, and it always matches `docs/user-guide.md`: the app shows that file itself.

#### Settings — `/settings`

- **Change passphrase:** current, new, confirm. Every other device is signed out; this one stays signed in.
- **Backup:** **Download backup** and when the last one was. See [Backup and restore](#backup-and-restore).
- **Session:** **Log out** signs out this device only.

---

## Working with Claude

### Connect Claude

#### Connect a surface

When Claude asks you to sign in, `/oauth/authorize` shows the same login screen, then "Allow *client* to read and write Projects Lab": **Allow**.

| Surface | How to connect |
|---|---|
| Claude Code (terminal, VS Code) | `claude mcp add --transport http --scope user projects-lab https://projects-lab.jailson-junior36.workers.dev/mcp`, then `/mcp` → Authenticate |
| claude.ai, desktop and the iPhone/iPad app | Settings → Connectors → add a custom connector with the `/mcp` URL above. The apps use the connector added on claude.ai |
| Claude Code on the web | Uses the claude.ai connector |
| Scheduled routines | Attach the **Projects-Lab** connector (and Gmail, if it emails) to the routine itself at claude.ai/code/routines; routines don't inherit account connectors |

To check a connection, ask Claude to run `core_whoami`: it answers with your owner ID, timezone, the client name and the labs.

#### How Claude works with the app

- Every write Claude makes is recorded (tool, client, time, success); Connections shows when each client was last used.
- Retrying a write is safe: Claude sends an `idempotencyKey`, and a retry returns the first result.
- Claude never sends files to the app. Documents come to you as downloads; the only file the app stores is your photo.
- A job posting you paste is data, not instructions: commands hidden in it are ignored.

### Workflows

#### Plan what to learn — `/roadmap` (any surface)

Ask "what should I learn next?". Claude asks up to three questions, reads your backlog, profile and tracked jobs, proposes topics by area with level and priority, and adds them with `study_add_topics` only after you confirm.

#### Add topics and check the backlog — `/add`, `/backlog` (any surface)

"Add Kubernetes to DevOps, P1" → `study_add_topics`. "Show my backlog" → `study_list_backlog` / `study_get_summary`. Or use the Backlog tab yourself.

#### Take a course — `/learn <topic>` (Claude Code, in `study-materials`)

Courses are made only in a Claude Code session opened in the `study-materials` repository (`git pull` first). Claude writes the course, pushes it, and records it with `study_record_course`; the topic moves to In progress and the course appears in Courses.

#### Take the final exam in the app — "Take the test"

Open the course, tap **Take the test**, choose the questions and **Generate**. The app writes the exam with the AI (the same exam rules Claude Code follows), saves it beside the course and opens it; it shares attempt numbers with Claude Code exams. Answer it on the page and **Submit answers**: the grade is recorded like any other (the topic becomes Done; 7.0 or more makes the skill **Verified**). An unanswered app exam shows "To answer" in the course's Exams and the topic sheet.

#### Take the final exam — `/final-exam` (Claude Code, in `study-materials`)

Claude writes the exam (Markdown and PDF), pushes it and records it with `study_record_exam`. You answer in the session; Claude grades it, records the grade with `study_record_grade` (the topic becomes Done), and suggests what's next. A grade of 7.0 or more makes the skill **Verified** for every job that needs it. A retake is a new attempt; a correction replaces the grade.

#### Map a job posting (any surface)

Paste the posting and ask Claude to map it. Claude extracts the requirements (required, nice to have, not mapped), matches skills (`core_find_skill`), scores the fit and saves it with `career_add_job`. The app computes readiness. Then send gaps to Study, from Claude (`career_send_gaps`) or with **Add to Study backlog** on the job screen.

#### Write a resume or cover letter (any surface)

Ask "Write my resume for *job*" (or copy the prompt from Documents). Claude calls `career_document_brief`, asks you to confirm any unverified fact first, writes the document in the posting's language and gives you the file, then saves what it used with `career_save_selection`. The self-introduction, salary range and form answers are saved with `career_save_job_kit` after you agree on them.

#### Weekly job search (routine)

A Claude Code routine scans for openings every Monday, saves them with `career_save_openings` and emails you a digest. Its setup and prompt are in [`docs/routines/job-search.md`](routines/job-search.md). Review the results in Jobs → Openings.

#### Interview practice (any surface)

Ask Claude to drill you ("practise negotiation for Evalco"). It reads your weak spots with `career_list_drills`, runs the drill and logs it with `career_log_drill`. Prepared answers and stories are saved with `career_save_answer` and `career_save_story`.

#### Keep the profile current (any surface or the app)

"Add this experience…", "this fact is confirmed" → `career_save_experience`, `career_save_fact`, `career_declare_skill`. Or edit in Profile and Skills.

### MCP tool reference

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

---

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
| `pnpm dev` | Applies any new migrations to the local database, then runs the web app (Vite) and the Worker (`wrangler dev`) locally |
| `pnpm seed` | Resets the local database and files and loads sample data (dev passphrase `projects-lab-dev`); stop `pnpm dev` first |
| `pnpm test` | Unit and integration tests in every package (if the machine is busy, run one package: `pnpm --filter api test`) |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` | Biome, plus the boundary, workflow, KDF, token and user-guide checks |
| `pnpm lint:tokens` | Only the design-token check (no literal colours or sizes) |
| `pnpm format` | Formats with Biome |
| `pnpm claude:dev` | Starts Claude Code connected only to the local app (`mcp.dev.json`), with every production connector left out |
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

Claude never runs these; they're yours. `wrangler` isn't installed globally: run it as `npx wrangler …` from `packages/api` (`npx wrangler login` once, if it says you're not logged in), and add `--env=""` so it targets the production Worker, not `preview`.

- `pnpm provision --remote` (create the production owner).
- Any `--remote` command: `wrangler d1 execute … --remote` for imports and restores, `wrangler d1 time-travel restore`.
- `npx wrangler secret put <NAME> --env=""` for `TOKEN_SIGNING_KEY`, `GITHUB_TOKEN`, `GITHUB_WRITE_TOKEN` and `ANTHROPIC_API_KEY` (paste the value when asked; create the API key at console.anthropic.com and set a monthly spend limit there). `npx wrangler secret list --env=""` shows which are set, never their values.
- Merging `developer` into `main` (that deploys).
- Creating and changing routines at claude.ai/code/routines.

### Local setup

1. `pnpm install`.
2. `cp packages/api/.dev.vars.example packages/api/.dev.vars` and fill in `TOKEN_SIGNING_KEY` (any long random string: `openssl rand -base64 32`), `GITHUB_TOKEN` (read-only on `study-materials`; only courses and exams need it), `PUBLIC_ORIGIN`, and optionally `ANTHROPIC_API_KEY` (only the AI features need it; each use is billed to your Anthropic API account) and `GITHUB_WRITE_TOKEN` (only exams taken in the app need it: Contents read and write on `study-materials`). Restart `pnpm dev` after any change to this file.
3. `pnpm seed`, then `pnpm dev`, and sign in with `projects-lab-dev`.

The local app has its own database and owner: your production passphrase doesn't work there, and `projects-lab-dev` doesn't work in production.

The component gallery for every UI state is at `/dev/ui` in development.

A local tab shows an **amber icon** and a title starting with **"Dev ·"** (on `localhost` or an IP address); production keeps the dark icon.

### Testing in the dev environment

Everything below runs against your local Worker and database. Nothing reaches production, as long as you start Claude with `pnpm claude:dev`.

**1. Run the app.** `pnpm dev`, then sign in at `http://localhost:5173` with `projects-lab-dev`. Test every screen there. To try it on your phone or tablet, run `pnpm --filter web dev --host` and open the address it prints (same Wi-Fi). The tab still shows the dev icon.

**2. Connect Claude Code to the local app only.**

1. Build the web app once (the Worker serves it for the sign-in page): `pnpm --filter web build`.
2. In this repository, `pnpm claude:dev`. It loads only `mcp.dev.json` (`projects-lab-dev` at `http://localhost:8787/mcp`) and leaves out every other connector: the production `projects-lab` server, and claude.ai's Projects Lab, Gmail and Drive.
3. In the session, `/mcp` → `projects-lab-dev` → **Authenticate**. The browser opens the local sign-in page (dev icon): sign in with `projects-lab-dev` and **Allow**.
4. Ask Claude to run `core_whoami`: the owner is `seed-user`. Then run `/mcp`; only `projects-lab-dev` is listed. If you see `projects-lab` or `claude.ai Projects Lab`, you started Claude the normal way: quit and use `pnpm claude:dev`.

**3. Run the flows.** In that session, everything in [Workflows](#workflows) that needs only the connector: add topics and read the backlog, plan with `/roadmap`, map a job and send its gaps, write a resume or cover letter, practise an interview, update the profile. Check each result in the app at `localhost:5173`.

**4. Courses and exams (`/learn`, `/final-exam`).** These push files to GitHub, and `study-materials` is the production content. Use a test copy:

1. On GitHub, create a private repository `study-materials-dev` (yours to do).
2. Clone it next to the real one: `git clone https://github.com/Jailsonsdsj/study-materials.git ../study-materials-dev`, then in it `git remote set-url origin https://github.com/Jailsonsdsj/study-materials-dev.git` and `git push -u origin main`.
3. In `packages/api/.dev.vars`: `STUDY_MATERIALS_REPO=Jailsonsdsj/study-materials-dev`, and a `GITHUB_TOKEN` with read access to it. Restart `pnpm dev`.
4. In `../study-materials-dev`, start Claude with the dev config: `claude --strict-mcp-config --mcp-config ../projects-lab/mcp.dev.json`, authenticate as in step 2, then `/add`, `/learn`, `/final-exam`, answer and grade. Courses push to the test repository, and the local app reads them from there.

**5. The weekly job search.** The routine runs in Anthropic's cloud, which can't reach your machine, so it only ever uses production. To test the scan locally, paste the routine's prompt ([`routines/job-search.md`](routines/job-search.md)) into a `pnpm claude:dev` session and say "skip the email": Gmail isn't loaded there, so nothing is sent. Then review Jobs → Openings locally.

**Not testable locally:** claude.ai, the desktop app and the phone app run in the cloud and can't reach `localhost`; test those surfaces in production. To start over with an empty local database, stop `pnpm dev` and run `pnpm seed`.

---

## Help

### Backup and restore

**Back up:** Settings → Backup → **Download backup** saves `projects-lab-backup-<date>.json`: every row of your data and your photo. It contains your passphrase's hash, so keep it somewhere private (not in a shared folder). Home reminds you after 30 days.

**Restore** (into a fresh environment):

1. `pnpm tsx scripts/restore-backup.ts <backup.json>` checks the backup against the repo's migrations and writes `scripts/out/restore/restore.sql` plus the files.
2. It prints the commands: run the `--local` ones to check on a local database, then the `--remote` ones for production (yours to run).

For a recent mistake, Cloudflare's **D1 Time Travel** restores the whole database to a point in time (`wrangler d1 time-travel restore`, yours to run). Details: [`prd/90-services.md`](prd/90-services.md).

### Troubleshooting

| You see | Do this |
|---|---|
| "Session expired" on the login screen | Sign in again |
| Too many attempts at sign-in | Wait for the 15-minute window to end |
| A dev Claude session shows production tools (`projects-lab`, `claude.ai Projects Lab`) | It was started the normal way: quit and start it with `pnpm claude:dev` |
| Locally, lab screens show errors while Connections and Settings work | The local database is missing newer migrations: restart `pnpm dev` (it applies them), or reset with `pnpm seed` |
| Locally, sign-in fails with the right passphrase (`projects-lab-dev`) | `packages/api/.dev.vars` is missing or has no `TOKEN_SIGNING_KEY`: create it (see [Local setup](#local-setup)) and restart `pnpm dev` |
| Sign-in says there's no owner (`not_provisioned`) | The owner wasn't created: `pnpm provision` (`--remote` in production) |
| "You're offline" | Reconnect and tap **Retry**; opened screens show their saved copy |
| A course says to open it online first | Open it once online; then it reads offline |
| A course says its file is no longer in study-materials | The file was moved or deleted; ask Claude to record the course again |
| Claude reports `github_token_invalid` or `github_rate_limited` | The GitHub token expired or hit its limit: renew it with `wrangler secret put GITHUB_TOKEN` or wait |
| Claude can't reach the app | Check Connections; revoke and reconnect the client, then run `core_whoami` |
| Local web tests time out | The machine is busy (TD-02): run each package's tests on its own |

### Keeping this guide current

The rule, in [`CLAUDE.md`](../CLAUDE.md) and in `/ship`: **a change that adds or changes something you use updates this guide in the same commit**: a screen or view, an MCP tool, a `pnpm` command, a slash command, a script, or a workflow.

`scripts/check-user-guide.sh` (part of `pnpm lint`, so it runs in CI) fails when this guide doesn't mention:

- every MCP tool registered in `packages/api/src`;
- every web route in `packages/web/src`;
- every `pnpm` script in the root `package.json`;
- every slash command in `.claude/commands/`;
- every script in `scripts/`.

The check makes sure each one is mentioned. Whether the description is right is what the rule and `/ship` cover.
