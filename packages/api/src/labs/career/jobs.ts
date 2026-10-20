// Career jobs services (docs/prd/21-career-jobs-and-skills.md), shared by the
// /api/career routes and the career_* tools. Readiness is computed here at read
// time from Study's skillStatus (the contract, never Study's code) and the
// profile's declarations; it's never stored. The fit's total and decision come
// from scoreFit, so a total that isn't the sum can't be saved.
import type { LabSummary, StudyContract } from "@projects-lab/shared";
import {
  type ApplicationStatus,
  type addJobInputSchema,
  currentEvent,
  type FitDecision,
  type FitScores,
  isSilent,
  jobReadiness,
  type listJobsInputSchema,
  type Readiness,
  type RequirementType,
  scoreFit,
  type sendGapsInputSchema,
  type Tally,
  type updateJobInputSchema,
  type updateRequirementInputSchema,
} from "@projects-lab/shared/career";
import type { z } from "zod";
import { ToolError } from "../../core/lab";
import { findOrCreateSkill } from "../../core/skills";

/** Career's handle on Study, built per request with that request's D1. */
export type Study = (db: D1Database) => StudyContract;

const rows = <T>(result: D1Result | undefined): T[] =>
  (result?.results ?? []) as T[];

export interface Requirement {
  id: string;
  text: string;
  type: RequirementType;
  skillId: string | null;
  /** The skill's name; null when not mapped. */
  skill: string | null;
  position: number;
}

export interface JobEvent {
  status: ApplicationStatus;
  at: string;
  note: string;
}

export interface Fit {
  total: number;
  decision: FitDecision;
  scores: FitScores;
}

export interface JobSummary {
  id: string;
  company: string;
  role: string;
  /** The latest event's status, and when. */
  status: ApplicationStatus;
  statusAt: string;
  fit: { total: number; decision: FitDecision } | null;
  readiness: { required: Tally; nice: Tally };
  /** Up to three gaps, required first. */
  nextUp: { requirementId: string; text: string; skill: string }[];
  /** Still `applied` 3 weeks on: the routine closes it (PRD 23). */
  silent: boolean;
  updatedAt: string;
}

export interface Job extends Omit<JobSummary, "fit" | "nextUp"> {
  seniority: string;
  language: string;
  workShape: string;
  sourceUrl: string | null;
  posting: string;
  fit: Fit | null;
  fitNotes: string;
  requirements: (Requirement & { readiness: Readiness })[];
  nextUp: JobSummary["nextUp"];
  notMapped: Requirement[];
  events: JobEvent[];
  createdAt: string;
}

type JobRow = {
  id: string;
  company: string;
  role: string;
  seniority: string;
  language: string;
  workShape: string;
  sourceUrl: string | null;
  posting: string;
  fitTotal: number | null;
  fitConstraints: number | null;
  fitSkills: number | null;
  fitGrowth: number | null;
  fitPay: number | null;
  fitSignal: number | null;
  decision: FitDecision | null;
  fitNotes: string;
  createdAt: string;
  updatedAt: string;
};

const JOB_SQL = `SELECT id, company, role, seniority, language, work_shape AS workShape,
  source_url AS sourceUrl, posting, fit_total AS fitTotal, fit_constraints AS fitConstraints,
  fit_skills AS fitSkills, fit_growth AS fitGrowth, fit_pay AS fitPay, fit_signal AS fitSignal,
  decision, fit_notes AS fitNotes, created_at AS createdAt, updated_at AS updatedAt
  FROM career_job WHERE deleted_at IS NULL`;

const REQUIREMENT_SQL = `SELECT r.id, r.job_id AS jobId, r.text, r.type, r.skill_id AS skillId,
  s.name AS skill, r.position
  FROM career_requirement r LEFT JOIN skill s ON s.id = r.skill_id`;

const EVENT_SQL =
  "SELECT job_id AS jobId, status, at, note FROM career_job_event";

const toFit = (row: JobRow): Fit | null =>
  row.fitTotal === null || row.decision === null
    ? null
    : {
        total: row.fitTotal,
        decision: row.decision,
        scores: {
          constraints: row.fitConstraints as number,
          skills: row.fitSkills as number,
          growth: row.fitGrowth as number,
          pay: row.fitPay as number,
          signal: row.fitSignal as number,
        },
      };

