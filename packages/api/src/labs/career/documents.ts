// Career documents services (docs/prd/22-career-documents.md): the brief every
// document is written from, the selection a document used (IDs only, never
// the file), each job's application kit, and the standard answers the copy
// panel copies. Documents themselves are never stored (R3-1).
import {
  ATS_MIN_SCORE,
  ATS_RULES,
  ATS_SCORING,
  atsCeiling,
  atsKeywords,
  DOCUMENT_LAYOUT,
  type DocumentKind,
  type FactRef,
  rankExperiences,
  rankFacts,
  rankSkills,
  type SalaryRange,
  type SelectionItemKind,
  type saveJobKitInputSchema,
  type saveSelectionInputSchema,
  type saveStandardAnswersInputSchema,
  WRITING_RULES,
} from "@projects-lab/shared/career";
import type { z } from "zod";
import { ToolError } from "../../core/lab";
import { getJob, type Study } from "./jobs";
import { getProfile, type ProfileFact } from "./profile";

const rows = <T>(result: D1Result | undefined): T[] =>
  (result?.results ?? []) as T[];

type Where = { kind: "experience" | "education"; id: string } | null;
type BriefFact = FactRef & {
  text: string;
  skills: ProfileFact["skills"];
  where: Where;
};

export interface SelectionItem {
  kind: SelectionItemKind;
  id: string;
}

export interface Selection {
  variant: string;
  items: SelectionItem[];
}

async function readSelection(
  db: D1Database,
  jobId: string,
): Promise<Selection | null> {
  const { results } = await db
    .prepare(
      "SELECT item_kind AS kind, item_id AS id, variant FROM career_job_item WHERE job_id = ? ORDER BY position",
    )
    .bind(jobId)
    .all<SelectionItem & { variant: string }>();
  const first = results[0];
  return first
    ? {
        variant: first.variant,
        items: results.map(({ kind, id }) => ({ kind, id })),
      }
    : null;
}

/**
 * Everything a document for this job is written from, and nothing else: the
 * job, the profile's verified facts ranked by the job's skills, the unverified
 * ones the job needs apart as `askFirst`, the skills posting-first, the last
 * selection, and the writing rules and layout as text (§6.4).
 */
