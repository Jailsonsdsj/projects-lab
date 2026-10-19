# Study exams

Final exams: how Claude writes, delivers and grades them, and what the app records and shows. Exams are taken in the Claude Code session (R2-4); the app shows the grade and links the Markdown and the PDF. Source: cs-learning-lab `exam-rules.md` and the skill's Workflows B and C. The backlog is `10`, courses `11`.

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
3. **Grade.** Claude appends `## Results`, commits `grade(<ID>): <x.x>/10` with the backlog change, pushes, then calls **`study_record_grade`** `{ topicId, attempt, grade }` with the grade in integer tenths (8.5 → 85). The Worker sets the exam's grade and `graded_at` and moves the topic to Done. **A correction** is the same call on a graded attempt: it replaces the grade and keeps `graded_at` (S-16); Claude fixes the file's Results in the same commit, and `mcp_call` records who changed it. Below 70, Claude also sets the topic's note to the lessons to review (`study_update_topic`).
4. **Then** Claude suggests up to three next topics in one line each (from the course's "Related" section or the backlog) without adding them, and recommends a new session.

The topic's **grade and Finished date** are those of its most recently graded exam, at any level (`10`, derived). A retake is a new attempt; earlier attempts stay as history.

## Screens

- **Grades tab** (`/study/grades`): graded exams, newest first: topic, level, attempt ("Retake #2"), grade with one decimal, date. Header: average grade of Done topics (`10` summary). Empty: "No grades yet. Take a final exam in Claude Code with `/final-exam`."
- **Topic sheet** (`10`): its attempts with grade or "Awaiting grade", each linking to the Markdown (rendered by the reader, `11`) and the PDF (opened by the device's viewer through the content proxy).
- States per `00-platform`.

## MCP tools

| Tool | Kind | Input | Returns |
|---|---|---|---|
| `study_record_exam` | write | `{ topicId, attempt, level, mdPath, pdfPath }` | `{ examId, attempt }` |
| `study_record_grade` | write | `{ topicId, attempt, grade }` (tenths, 0–100) | `{ examId, grade, topic: { id, status, grade } }` |
| `study_list_exams` | read | `{ topicId? }` | `{ exams: [{ examId, topicId, attempt, level, mdPath, pdfPath, grade, gradedAt }] }` |

Errors: unknown topic or attempt → `not_found`; an attempt out of sequence → `conflict`; a grade outside 0–100 → schema error.

## Cross-lab

`skillStatus` (Study contract) reports a skill **verified** when its topic is Done and its derived grade is ≥ 70 (A-8, readiness in architecture §5).

## Invariants (merged into `99-data-model.md`)

S-13 to S-17: attempt numbering, paths, grade range, and a graded exam that stays graded with its first `graded_at`.

## Decisions

Settled by the owner on 2026-10-19:

1. **The PDF is the questions only**, built by Claude, pushed with the Markdown; required for every exam.
2. **A grade can be corrected** by recording it again for the same attempt; `graded_at` stays, and the audit log keeps the change. (The draft proposed set-once; the owner chose correction.)
3. **Recording an exam checks both files exist** and that the attempt is the next one.
4. **Exams only in Claude Code** (R2-4), like courses.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