/** Verified (Study) and Declared (profile) skills among these, read now. */
async function readinessSets(
  db: D1Database,
  study: Study,
  skillIds: readonly string[],
): Promise<{ verified: Set<string>; declared: Set<string> }> {
  const ids = [...new Set(skillIds)];
  if (ids.length === 0) return { verified: new Set(), declared: new Set() };
  const [status, declared] = await Promise.all([
    study(db).skillStatus(ids),
    db
      .prepare(
        "SELECT skill_id AS skillId FROM career_declared_skill WHERE skill_id IN (SELECT value FROM json_each(?))",
      )
      .bind(JSON.stringify(ids))
      .all<{ skillId: string }>(),
  ]);
  return {
    verified: new Set(status.filter((s) => s.verified).map((s) => s.skillId)),
    declared: new Set(declared.results.map((d) => d.skillId)),
  };
}

type Built = { job: Job; summary: JobSummary };

function build(
  row: JobRow,
  requirements: Requirement[],
  events: JobEvent[],
  sets: { verified: Set<string>; declared: Set<string> },
  now: Date,
): Built {
  const readiness = jobReadiness(requirements, sets.verified, sets.declared);
  // Stable: same-instant events keep their insert order (rowid).
  const ordered = [...events].sort((a, b) =>
    a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  );
  const current = currentEvent(ordered);
  const nextUp = readiness.nextUp.map((r) => ({
    requirementId: r.id,
    text: r.text,
    skill: r.skill as string,
  }));
  const fit = toFit(row);
  const common = {
    id: row.id,
    company: row.company,
    role: row.role,
    // Every job is created with its `evaluated` event, in the same batch.
    status: current?.status ?? "evaluated",
    statusAt: current?.at ?? row.createdAt,
    readiness: { required: readiness.required, nice: readiness.nice },
    nextUp,
    silent: isSilent(ordered, now.toISOString()),
    updatedAt: row.updatedAt,
  } satisfies Partial<JobSummary>;
  return {
    summary: {
      ...common,
      fit: fit && { total: fit.total, decision: fit.decision },
    },
    job: {
      ...common,
      seniority: row.seniority,
      language: row.language,
      workShape: row.workShape,
      sourceUrl: row.sourceUrl,
      posting: row.posting,
      fit,
      fitNotes: row.fitNotes,
      requirements: readiness.requirements,
      notMapped: readiness.notMapped,
      events: ordered,
      createdAt: row.createdAt,
    },
  };
}

/** Live jobs with their requirements, events and readiness, built at read time. */
async function loadJobs(
  db: D1Database,
  study: Study,
  jobId?: string,
): Promise<Built[]> {
  const where = jobId ? " AND id = ?1" : "";
  const inJob = jobId
    ? "WHERE job_id = ?1"
    : "WHERE job_id IN (SELECT id FROM career_job WHERE deleted_at IS NULL)";
  const bind = (sql: string) =>
    jobId ? db.prepare(sql).bind(jobId) : db.prepare(sql);
  const [jobs, requirements, events] = await db.batch([
    bind(`${JOB_SQL}${where}`),
    bind(
      `${REQUIREMENT_SQL} ${inJob.replace("job_id", "r.job_id")} ORDER BY r.position`,
    ),
    bind(`${EVENT_SQL} ${inJob} ORDER BY at, rowid`),
  ]);
  const reqs = rows<Requirement & { jobId: string }>(requirements);
  const evts = rows<JobEvent & { jobId: string }>(events);
  const sets = await readinessSets(
    db,
    study,
    reqs.flatMap((r) => (r.skillId ? [r.skillId] : [])),
  );
  const now = new Date();
  return rows<JobRow>(jobs).map((row) =>
    build(
      row,
      reqs.filter((r) => r.jobId === row.id).map(({ jobId: _, ...r }) => r),
      evts.filter((e) => e.jobId === row.id).map(({ jobId: _, ...e }) => e),
      sets,
      now,
    ),
  );
}

/** One live job with everything the Job screen shows; not_found otherwise. */
export async function getJob(
  db: D1Database,
  study: Study,
  jobId: string,
): Promise<Job> {
  const [built] = await loadJobs(db, study, jobId);
  if (!built) throw new ToolError("not_found", `No job ${jobId}`);
  return built.job;
}

const share = ({ ready, total }: Tally) => (total === 0 ? -1 : ready / total);

/** Live jobs, best readiness first (jobs with no required skills last), newest on a tie. */
export async function listJobs(
  db: D1Database,
  study: Study,
  { status }: z.infer<typeof listJobsInputSchema>,
): Promise<JobSummary[]> {
  return (await loadJobs(db, study))
    .map(({ summary }) => summary)
    .filter((job) => status === undefined || job.status === status)
    .sort(
      (a, b) =>
        share(b.readiness.required) - share(a.readiness.required) ||
        (a.updatedAt < b.updatedAt ? 1 : -1),
    );
}

async function skillIdOf(
  db: D1Database,
  name: string | undefined,
  stamp: string,
): Promise<string | null> {
  return name === undefined
    ? null
    : (await findOrCreateSkill(db, name, stamp)).id;
}

