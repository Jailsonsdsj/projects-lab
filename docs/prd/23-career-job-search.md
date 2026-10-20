# Career job search

A Claude routine searches for openings on a schedule, keeps the ones that pass the owner's criteria, saves them to the app, and emails a digest; the owner turns the good ones into tracked jobs (`21`). There is no Worker cron for it (architecture §8). Sources: R2-8, R2-9, SP-03, career-os's `/job-scan` (sources and triage) and `/weekly-review` (closing silent applications). The filters and refusal rules here are what CA-00 refines with the owner.

## Search criteria (edited in the app, R2-9)

One record, read by the routine at the start of every run.

| Field | Example | Use |
|---|---|---|
| **Queries** | `"AI engineer" contract remote`, `"LLM evaluation"` | What to search for; one per line, at most 20 |
| **Lanes** | `AI engineering`, `AI evaluation`, `Front-end (fallback)` | Each opening is placed in one; the order is priority |
| **Work shape** | contract, part-time, freelance | Accepted shapes |
| **Hours** | at most 20 h/week | Above it: rejected, not negotiated |
| **Time zone** | overlap with UTC−3, async-friendly | |
| **Rate floor** | integer, currency, period | Below it: rejected (when the rate is posted) |
| **Auto-reject** | keywords and companies | Any match: rejected |
| **Max age** | 14 days | Older postings are usually filled |
| **Sources** | company careers pages, Wellfound, RemoteOK, Braintrust, Contra, LATAM-remote boards | Public, fetchable sources only |

**Never scraped:** LinkedIn or any site that forbids automated access. The owner pastes postings from those (`21`); the routine never substitutes web results for them.

## The routine (SP-03)

A Claude Code routine (claude.ai/code/routines) with the **Projects-Lab and Gmail connectors attached to the routine** (a routine doesn't inherit account connectors: SP-03), on a weekly schedule (Monday 08:00 America/Recife, `0 11 * * 1` UTC) the owner can change on the routine. Its setup and verbatim prompt are in [`docs/routines/job-search.md`](../routines/job-search.md). Each run:

1. `career_get_search_criteria`; `career_list_openings` (so a seen opening isn't resurfaced; matched by URL).
2. Search the sources with the queries; read each candidate.
3. **Triage**: keep it only if every criterion holds (shape, hours, time zone, lane, not auto-rejected, within max age, rate at or above the floor when posted). Note the closest rejects with the one reason each failed.
4. `career_save_openings`: the kept ones (company, role, lane, URL, an excerpt of the posting of at most 4,000 characters, posted date, rate if posted, why it's worth a look), at most 20 a call.
5. Send the digest with Gmail to the owner: the kept openings as a short table (company · role · lane · rate · why), the closest rejects, and a link to the app's Openings. No digest is sent for a run that kept nothing and rejected nothing close.

The routine never applies, never tailors a document and never contacts anyone: scanning only (career-os: mixing sourcing with application work is how the routine stops happening).

## Openings

Statuses: `new` (saved by the routine) → `kept` or `dismissed` (by the owner) → `tracked` when turned into a job (`21`, the posting carried over). A dismissed opening isn't saved again. Openings older than 30 days that are still `new` are shown as stale.

## Closing silent applications

The routine also marks applications (`21`) with no answer for 3 weeks as `closed_silent`, appending the event, and lists them in the digest (career-os `/weekly-review`).

## Operations

| Operation | App | MCP tool |
|---|---|---|
| Edit the criteria | Jobs → Search criteria | `career_get_search_criteria` (read only for Claude) |
| Save openings | — | `career_save_openings` (batch; a known URL is skipped) |
| List openings | Jobs → Openings | `career_list_openings` |
| Keep / dismiss | Openings | `career_update_opening` |
| Track as a job | Opening → Track (Claude maps it) | `career_add_job { openingId, … }` (`21`) |

## Screens

- **Openings** (in the Jobs tab, a second list): new openings first, each with lane, rate, age and "why", Keep / Dismiss, and "Track" (copies a prompt for Claude to map it). Stale ones muted.
- **Search criteria**: the fields above, as a form; saved with an Idempotency-Key.

## Invariants (merged into `99-data-model.md`)

K-20 to K-23: one criteria row, hours and floor non-negative integers, opening statuses and URL uniqueness, a tracked opening points at its job.

## Decisions

Approved by the owner on 2026-10-19 as proposed, **flagged to refine later** (CA-00: job filters, refusal rules, thresholds):

1. **Weekly on Monday morning**, changeable on the routine.
2. **Criteria live in the app** and the routine only reads them (R2-9); Claude never changes them on its own.
3. **Triage is all-or-nothing** on the criteria; the closest rejects are reported so the criteria can be tuned.
4. **No digest when nothing happened.**
5. **The routine closes silent applications** after 3 weeks.
6. **The first criteria** come from career-os's `positioning.md` (lanes, auto-reject) and `profile.md` (hours, constraints), entered in CA-00.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