export async function documentBrief(
  db: D1Database,
  study: Study,
  { jobId, kind }: { jobId: string; kind: DocumentKind },
) {
  const [job, profile, selection] = await Promise.all([
    getJob(db, study, jobId),
    getProfile(db),
    readSelection(db, jobId),
  ]);
  const jobSkills = new Set(
    job.requirements.flatMap((r) => (r.skillId ? [r.skillId] : [])),
  );

  const toRef = (fact: ProfileFact, where: Where): BriefFact => ({
    id: fact.id,
    text: fact.text,
    verified: fact.verified,
    experienceId: where?.kind === "experience" ? where.id : null,
    skillIds: fact.skills.map((s) => s.id),
    skills: fact.skills,
    position: fact.position,
    where,
  });
  const all = [
    ...profile.experiences.flatMap((e) =>
      e.facts.map((f) => toRef(f, { kind: "experience", id: e.id })),
    ),
    ...profile.education.flatMap((e) =>
      e.facts.map((f) => toRef(f, { kind: "education", id: e.id })),
    ),
    ...profile.facts.map((f) => toRef(f, null)),
  ];
  const { facts, askFirst } = rankFacts(all, jobSkills);
  const brief = (fact: (typeof facts)[number]) => ({
    id: fact.id,
    text: fact.text,
    skills: fact.skills.map((s) => s.name),
    matches: fact.matches,
  });
  const under = (where: NonNullable<Where>) =>
    facts
      .filter((f) => f.where?.kind === where.kind && f.where.id === where.id)
      .map(brief);

  // Verified in Study, among the skills this brief can name (the contract
  // answers for given skills; it can't list all of Study).
  const names = new Map<string, string>();
  for (const r of job.requirements)
    if (r.skillId && r.skill) names.set(r.skillId, r.skill);
  for (const f of all) for (const s of f.skills) names.set(s.id, s.name);
  for (const s of profile.skills) names.set(s.skillId, s.name);
  const status = names.size
    ? await study(db).skillStatus([...names.keys()])
    : [];
  const verified = new Set(
    status.filter((s) => s.verified).map((s) => s.skillId),
  );
  const declared = new Map(profile.skills.map((s) => [s.skillId, s]));
  const skills = rankSkills(
    [...names.entries()]
      .filter(([id]) => declared.has(id) || verified.has(id))
      .map(([skillId, name]) => ({
        skillId,
        name,
        level: declared.get(skillId)?.level ?? null,
        years: declared.get(skillId)?.years ?? null,
        verified: verified.has(skillId),
        inPosting: jobSkills.has(skillId),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    jobSkills,
  );

  // A resume's ATS check (CA-17): the job's keywords, the formula, and the
  // best score the owner's evidence allows (a verified fact for the skill, a
  // declared skill, or one Study verified).
  let ats = null;
  if (kind === "resume") {
    const requirementSkills = [...jobSkills];
    const { results: aliasRows } = requirementSkills.length
      ? await db
          .prepare(
            "SELECT id, aliases_json AS aliasesJson FROM skill WHERE id IN (SELECT value FROM json_each(?))",
          )
          .bind(JSON.stringify(requirementSkills))
          .all<{ id: string; aliasesJson: string }>()
      : { results: [] };
    const aliases = new Map(
      aliasRows.map((row) => [row.id, JSON.parse(row.aliasesJson) as string[]]),
    );
    const keywords = atsKeywords(job.requirements, aliases);
    const evidenced = new Set([
      ...facts.flatMap((f) => f.skillIds),
      ...declared.keys(),
      ...verified,
    ]);
    const ceiling = atsCeiling(keywords, evidenced);
    ats = {
      minScore: ATS_MIN_SCORE,
      scoring: ATS_SCORING,
      keywords: keywords.map(({ skillId: _, ...k }) => k),
      ceiling: {
        score: ceiling.score,
        missing: ceiling.missing.map((k) => k.requirement),
      },
      rules: [...ATS_RULES],
    };
  }

  return {
    kind,
    job: {
      id: job.id,
      company: job.company,
      role: job.role,
      seniority: job.seniority,
      language: job.language,
      workShape: job.workShape,
      requirements: job.requirements.map((r) => ({
        text: r.text,
        type: r.type,
        skill: r.skill,
        readiness: r.readiness,
      })),
      notMapped: job.notMapped.map((r) => r.text),
      fitNotes: job.fitNotes,
    },
    person: profile.person,
    links: profile.links,
    experiences: rankExperiences(profile.experiences, facts).map(
      ({ facts: _, matches, ...e }) => ({
        ...e,
        matches,
        facts: under({ kind: "experience", id: e.id }),
      }),
    ),
    education: profile.education.map(({ facts: _, ...e }) => ({
      ...e,
      facts: under({ kind: "education", id: e.id }),
    })),
    otherFacts: facts.filter((f) => f.where === null).map(brief),
    askFirst: askFirst.map((f) => ({ ...brief(f), where: f.where })),
    skills,
    selection,
    rules: [...WRITING_RULES],
    layout: [...DOCUMENT_LAYOUT],
    // Resumes only (CA-17); null for a cover letter or another document.
    ats,
  };
}

async function requireLiveJob(db: D1Database, jobId: string): Promise<void> {
  const job = await db
    .prepare("SELECT 1 FROM career_job WHERE id = ? AND deleted_at IS NULL")
    .bind(jobId)
    .first();
  if (!job) throw new ToolError("not_found", `No job ${jobId}`);
}

const LIVE: Record<SelectionItemKind, string> = {
  fact: "SELECT id, verified FROM career_fact WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))",
  experience:
    "SELECT id, 1 AS verified FROM career_experience WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))",
  education:
    "SELECT id, 1 AS verified FROM career_education WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))",
  skill:
    "SELECT id, 1 AS verified FROM skill WHERE deleted_at IS NULL AND id IN (SELECT value FROM json_each(?))",
};

/**
 * Replaces the job's selection with the IDs a document used (A-7). Every item
 * is live, and a fact is verified: an unverified one is confirmed with the
 * owner and saved verified first, so a document never rests on it.
 */
export async function saveSelection(
  db: D1Database,
  { jobId, items, variant, ats }: z.infer<typeof saveSelectionInputSchema>,
  now: Date,
): Promise<Selection> {
  await requireLiveJob(db, jobId);
  const kinds = Object.keys(LIVE) as SelectionItemKind[];
  const found = await db.batch(
    kinds.map((kind) =>
      db
        .prepare(LIVE[kind])
        .bind(
          JSON.stringify(
            items.filter((item) => item.kind === kind).map((item) => item.id),
          ),
        ),
    ),
  );
  const live = new Map(
    kinds.flatMap((kind, i) =>
      rows<{ id: string; verified: number }>(found[i]).map(
        (row) => [`${kind}:${row.id}`, row.verified === 1] as const,
      ),
    ),
  );
  for (const item of items) {
    const verified = live.get(`${item.kind}:${item.id}`);
    if (verified === undefined)
      throw new ToolError(
        "not_found",
        `No ${item.kind} ${item.id} in the profile`,
      );
    if (!verified)
      throw new ToolError(
        "bad_request",
        `Fact ${item.id} is unverified: confirm it with the owner, save it with verified: true, then save the selection`,
      );
  }
  await db.batch([
    db.prepare("DELETE FROM career_job_item WHERE job_id = ?").bind(jobId),
    ...items.map((item, position) =>
      db
        .prepare(
          "INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(jobId, item.kind, item.id, variant, position),
    ),
    // The resume's ATS check, kept on the kit (CA-17): a number and a list,
    // never the file. Saved without one, the last score stays.
    ...(ats
      ? [
          db
            .prepare(
              `INSERT INTO career_job_kit (job_id, ats_score, ats_missing_json, ats_scored_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?4)
               ON CONFLICT (job_id) DO UPDATE SET ats_score = excluded.ats_score,
                 ats_missing_json = excluded.ats_missing_json,
                 ats_scored_at = excluded.ats_scored_at, updated_at = excluded.updated_at`,
            )
            .bind(
              jobId,
              ats.score,
              JSON.stringify(ats.missing),
              now.toISOString(),
            ),
        ]
      : []),
  ]);
  return { variant, items };
}

export interface JobKit {
  jobId: string;
  intro: string;
  salary: SalaryRange | null;
  answers: { question: string; answer: string }[];
  /** What the last document used, each with a label to show. */
  selection: {
    variant: string;
    items: (SelectionItem & { label: string })[];
  } | null;
  /** The last resume's ATS check (CA-17). */
  ats: { score: number; missing: string[]; scoredAt: string } | null;
}

/** The Documents tab's view of a job: what the application copies and what the last document used. */
export async function getJobKit(
  db: D1Database,
  jobId: string,
): Promise<JobKit> {
  await requireLiveJob(db, jobId);
  const [kit, answers, items] = await db.batch([
    db
      .prepare(
        `SELECT intro, salary_min AS min, salary_max AS max, salary_currency AS currency,
           salary_period AS period, ats_score AS atsScore, ats_missing_json AS atsMissingJson,
           ats_scored_at AS atsScoredAt FROM career_job_kit WHERE job_id = ?`,
      )
      .bind(jobId),
    db
      .prepare(
        "SELECT question, answer FROM career_form_answer WHERE job_id = ? ORDER BY position",
      )
      .bind(jobId),
    db
      .prepare(
        `SELECT i.item_kind AS kind, i.item_id AS id, i.variant,
           CASE i.item_kind
             WHEN 'fact' THEN (SELECT text FROM career_fact WHERE id = i.item_id)
             WHEN 'experience' THEN (SELECT title || ' · ' || organization FROM career_experience WHERE id = i.item_id)
             WHEN 'education' THEN (SELECT degree || ' · ' || institution FROM career_education WHERE id = i.item_id)
             WHEN 'skill' THEN (SELECT name FROM skill WHERE id = i.item_id)
           END AS label
         FROM career_job_item i WHERE i.job_id = ? ORDER BY i.position`,
      )
      .bind(jobId),
  ]);
  const row = rows<{
    intro: string;
    min: number | null;
    max: number | null;
    currency: string | null;
    period: string | null;
    atsScore: number | null;
    atsMissingJson: string;
    atsScoredAt: string | null;
  }>(kit)[0];
  const selected = rows<SelectionItem & { variant: string; label: string }>(
    items,
  );
  return {
    jobId,
    intro: row?.intro ?? "",
    salary:
      row && row.min !== null && row.max !== null
        ? {
            min: row.min,
            max: row.max,
            currency: row.currency as string,
            period: row.period as string,
          }
        : null,
    answers: rows<{ question: string; answer: string }>(answers),
    selection: selected[0]
      ? {
          variant: selected[0].variant,
          items: selected.map(({ kind, id, label }) => ({ kind, id, label })),
        }
      : null,
    ats:
      row && row.atsScore !== null && row.atsScoredAt !== null
        ? {
            score: row.atsScore,
            missing: JSON.parse(row.atsMissingJson) as string[],
            scoredAt: row.atsScoredAt,
          }
        : null,
  };
}

/** Each part given replaces the saved one; `salary: null` clears it (K-16). */
export async function saveJobKit(
  db: D1Database,
  input: z.infer<typeof saveJobKitInputSchema>,
  now: Date,
): Promise<JobKit> {
  await requireLiveJob(db, input.jobId);
  const stamp = now.toISOString();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO career_job_kit (job_id, updated_at) VALUES (?1, ?2) ON CONFLICT (job_id) DO UPDATE SET updated_at = ?2",
      )
      .bind(input.jobId, stamp),
  ];
  if (input.intro !== undefined)
    statements.push(
      db
        .prepare("UPDATE career_job_kit SET intro = ? WHERE job_id = ?")
        .bind(input.intro, input.jobId),
    );
  if (input.salary !== undefined)
    statements.push(
      db
        .prepare(
          `UPDATE career_job_kit SET salary_min = ?, salary_max = ?, salary_currency = ?,
             salary_period = ? WHERE job_id = ?`,
        )
        .bind(
          input.salary?.min ?? null,
          input.salary?.max ?? null,
          input.salary?.currency ?? null,
          input.salary?.period ?? null,
          input.jobId,
        ),
    );
  if (input.answers !== undefined)
    statements.push(
      db
        .prepare("DELETE FROM career_form_answer WHERE job_id = ?")
        .bind(input.jobId),
      ...input.answers.map((answer, position) =>
        db
          .prepare(
            "INSERT INTO career_form_answer (id, job_id, question, answer, position) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(
            crypto.randomUUID(),
            input.jobId,
            answer.question,
            answer.answer,
            position,
          ),
      ),
    );
  await db.batch(statements);
  return getJobKit(db, input.jobId);
}

export interface StandardAnswer {
  label: string;
  value: string;
}

/** The copy panel's fixed answers ("Notice period: 30 days"), in order. */
export async function listStandardAnswers(
  db: D1Database,
): Promise<StandardAnswer[]> {
  const { results } = await db
    .prepare(
      "SELECT label, value FROM career_standard_answer ORDER BY position",
    )
    .all<StandardAnswer>();
  return results;
}

/** Replaces the standard answers, in this order; labels unique ignoring case (K-18). */
export async function saveStandardAnswers(
  db: D1Database,
  { answers }: z.infer<typeof saveStandardAnswersInputSchema>,
): Promise<StandardAnswer[]> {
  await db.batch([
    db.prepare("DELETE FROM career_standard_answer"),
    ...answers.map((answer, position) =>
      db
        .prepare(
          "INSERT INTO career_standard_answer (id, label, value, position) VALUES (?, ?, ?, ?)",
        )
        .bind(crypto.randomUUID(), answer.label, answer.value, position),
    ),
  ]);
  return listStandardAnswers(db);
}
