# Study exams

Final exams: how Claude writes, delivers and grades them, and what the app records and shows. Exams are taken in the Claude Code session (R2-4) **or in the app** (ST-13, below); the app shows the grade and links the Markdown, and the PDF of a Claude Code exam. Source: cs-learning-lab `exam-rules.md` and the skill's Workflows B and C. The backlog is `10`, courses `11`.

## Question types

| Code | Type | Format |
|---|---|---|
| MC | Multiple choice | A stem and five alternatives, A to E, exactly one correct |
| OPEN | Open question | Definitions, examples, differences, relationships, application cases, benefits, harms |
| TF | Multiple true or false | Five statements, I to V, each marked T or F |
| CODE | Code fill-in | A snippet with numbered blanks `____(1)____` |
| CODE-MC | Code multiple choice | A snippet with one blank; alternatives A to E are lines that could fill it |

## Rules (for Claude, unchanged)

1. Exactly the number and types requested with `/final-exam`. **Default:** 10 questions: 3 MC, 2 TF, 2 OPEN, 2 CODE-MC, 1 CODE; with no code in the topic, the code questions become MC and OPEN.
2. **Never reveal answers before the learner submits.** Asking for answers without submitting needs a confirmation that they want them without a grade. Before submission the exam file holds only questions, point values and the answer-format example.
3. Each question is worth `10 / number of questions` points, shown beside it. Cover all lessons proportionally; prefer understanding, application and trade-offs over trivia. Code questions use the course's main language.
4. **Scoring:** MC and CODE-MC full or zero. TF one fifth per correct statement. OPEN and CODE accuracy × value; code semantically equivalent to the reference earns full credit. The grade is rounded to one decimal.
5. The grading report (Results table, Feedback, Review suggestions below 7) is appended as `## Results` to the **same** exam file, never a new one. File formats stay in the skill's `exam-rules.md`.

## Files

- **Paths** (R2-2), next to the course: `<topic-slug>__<level>__exam-<n>.md` and `.pdf`, where `n` is the attempt: 1, then one past the highest for that topic and level.
- **The PDF** is the exam as delivered (questions only), for reading or answering away from the screen. Claude builds it in its sandbox and pushes it with the Markdown (SP-02 showed every surface can); the Worker never generates PDFs. The Results stay in the Markdown.

## Flow and recording