/**
 * Saves a mapped job: the posting, its requirements with their skills (found
 * or created in the registry), the scored fit and its first `evaluated` event,
 * in one batch. From an opening, that opening becomes tracked (K-23).
 */
export async function addJob(
  db: D1Database,
  study: Study,
  input: z.infer<typeof addJobInputSchema>,
  now: Date,
): Promise<Job> {
  const stamp = now.toISOString();
  if (input.openingId) {
    const opening = await db
      .prepare("SELECT status FROM career_opening WHERE id = ?")
      .bind(input.openingId)
      .first<{ status: string }>();
    if (!opening)
      throw new ToolError("not_found", `No opening ${input.openingId}`);
    if (opening.status === "tracked")
      throw new ToolError(
        "conflict",
        `Opening ${input.openingId} is already tracked as a job`,
      );
  }
  const skillIds: (string | null)[] = [];
  for (const requirement of input.requirements)
    skillIds.push(await skillIdOf(db, requirement.skill, stamp));
  const { total, decision } = scoreFit(input.fit);
  const id = crypto.randomUUID();

  await db.batch([
    db
      .prepare(
        `INSERT INTO career_job (id, company, role, seniority, language, work_shape, source_url, posting,
           fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, fit_notes,
           created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17)`,
      )
      .bind(
        id,
        input.company,
        input.role,
        input.seniority ?? "",
        input.language,
        input.workShape ?? "",
        input.sourceUrl ?? null,
        input.posting,
        total,
        input.fit.constraints,
        input.fit.skills,
        input.fit.growth,
        input.fit.pay,
        input.fit.signal,
        decision,
        input.fitNotes ?? "",
        stamp,
      ),
    ...input.requirements.map((requirement, position) =>
      db
        .prepare(
          "INSERT INTO career_requirement (id, job_id, text, type, skill_id, position) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          requirement.text,
          requirement.type,
          skillIds[position] ?? null,
          position,
        ),
    ),
    db
      .prepare(
        "INSERT INTO career_job_event (id, job_id, status, at) VALUES (?, ?, 'evaluated', ?)",
      )
      .bind(crypto.randomUUID(), id, stamp),
    ...(input.openingId
      ? [
          db
            .prepare(
              "UPDATE career_opening SET status = 'tracked', job_id = ?, updated_at = ? WHERE id = ?",
            )
            .bind(id, stamp, input.openingId),
        ]
      : []),
  ]);
  return getJob(db, study, id);
}

