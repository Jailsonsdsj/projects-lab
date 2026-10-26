# Career documents

Resumes, cover letters and any other career file are **generated on demand by Claude from the profile, returned to the owner, and never stored** (R3-1, architecture §6.4). The app keeps what a document is made *from* and what an application needs to *copy*: per job, the selected profile items, the self-introduction, the salary range and the form answers (A-7); for every form, the copy panel. Sources: architecture §6.4, A-7, R2-11, R2-12, SP-02, career-os's `/tailor-resume` rules, the bundle's "Profile copy panel" screens. Profile is `20`, jobs `21`.

## `career_document_brief`

A read tool. Claude calls it before writing any document for a job; it's the only input a document is written from, so a resume made on the phone matches one made in Claude Code (§6.4).

`{ jobId, kind }` (`resume`, `cover_letter`, `other`) returns:

- **The job:** company, role, the posting's **language**, requirements with their readiness (`21`), and its fit notes.
- **The profile items that fit**: person and links, experiences and education with their **verified** facts, ranked by how many of the job's skills each evidences; declared and verified skills, the posting's first. Unverified facts come back apart, as `ask_first`, never in the main list.
- **The job's saved selection**, if a document was made before (A-7), so a second version starts from the first.
- **The writing rules** (below) and **the layout** (below), as text.

After writing, Claude saves what it used with `career_save_selection { jobId, items: [{ kind, id }], variant }`: the IDs only, never the file. Every item must be live, and a fact verified: an unverified one is confirmed with the owner and saved verified first (CA-05), so no document rests on an unconfirmed claim even if a step is skipped.

## Writing rules (returned by the brief; career-os `/tailor-resume`)

1. **Every claim traces to a fact.** Select, reorder and reword to the posting's vocabulary where the fact genuinely matches; never add an experience, a skill or a number.
2. **Unverified facts are out** unless the owner confirms them in this session; ask once, at the start, listing exactly the ones this job needs.
3. **The document's language is the posting's**, never the conversation's.
4. **A resume is one page.** Summary rewritten for the client's actual problem (usually implied by the posting); skills reordered posting-first, none added.
5. **A cover note is at most 150 words, three paragraphs**: why this problem, the one most relevant piece of evidence, availability (hours, timezone, start) stated plainly.
6. **If the posting needs a core skill the owner lacks, say so before writing**, not after.

## ATS check (CA-17; resumes only)

The owner's rule: **a delivered resume scores at least 80%** for the job's ATS keywords, without padding. The app never sees the resume (R3-1), so the brief carries what every surface needs to score its draft the same way (`shared/career/ats.ts`):

