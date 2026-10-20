# Career interviews

Interview preparation: a bank of **STAR stories** reused across interviews, **answers** to likely questions in text and (optionally) on video, and a **drill log** of practice sessions with Claude. Video never goes to R2: the owner uploads it to Google Drive and pastes the link (R2-13). Sources: R2-13, career-os's `/interview-drill` and `interview/stories.md`, `drill-log.md`. Profile is `20`, jobs `21`.

## Stories (career-os's STAR story bank)

A story is reusable evidence: **title**, **situation**, **task**, **action**, **result** (each at most 600 characters), the **experience** it happened in and the **facts** it rests on (`20`), and the **skills** it shows. "Never fabricate" holds: a story's result cites facts; an unverified fact makes the story *unverified* until the owner confirms it.

## Answers

An **answer** is a question (at most 200 characters) and the owner's answer in **text** (at most 3,000 characters), optionally a **Drive video** of the owner saying it, the **story** it uses, and the **job** it's for (or general). The self-introduction of a job (`22`) is shown here too, as that job's "Tell me about yourself".

**Drive links (R2-13):** the owner pastes a Google Drive file link; the app accepts only `https://drive.google.com/file/d/<id>/…` (and `open?id=<id>`), stores the file ID, and embeds Drive's own player (`https://drive.google.com/file/d/<id>/preview`) in a sandboxed `<iframe>`. No Google API, no token; the video's sharing setting is the owner's (the app says "If it doesn't play, share it with your Google account" when the player can't load).

## Drills (career-os `/interview-drill`)

Practice happens in a Claude chat, any surface. Modes:

- **Behavioral:** one question at a time; critique against STAR, specificity, a quantified result, and individual vs. team credit; the improved version; a follow-up on the weakest claim. Three to five questions a session. Contract-specific questions stay in rotation (a second job alongside a full-time one; study deadlines colliding with the client's).
- **Technical:** scoped problems ("design an eval harness for a support chatbot"), follow-ups like a real interviewer.
- **Negotiation:** Claude plays a slightly difficult client on rate and scope; needs the job's salary range (`22`); without one, Claude says so and stops.

After a session Claude saves: new or improved stories (`career_save_story`), answers (`career_save_answer`), and a **drill log entry** (`career_log_drill`: date, mode, topic or job, the two weakest answers, what to fix), and gives one honest overall read: a bad answer is called bad, with why.

## Operations

| Operation | App | MCP tool |
|---|---|---|
| Stories: list, add, edit | Interviews → Stories | `career_list_stories`, `career_save_story` |
| Answers: list (by job or general), add, edit, attach a Drive video | Interviews → Answers; a job's Interviews section | `career_list_answers`, `career_save_answer` (the Drive link is pasted in the app or given to Claude) |
| Drill log | Interviews → Practice | `career_log_drill`, `career_list_drills` (Claude reads the weak areas before drilling) |

## Screens

- **Interviews** (`/career/interviews`, Career's fifth tab, CA-13; views Answers, Stories, Practice in `?view=`): Answers grouped by job then general, each with text and, if any, the embedded Drive player; Stories with their skills and verified state; Practice as a dated list with the weak answers to fix.
- States per `00-platform`; the Drive player shows a message, not a blank box, when it can't load.

## Invariants (merged into `99-data-model.md`)

K-24 to K-28: STAR field lengths, a story's facts exist, an answer's Drive file ID format, an answer's job and story exist, drill modes.

## Decisions

Approved by the owner on 2026-10-19 as proposed, **flagged to refine later** (CA-00: job filters, refusal rules, thresholds):

1. **Stories are their own records**, linked to facts, and an answer points at the story it uses.
2. **Drive videos are links, embedded with Drive's player**; no Google API (R2-13).
3. **Only `drive.google.com/file/d/<id>` and `open?id=<id>` links** are accepted.
4. **Drills happen in Claude**; the app keeps their log and shows the weak areas.
5. **Negotiation drills need a salary range** on the job.
6. **Interviews is a fifth Career tab** (`/career/interviews`: Answers, Stories, Practice), built that way in CA-13 because a tab is easier to reach on a phone than a section inside each job; CA-00 may still move it.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
