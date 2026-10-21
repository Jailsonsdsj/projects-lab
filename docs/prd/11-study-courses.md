# Study courses

How a course is made, recorded and read. Claude Code writes the course as Markdown into `study-materials` (architecture §7); the app records where it is and renders it. The app never writes course content. Source: cs-learning-lab `study-course-builder` Workflow A and `course-template.md`. The backlog is `10`, exams `12`.

## Where courses are made

**Only in Claude Code** (surface A, or B on the web): a course is delivered by `git push` to `study-materials`, which only Claude Code can do (R2-1). The skill lives in `study-materials/.claude/skills/study-course-builder/`, so a study session opens that repository. claude.ai and the mobile app still reach the backlog, grades and roadmap over MCP, but they don't make courses. The skill's "chat mode" (a backlog file in project knowledge, courses as downloads) is retired.

## Levels

| Level | Scope | Lessons | Minutes per lesson | Quick-check questions per lesson |
|---|---|---|---|---|
| Fast track | Core concepts, mental models, the 20% used 80% of the time | 3 to 4 | 10 to 15 | 3 |
| Essential | Fast track plus common patterns, tooling, testing, pitfalls, one small end-to-end example | 5 to 8 | 15 to 20 | 4 |
| Specialized | Essential plus internals, advanced patterns, performance, security, scaling, trade-offs, production concerns | 9 to 15, in 2 to 4 modules | 20 to 30 | 5 |

The level is asked once, for a new topic; an existing topic continues at its level. A Done topic can get a review, a higher level, or an exam retake (`12`).

## The course file

Writing rules (teaching style, callouts, media, quick checks, answer key) stay in the skill's `course-template.md`. What the **app relies on**:

- **Path** (R2-2): `Study Lab/<area-slug>/<topic-slug>/<topic-slug>__<level>.md`; Specialized modules `…__specialized_m1.md`, `_m2` … one file each, each with its own answer key. Images in that folder's `_img/`. Slugs are lowercase ASCII and `-`.
- **One H1**, the course title, followed by the badge line (`` `🎯 Essential` `📚 6 lessons` `⏱ ~100 min` … ``).
- **Lessons are H2** `## Lesson {n} · {title}`; sections inside are H3. "Course wrap-up", "References" and "Related and interesting content" are H2 too.
- **The answer key** starts at a horizontal rule followed by the H1 `# Answer key`, and runs to the end of the file (its "🏁 Final exam" hint included).
- **Diagrams** are ` ```mermaid ` blocks. **Callouts** are blockquotes with a bold label: Note, Tip, Warning, Frontend bridge, In the real world.
- **Images** are relative (`_img/<name>`) or verified `https` URLs; videos are links, never embeds.

## Recording a course

After pushing, Claude calls **`study_record_course`** `{ topicId, level, module?, path }` (write, idempotent, audited):

- The Worker checks that `path` exists in `study-materials` (metadata by path, `02-integration`); a missing file is `not_found`, so the app never lists a course it can't open.
- It upserts a `learn_course` row by `path` (recording the same file again after an edit changes nothing), sets the topic's level, and, if the topic is Not started, moves it to In progress and sets Started to today (owner-local).
- `module` is 1 for Fast track and Essential, 1 to 4 for Specialized.

Nothing derivable from the file (lesson count, minutes, title) is stored; the reader reads it from the file.

## Reading

- **Courses tab** (`/study/courses`): courses grouped by area, each row showing the topic, level (and module), and the date recorded; In progress topics first. Empty: "No courses yet. Start one in Claude Code with `/learn <topic>`."
- **Reader** (`/study/courses/:courseId`): metadata by path gives the blob SHA; content by SHA (`02-integration`), immutable, cached by the service worker, so a course once opened reads offline.
  - `Prose` renders the Markdown (design system). Lesson outline from the H2s: a `Sheet` on phone; on tablet and wider, a column **left** of the text that the header's sidebar button (`sidebar` icon, like Preview's) hides and shows, remembered per device. Hidden, the text takes the width (padding kept, no reading-measure cap) up to `--size-app-max`, centred beyond it. "Lesson n of N" with previous and next.
  - **Answer key** is split off at `# Answer key` and shown only on request ("Show answer key", per lesson), so answers aren't seen while studying.
  - **Quick check** questions (the ordered list after the lesson's "Quick check" heading) check themselves against that lesson's key, read question by question: `**B.**` for multiple choice (A–E, code allowed before the options), `I-F, II-T…` for true/false (I–V), anything else an open question with a model answer. A choice or a statement shows green (right) or red (wrong) as soon as it's answered, then the key's explanation; an open question shows the model answer on request and the reader marks it Got it or Missed it. A question whose key entry doesn't parse still takes an answer, unchecked. Nothing is stored.
  - **Images** under `_img/` resolve through the content proxy by SHA; external `https` images load directly.
  - **Mermaid** renders in the browser with the library loaded only when a course has a diagram (never server-side: 10 ms CPU).
  - Links open in a new tab.
- **Home "Continue"** opens the In progress topic's most recently recorded course.
- **Errors:** GitHub failures per `02-integration` (`github_token_invalid`, `github_rate_limited`); a file deleted from the repository after recording shows "This course file is no longer in study-materials: `<path>`", never a blank page. Offline without a cached copy: "Open this course once online to read it offline."

## MCP tools

| Tool | Kind | Input | Returns |
|---|---|---|---|
| `study_record_course` | write | `{ topicId, level, module?, path }` | `{ courseId, topic: { id, status, startedOn } }` |
| `study_list_courses` | read | `{ topicId? }` | `{ courses: [{ courseId, topicId, level, module, path, recordedAt }] }` |

Course content is never a tool argument or result: Claude reads and writes it in the repository.

## Invariants (merged into `99-data-model.md`)

S-10 to S-12: a course's level is one of the three, its module fits its level, and its path is unique and under `Study Lab/`, ending in `.md`.

## Decisions

Settled by the owner on 2026-10-19, as proposed in the draft:

1. **Courses only from Claude Code**; the skill's chat mode is retired.
2. **Recording checks the file exists** in `study-materials` before storing it.
3. **Nothing derivable is stored** (lesson count, minutes, title).
4. **Answer key hidden** until asked for, per lesson.
5. **Mermaid rendered in the browser**, loaded lazily; external `https` images allowed.
6. **No reading progress** (lessons read) in this phase; it can come later.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