async function requireLiveJob(
  db: D1Database,
  jobId: string,
): Promise<{ company: string }> {
  const job = await db
    .prepare(
      "SELECT company FROM career_job WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(jobId)
    .first<{ company: string }>();
  if (!job) throw new ToolError("not_found", `No job ${jobId}`);
  return job;
}

/** A status change appends an event (K-12); new fit scores are re-scored. */
export async function updateJob(
  db: D1Database,
  study: Study,
  input: z.infer<typeof updateJobInputSchema>,
  now: Date,
): Promise<Job> {
  await requireLiveJob(db, input.jobId);
  const stamp = now.toISOString();
  const statements: D1PreparedStatement[] = [];
  if (input.status)
    statements.push(
      db
        .prepare(
          "INSERT INTO career_job_event (id, job_id, status, at, note) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          crypto.randomUUID(),
          input.jobId,
          input.status,
          stamp,
          input.note ?? "",
        ),
    );
  if (input.fit) {
    const { total, decision } = scoreFit(input.fit);
    statements.push(
      db
        .prepare(
          `UPDATE career_job SET fit_total = ?, fit_constraints = ?, fit_skills = ?, fit_growth = ?,
             fit_pay = ?, fit_signal = ?, decision = ? WHERE id = ?`,
        )
        .bind(
          total,
          input.fit.constraints,
          input.fit.skills,
          input.fit.growth,
          input.fit.pay,
          input.fit.signal,
          decision,
          input.jobId,
        ),
    );
  }
  if (input.fitNotes !== undefined)
    statements.push(
      db
        .prepare("UPDATE career_job SET fit_notes = ? WHERE id = ?")
        .bind(input.fitNotes, input.jobId),
    );
  statements.push(
    db
      .prepare("UPDATE career_job SET updated_at = ? WHERE id = ?")
      .bind(stamp, input.jobId),
  );
  await db.batch(statements);
  return getJob(db, study, input.jobId);
}

/** Changes a requirement's type or skill, keeping K-9 (a skill exactly when mapped). */
export async function updateRequirement(
  db: D1Database,
  study: Study,
  input: z.infer<typeof updateRequirementInputSchema>,
  now: Date,
): Promise<Job> {
  const current = await db
    .prepare(
      `SELECT r.job_id AS jobId, r.type, r.skill_id AS skillId FROM career_requirement r
       JOIN career_job j ON j.id = r.job_id WHERE r.id = ? AND j.deleted_at IS NULL`,
    )
    .bind(input.requirementId)
    .first<{ jobId: string; type: RequirementType; skillId: string | null }>();
  if (!current)
    throw new ToolError("not_found", `No requirement ${input.requirementId}`);
  const stamp = now.toISOString();
  const type = input.type ?? current.type;
  const skillId =
    input.skill === undefined
      ? type === "not_mapped"
        ? null
        : current.skillId
      : input.skill === null
        ? null
        : await skillIdOf(db, input.skill, stamp);
  if ((type === "not_mapped") !== (skillId === null))
    throw new ToolError(
      "bad_request",
      type === "not_mapped"
        ? "A not-mapped requirement has no skill"
        : "A required or nice requirement needs a skill: give `skill`",
    );
  await db.batch([
    db
      .prepare(
        "UPDATE career_requirement SET type = ?, skill_id = ? WHERE id = ?",
      )
      .bind(type, skillId, input.requirementId),
    db
      .prepare("UPDATE career_job SET updated_at = ? WHERE id = ?")
      .bind(stamp, current.jobId),
  ]);
  return getJob(db, study, current.jobId);
}

/** Stops tracking a job (K-14: soft). Its Study topics stay. */
export async function removeJob(
  db: D1Database,
  jobId: string,
  now: Date,
): Promise<void> {
  const result = await db
    .prepare(
      "UPDATE career_job SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
    )
    .bind(now.toISOString(), jobId)
    .run();
  if (result.meta.changes === 0)
    throw new ToolError("not_found", `No job ${jobId}`);
}

export interface SentGap {
  requirementId: string;
  skill: string;
  /** The Study topic, new or existing ("AI-03"). */
  topicId: string;
  created: boolean;
}

/**
 * Sends a job's gaps to the Study backlog through the contract's ensureTopics:
 * each a mapped requirement of this job whose skill Study hasn't verified (a
 * declared one may still be studied). Sending again returns the same topics.
 */
export async function sendGaps(
  db: D1Database,
  study: Study,
  { jobId, gaps }: z.infer<typeof sendGapsInputSchema>,
): Promise<SentGap[]> {
  const job = await requireLiveJob(db, jobId);
  const found = await db
    .prepare(
      `${REQUIREMENT_SQL} WHERE r.job_id = ? AND r.id IN (SELECT value FROM json_each(?))`,
    )
    .bind(jobId, JSON.stringify(gaps.map((gap) => gap.requirementId)))
    .all<Requirement>();
  const byId = new Map(found.results.map((r) => [r.id, r]));
  const chosen = gaps.map((gap) => {
    const requirement = byId.get(gap.requirementId);
    if (!requirement)
      throw new ToolError(
        "not_found",
        `No requirement ${gap.requirementId} in job ${jobId}`,
      );
    if (requirement.skillId === null)
      throw new ToolError(
        "bad_request",
        `"${requirement.text}" isn't mapped to a skill, so a course can't close it`,
      );
    return { gap, requirement, skillId: requirement.skillId };
  });

  const contract = study(db);
  const status = await contract.skillStatus(chosen.map((c) => c.skillId));
  const verified = chosen.find(
    (c) => status.find((s) => s.skillId === c.skillId)?.verified,
  );
  if (verified)
    throw new ToolError(
      "bad_request",
      `${verified.requirement.skill} is already verified in Study, not a gap`,
    );

  const topics = await contract.ensureTopics(
    chosen.map(({ gap, skillId }) => ({
      skillId,
      area: gap.area,
      priority: gap.priority,
      note: `Job: ${job.company}`,
    })),
  );
  return chosen.map(({ gap, requirement }, i) => ({
    requirementId: gap.requirementId,
    skill: requirement.skill as string,
    topicId: (topics[i] as { topicId: string }).topicId,
    created: (topics[i] as { created: boolean }).created,
  }));
}

/** Home's Career card: the best-ready job, or null with no jobs. */
export async function getHomeSummary(
  db: D1Database,
  study: Study,
): Promise<LabSummary | null> {
  const jobs = await listJobs(db, study, {});
  const best = jobs[0];
  if (!best) return null;
  const { ready, total } = best.readiness.required;
  return {
    stats: [
      { value: `${ready}/${total}`, label: "Required ready" },
      { value: String(total - ready), label: "Gaps" },
      { value: String(jobs.length), label: "Jobs tracked" },
    ],
    foot: { label: "Best match", value: `${best.role} · ${best.company}` },
    href: `/career/jobs/${best.id}`,
  };
}
