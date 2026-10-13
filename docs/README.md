# Projects Lab — PRD index

The PRD is split one file per feature area, so a task loads one ~80-line file instead of the whole document (playbook §5). Files are **numbered by lab**, leaving room for future labs:

| Range | Owner |
|---|---|
| `0x` | Platform (shared by every lab) |
| `1x` | Study Lab |
| `2x` | Career Lab |
| `3x`… | Future labs |
| `9x` | Cross-cutting: services and the data model |

## Files

| File | Holds | Source | Status |
|---|---|---|---|
| `00-platform.md` | Product thesis; what a lab is; the shell: lab switcher, navigation on phone and tablet; home screen with a cross-lab summary | Questionnaire rounds 1–2 | To write (before Phase 1) |
| `01-identity-and-access.md` | Passphrase login, session expiry, logout, change passphrase; OAuth sign-in and consent for Claude; Connections screen and revoke | Playbook §8 + architecture §6 | To write (before F-08) |
| `02-integration.md` | MCP tool conventions; Claude surfaces; the `study-materials` content contract; signed uploads | Architecture §6–7 | To write (before F-14) |
| `10-study-backlog.md` | Areas, IDs, levels, priorities, statuses, grades, sorting, summary; `/add`, `/backlog`, manual edits | cs-learning-lab `backlog-rules.md` | To write (Study phase) |
| `11-study-courses.md` | Course levels and sizing; reading a course in the app (rendering, images, offline) | `study-course-builder` SKILL.md + `course-template.md` | To write |
| `12-study-exams.md` | Exam types and scoring; exam PDF; recording grades | `exam-rules.md` | To write |
| `13-study-roadmap.md` | Gap analysis and roadmap proposals | `study-course-builder` Workflow E | To write |
| `20-career-profile.md` | Person, contact, links, photo, education, experience, declared skills; master-resume import | Round 1 Q8 + `Master Resume — source of truth.md` | To write (Career phase) |
| `21-career-jobs-and-skills.md` | Mapping postings to skills, pushing gaps to Study, readiness (verified, declared, gap) | `job-mapper` SKILL.md + R2-15 | To write |
| `22-career-documents.md` | Resumes, cover letters, self-introductions, salary ranges per role; file storage; form-filling copy panel | R2-10, R2-11, R2-12 | To write |
| `23-career-job-search.md` | Search criteria edited in the app; scheduled task; openings and their statuses; digest | R2-8, R2-9 | To write |
| `24-career-interviews.md` | Interview answers in text and Drive video | R2-13 | To write |
| `90-services.md` | Hosting, backup and restore, pruning windows, external services (GitHub, Drive, Gmail), what leaves the app | Playbook + architecture §2 | To write (before F-19) |
| `99-data-model.md` | Core tables, then a section per lab; **every invariant** listed, each becoming a trigger or CHECK | Architecture §5 + lab PRDs | To write (core part before F-04) |

## Writing order

1. **Platform first:** `00`, `01`, `02`, `90`, and the core part of `99`. They are the only PRD files Phase 0–1 tasks load.
2. **Study Lab** (`10`–`13`) before its phase starts. Most of it is a re-expression of cs-learning-lab's existing skill rules, so it's quick.
3. **Career Lab** (`20`–`24`) after spikes SP-02 and SP-03, whose results change `22` and `23`.

Each lab PRD ends with its **invariants** section, merged into `99-data-model.md`.