1. **Deliver.** Claude writes both files, commits `exam(<ID>): final exam #<n>`, pushes, then calls **`study_record_exam`** `{ topicId, attempt, level, mdPath, pdfPath }`. The Worker checks both files exist and that `attempt` is one past the topic's highest **at that level** (S-14); the topic's status doesn't change.
2. **Answer.** The owner replies in the session.
3. **Grade.** Claude appends `## Results`, commits `grade(<ID>): <x.x>/10` with the backlog change, pushes, then calls **`study_record_grade`** `{ topicId, level, attempt, grade }` with the grade in integer tenths (8.5 → 85). The Worker sets the exam's grade and `graded_at` and moves the topic to Done. **A correction** is the same call on a graded attempt: it replaces the grade and keeps `graded_at` (S-16); Claude fixes the file's Results in the same commit, and `mcp_call` records who changed it. Below 70, Claude also sets the topic's note to the lessons to review (`study_update_topic`).
4. **Then** Claude suggests up to three next topics in one line each (from the course's "Related" section or the backlog) without adding them, and recommends a new session.

The topic's **grade and Finished date** are those of its most recently graded exam, at any level (`10`, derived). A retake is a new attempt; earlier attempts stay as history.

## Exams in the app (ST-13; AI-01)

The same exam, written and graded by the Worker through the Anthropic API (architecture §1) because the owner starts it in the app. Shapes, scoring and the file's text are `shared/study/exam-paper.ts`.

1. **Start.** "Take the test" on a course opens a form: **questions** (1–20, required), the **mix** of types (optional; the counts add up to the questions), the **lessons** to cover (optional; all by default) and a **focus** note (optional, up to 500 characters).
2. **Generate.** The Worker sends the course and `exam-rules.md` (read from `study-materials`: the rules Claude Code follows) to `AI_MODEL`, and gets back the questions and, separately, a **key**: the right letter and why (MC, CODE-MC), the five true or false values (TF), a model answer and the points it must cover (OPEN), each blank's answer and the full solution (CODE). The reply must fit the settings (count, mix) and each type's shape (five options; a CODE snippet numbering its blanks `____(1)____` in order, one key answer per blank; a CODE-MC snippet with exactly one blank). The Worker commits `<topic-slug>__<level>__exam-<n>.md` beside the course in the **same format** as a Claude Code exam (§ Rules, rule 5), questions only, and records the exam with the next attempt **at the course's level**: numbering is shared with Claude Code exams. **No PDF.** A failed generation records nothing.
3. **The key** stays in the app's database. It is never in the file, on the page or in any response until the exam is graded.
4. **Answer.** A form per type (a choice for MC and CODE-MC, T or F per statement, text for OPEN, one field per blank for CODE), with a **draft** saved as the owner goes.
5. **Submit.** MC, TF and CODE-MC are scored against the key, without the model. OPEN and CODE go to the model with the reference answers, which returns an accuracy (0–100%) and feedback for each. The grade follows rule 4: the mean accuracy over 10, one decimal, stored in tenths. `## Results` is appended to the same file in the rules' report format, with the owner's answers, the correct ones, feedback and the grade; review suggestions only below 7, which also go to the topic's note, as Claude does. The grade is recorded like any other (`recordGrade`: the topic is Done, Verified at 7.0).
**Routes** (session only, `/api/study`): `POST /courses/:courseId/exams` writes one (ST-13c); `GET /exams/:examId/paper` gives the questions and the draft, and the key and per-question results only once submitted (a Claude Code exam has no paper: 404); `PUT /exams/:examId/draft` saves the answers (409 once submitted); `POST /exams/:examId/submit` grades. Writes take an Idempotency-Key, and a second submit answers the stored result without grading again.

6. **Failures.** Each AI error (`ai_*`, architecture §1) is shown with what to do. A failed grading keeps the answers saved, so the owner can submit again.

## Deleting an exam (ST-14)

Any exam, made in Claude Code or in the app, graded or not. **Only the owner deletes, in the app**; there is no MCP tool.

1. **At once** the exam leaves every read: Grades, the course's exams, the exam viewer and the paper (404), `study_list_exams`, and Career's `skillStatus`. The topic's **grade and Finished date are derived without it**: the most recently graded exam left, or "—" when none is. The topic's **status doesn't change** (a Done topic left with no grade is like one marked Done by hand: not verified).
2. **Undo** (`POST /exams/:examId/restore`) brings it back with its grade, until its files are removed.
3. **The nightly run** (the Worker's 03:00 UTC Cron Trigger) removes the files of every exam deleted at least an hour before (`DELETED_EXAM_FILES_AFTER_MINUTES`): the `.md`, and a Claude Code exam's `.pdf`, committed as `remove(<ID>): exam #<n>, deleted in Projects Lab`. A file already gone counts as removed. Then the exam stays deleted (S-26). A removal that fails is retried the next night.
4. **The row stays**, so attempts keep counting it (S-14): after deleting #4 the next exam is #5, never a second #4 with the old file name. Recording the deleted exam again, or grading it (Claude or the app), is refused with `conflict`.

**Routes** (session only, `/api/study`, Idempotency-Key): `DELETE /exams/:examId` and `POST /exams/:examId/restore`, both answering `{ exam: { examId, topicId, level, attempt, deletedAt } }`; deleting twice or restoring a live exam changes nothing; restoring after the files are removed → 409.

## Screens

- **In the app** (ST-13e): "Take the test" in the course reader, the course's exams (to answer, graded), the answer screen and the results.
- **Exam page** (`/study/exams/:examId`, ST-14b): **Delete exam** in the header (a trash icon on phone, "Delete" on tablet), held while an app exam is being graded → danger dialog "Delete exam #n?" → back where the owner came from, toast "<ID> exam #n deleted" with **Undo** ("is back"; a refusal shows the server's reason; a failure offers Retry). Every read on screen reads again after Undo (`announceDataChanged`, `core/read.ts`).
- **Grades tab** (`/study/grades`): graded exams, newest first: topic, level, attempt ("Retake #2"), grade with one decimal, date. Header: average grade of Done topics (`10` summary). Empty: "No grades yet. Take a final exam in Claude Code with `/final-exam`."
- **Topic sheet** (`10`): its attempts with grade or "Awaiting grade", each linking to the Markdown (rendered by the reader, `11`) and the PDF (opened by the device's viewer through the content proxy).
- States per `00-platform`.

## MCP tools

| Tool | Kind | Input | Returns |
|---|---|---|---|
| `study_record_exam` | write | `{ topicId, attempt, level, mdPath, pdfPath }` | `{ examId, attempt }` |
| `study_record_grade` | write | `{ topicId, level, attempt, grade }` (tenths, 0–100; attempts count per level) | `{ examId, grade, topic: { id, status, grade } }` |
| `study_list_exams` | read | `{ topicId? }` | `{ exams: [{ examId, topicId, attempt, level, mdPath, pdfPath, grade, gradedAt }] }` |

Errors: unknown topic or attempt → `not_found`; an attempt out of sequence, or an exam the owner deleted (recorded again or graded) → `conflict`; a grade outside 0–100 → schema error. `study_list_exams` leaves deleted exams out.

## Cross-lab

`skillStatus` (Study contract) reports a skill **verified** when its topic is Done and its derived grade is ≥ 70 (A-8, readiness in architecture §5).

## Invariants (merged into `99-data-model.md`)

S-13 to S-17: attempt numbering, paths, grade range, and a graded exam that stays graded with its first `graded_at`. S-23 to S-26 (ST-14): an exam is created live, a deleted one isn't graded, files are marked removed only on a deleted exam and once, and after that it stays deleted.

## Decisions

Settled by the owner on 2026-10-19:

1. **The PDF is the questions only**, built by Claude, pushed with the Markdown; required for every **Claude Code** exam. *Amended 2026-10-21:* exams made in the app have none.
2. **A grade can be corrected** by recording it again for the same attempt; `graded_at` stays, and the audit log keeps the change. (The draft proposed set-once; the owner chose correction.)
3. **Recording an exam checks both files exist** and that the attempt is the next one.
4. **Exams only in Claude Code** (R2-4), like courses. *Amended 2026-10-21:* in Claude Code **or in the app**, the app's through the Anthropic API (AI-01, ST-13).

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