- **Keywords:** one per requirement mapped to a skill (unmapped ones aren't scored): the skill's name and its aliases ("PostgreSQL", "Postgres", "PG"); **required weighs 2, nice-to-have 1**.
- **Formula:** a keyword is covered when any of its terms appears as a whole word (no letter or digit right before or after it, so "Java" isn't in "JavaScript" and "C++" still counts), ignoring case and accents. Score = covered weight / all weight, a whole percent **rounded down** (79.9 fails). Pass: **80** (`ATS_MIN_SCORE`).
- **The ceiling:** the best score an honest resume can reach, computed by the app before anything is written: only keywords whose skill the owner has evidence for count (a verified fact for it, a declared skill, or a skill Study verified), with the requirements that hold it down.

The rules the brief returns with it (`ats.rules`):

1. **Ceiling below 80: stop before writing.** Tell the owner the ceiling and the missing requirements, offer to send them to the Study backlog (`career_send_gaps`), and write only if the owner says to go ahead below 80%. Never pad.
2. **Score the draft**; below 80, revise with true facts only (the posting's exact term where a fact genuinely shows it, a skill the owner has) and score again. Never deliver below 80 unless the owner accepted it beforehand.
3. Keywords in the posting's exact spelling; an acronym and its full form once; keywords in context (summary, bullets), not only in the skills list.
4. Standard section headings (Summary, Experience, Education, Skills, Languages), in the posting's language.
5. Real text only: no tables, text boxes, columns, images or icons; nothing that matters in a header or footer; contact details in the body.
6. One date format throughout; plain bullets.
7. A text-based PDF or a DOCX, never a scan.
8. Tell the owner the score and the missing keywords, and save them with `career_save_selection`'s `ats`: the **job's kit** keeps the last resume's score, missing keywords and when (a number and a list, never the file), and the Documents tab shows them (CA-17b).

## Layout (returned by the brief)

One column, the owner's name and links at the top, sections in this order: summary, experience (facts as bullets), education, skills, languages; one font named (Helvetica in a PDF, a standard font with nothing to embed; Arial in a DOCX) so every surface renders the same (SP-02 saw one PDF switch fonts mid-title), 2 cm margins, and the filename `<Name>__<company>__<kind>.<pdf|docx>`. PDF by default, DOCX when the form asks for Word. Claude builds the file in its own sandbox (SP-02: every surface can hand it to the owner).

## Per job: what the app keeps (A-7)

| Field | Rule |
|---|---|
| **Selected items** | The fact, experience, education and skill IDs the last document used, and the variant (`ai`, `frontend`, …) |
| **Self-introduction** (R2-11) | The spoken "tell me about yourself" for this role, text, at most 1,500 characters |
| **Salary range** | Minimum and maximum as **integers in whole currency units** (no floats), currency (ISO code: BRL, USD, EUR, GBP, CAD, AUD, CHF until CA-00 extends it), period (`hour`, `month`, `year`); what the owner will ask for this job |
| **Form answers** | Question and answer pairs for the application form ("Why this company?"), each answer at most 2,000 characters |

Claude writes them with `career_save_job_kit` (intro, range, answers) after the owner agrees on them in the chat; the owner edits them in the app.

## Copy panel (R2-12, the bundle's "Profile copy panel")

On the **Profile** tab, "Tap Copy, then paste into the form":

- **Standard fields** from the profile, in this order: name, email, phone, city, state/province, country, then links (LinkedIn, GitHub and Website under those fixed labels, any other link under its own), and the owner's **standard answers** (label and value pairs such as "Notice period: 30 days", "Work authorization", "Earliest start"), each with Copy ("Copied" for `--duration-copied-hold`, then back).
- **"Answers for <job>"**: a job picker (the bundle's Select), then that job's form answers, self-introduction and salary range, each with Copy.

Copying never needs the network: the panel reads what's already loaded. Filling forms through Claude in Chrome is later (P-03).

## The Documents tab

There are no stored documents, so the tab is each job's **application kit**: the selection (which facts the last document used), the self-introduction, the salary range and the form answers, with **"Ask Claude for a document"**: a copyable prompt ("Write my resume for <job> with `career_document_brief`") for whichever Claude surface the owner is on.

## MCP tools

| Tool | Kind | Input | Returns |
|---|---|---|---|
| `career_document_brief` | read | `{ jobId, kind }` | Job, fitting items, `ask_first`, saved selection, rules, layout; for a resume, `ats` (keywords, formula, pass mark, ceiling, rules) |
| `career_save_selection` | write | `{ jobId, items: [{ kind, id }], variant, ats?: { score, missing[] } }` (a resume's ATS check: whole percent, at most 50 keywords) | `{ jobId, selection }` |
| `career_save_job_kit` | write | `{ jobId, intro?, salary?, answers? }` | `{ jobId, kit }` |
| `career_save_standard_answers` | write | `{ answers: [{ label, value }] }` | `{ answers }` |

## Invariants (merged into `99-data-model.md`)

K-15 to K-19: selection items exist and belong to the profile, salary minimum ≤ maximum with a known currency and period, text lengths, standard answer labels unique. K-29, K-30 (CA-17): a kit's ATS score and its time are set together, the score a whole 0–100; the missing keywords a JSON array of strings.

## Decisions

Approved by the owner on 2026-10-19 as proposed, **flagged to refine later** (CA-00: job filters, refusal rules, thresholds):

1. **The brief is the only input a document is written from**, and it carries the rules and the layout, so no surface needs its own skill (§6.6).
2. **Unverified facts are returned apart** (`ask_first`), never mixed in.
3. **Salary ranges are whole currency units with a period**, not cents; the owner's rate anchors (career-os `positioning.md`) seed them.
4. **The Documents tab is the per-job application kit** and a prompt to copy, since nothing is stored.
5. **Standard answers** (notice period, authorization, start) live on the profile and appear first in the copy panel.
6. **A font is named in the layout** so every surface renders the same.
7. **ATS (CA-17, 2026-10-23):** a resume scores at least 80% by the brief's formula; when the owner's evidence can't reach it, Claude stops and asks before writing, never pads; the last score is shown on the job's kit. Cover letters aren't scored.

---

*Part of the Projects Lab spec. Index: [`docs/README.md`](../README.md)*
