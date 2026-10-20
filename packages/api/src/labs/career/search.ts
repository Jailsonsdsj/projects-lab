// Career job search services (docs/prd/23-career-job-search.md): the search
// criteria (written only by the app's form, read by the weekly routine) and the
// openings the routine saves. Tracking an opening goes through addJob (CA-04a).

import { LIST_LIMIT_DEFAULT } from "@projects-lab/shared";
import {
  isStale,
  type listOpeningsInputSchema,
  type OpeningStatus,
  type saveOpeningsInputSchema,
  type saveSearchCriteriaInputSchema,
  type updateOpeningInputSchema,
} from "@projects-lab/shared/career";
import type { z } from "zod";
import { ToolError } from "../../core/lab";

const CRITERIA = "criteria";

export type SearchCriteria = z.infer<typeof saveSearchCriteriaInputSchema> & {
  updatedAt: string;
};

type CriteriaRow = {
  queriesJson: string;
  lanesJson: string;
  shapesJson: string;
  autoRejectJson: string;
  sourcesJson: string;
  maxHours: number;
  timezoneNote: string;
  rateFloor: number | null;
  rateCurrency: string | null;
  ratePeriod: string | null;
  maxAgeDays: number;
  updatedAt: string;
};

const CRITERIA_SQL = `SELECT queries_json AS queriesJson, lanes_json AS lanesJson,
  shapes_json AS shapesJson, auto_reject_json AS autoRejectJson, sources_json AS sourcesJson,
  max_hours AS maxHours, timezone_note AS timezoneNote, rate_floor AS rateFloor,
  rate_currency AS rateCurrency, rate_period AS ratePeriod, max_age_days AS maxAgeDays,
  updated_at AS updatedAt FROM career_search_criteria WHERE id = '${CRITERIA}'`;

/** The one criteria row; null until the owner saves the form. */
export async function getSearchCriteria(
  db: D1Database,
): Promise<SearchCriteria | null> {
  const row = await db.prepare(CRITERIA_SQL).first<CriteriaRow>();
  if (!row) return null;
  return {
    queries: JSON.parse(row.queriesJson),
    lanes: JSON.parse(row.lanesJson),
    shapes: JSON.parse(row.shapesJson),
    maxHours: row.maxHours,
    timezoneNote: row.timezoneNote,
    rateFloor:
      row.rateFloor === null
        ? null
        : ({
            amount: row.rateFloor,
            currency: row.rateCurrency,
            period: row.ratePeriod,
          } as SearchCriteria["rateFloor"]),
    autoReject: JSON.parse(row.autoRejectJson),
    maxAgeDays: row.maxAgeDays,
    sources: JSON.parse(row.sourcesJson),
    updatedAt: row.updatedAt,
  };
}

/** The app's form saves the whole record (K-20, K-21). Claude never calls this. */
export async function saveSearchCriteria(
  db: D1Database,
  input: z.infer<typeof saveSearchCriteriaInputSchema>,
  now: Date,
): Promise<SearchCriteria> {
  await db
    .prepare(
      `INSERT INTO career_search_criteria (id, queries_json, lanes_json, shapes_json,
         auto_reject_json, sources_json, max_hours, timezone_note, rate_floor, rate_currency,
         rate_period, max_age_days, updated_at)
       VALUES ('${CRITERIA}', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
       ON CONFLICT (id) DO UPDATE SET queries_json = ?1, lanes_json = ?2, shapes_json = ?3,
         auto_reject_json = ?4, sources_json = ?5, max_hours = ?6, timezone_note = ?7,
         rate_floor = ?8, rate_currency = ?9, rate_period = ?10, max_age_days = ?11,
         updated_at = ?12`,
    )
    .bind(
      JSON.stringify(input.queries),
      JSON.stringify(input.lanes),
      JSON.stringify(input.shapes),
      JSON.stringify(input.autoReject),
      JSON.stringify(input.sources),
      input.maxHours,
      input.timezoneNote,
      input.rateFloor?.amount ?? null,
      input.rateFloor?.currency ?? null,
      input.rateFloor?.period ?? null,
      input.maxAgeDays,
      now.toISOString(),
    )
    .run();
  return (await getSearchCriteria(db)) as SearchCriteria;
}

export interface Opening {
  id: string;
  url: string;
  company: string;
  role: string;
  lane: string;
  posting: string;
  postedOn: string | null;
  rateText: string;
  why: string;
  status: OpeningStatus;
  /** Set exactly when tracked (K-23). */
  jobId: string | null;
  /** A `new` opening 30 days old: shown muted. */
  stale: boolean;
  createdAt: string;
}

const OPENING_SQL = `SELECT id, url, company, role, lane, posting, posted_on AS postedOn,
  rate_text AS rateText, why, status, job_id AS jobId, created_at AS createdAt
  FROM career_opening`;

/**
 * Saves the routine's kept openings. A URL already saved (new, kept,
 * dismissed or tracked) is skipped, so a seen opening never comes back.
 */
export async function saveOpenings(
  db: D1Database,
  { openings }: z.infer<typeof saveOpeningsInputSchema>,
  now: Date,
): Promise<{ saved: string[]; skipped: string[] }> {
  const stamp = now.toISOString();
  const results = await db.batch(
    openings.map((opening) =>
      db
        .prepare(
          `INSERT INTO career_opening (id, url, company, role, lane, posting, posted_on, rate_text,
             why, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (url) DO NOTHING`,
        )
        .bind(
          crypto.randomUUID(),
          opening.url,
          opening.company,
          opening.role,
          opening.lane,
          opening.posting,
          opening.postedOn ?? null,
          opening.rateText ?? "",
          opening.why,
          stamp,
          stamp,
        ),
    ),
  );
  const saved: string[] = [];
  const skipped: string[] = [];
  for (const [i, opening] of openings.entries())
    (results[i]?.meta.changes ? saved : skipped).push(opening.url);
  return { saved, skipped };
}

const RANK = `CASE status WHEN 'new' THEN 0 WHEN 'kept' THEN 1 WHEN 'tracked' THEN 2 ELSE 3 END`;

const RANKED_SQL = OPENING_SQL.replace(
  "\n  FROM career_opening",
  `, ${RANK} AS rank FROM career_opening`,
);

/** `<rank>|<createdAt>|<id>` of the last row returned: where the next page starts. */
const encodeCursor = (o: Omit<Opening, "stale"> & { rank: number }) =>
  `${o.rank}|${o.createdAt}|${o.id}`;

function decodeCursor(cursor: string): [number, string, string] {
  const [rank, createdAt, id] = cursor.split("|");
  if (!rank || !createdAt || !id || !/^[0-3]$/.test(rank))
    throw new ToolError(
      "bad_request",
      "Not a cursor from this list: pass back nextCursor as given",
    );
  return [Number(rank), createdAt, id];
}

/**
 * New first, then kept, tracked, dismissed; newest first within each. Openings
 * grow every week, so the list pages: `limit` (default 50) rows, and
 * `nextCursor` while there are more.
 */
export async function listOpenings(
  db: D1Database,
  input: z.infer<typeof listOpeningsInputSchema>,
  now: Date,
): Promise<{ openings: Opening[]; nextCursor?: string }> {
  const limit = input.limit ?? LIST_LIMIT_DEFAULT;
  const where: string[] = [];
  const params: unknown[] = [];
  if (input.status) {
    where.push("status = ?");
    params.push(input.status);
  }
  if (input.cursor) {
    const [rank, createdAt, id] = decodeCursor(input.cursor);
    where.push(
      `(${RANK} > ? OR (${RANK} = ? AND (created_at < ? OR (created_at = ? AND id < ?))))`,
    );
    params.push(rank, rank, createdAt, createdAt, id);
  }
  const { results } = await db
    .prepare(
      `${RANKED_SQL}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
       ORDER BY rank, created_at DESC, id DESC LIMIT ?`,
    )
    .bind(...params, limit + 1)
    .all<Omit<Opening, "stale"> & { rank: number }>();
  const page = results.slice(0, limit);
  const last = page.at(-1);
  return {
    openings: page.map(({ rank: _, ...opening }) => ({
      ...opening,
      stale: isStale(opening, now.toISOString()),
    })),
    ...(results.length > limit && last
      ? { nextCursor: encodeCursor(last) }
      : {}),
  };
}

/** Keep or dismiss. A tracked opening follows its job instead. */
export async function updateOpening(
  db: D1Database,
  { openingId, status }: z.infer<typeof updateOpeningInputSchema>,
  now: Date,
): Promise<Opening> {
  const current = await db
    .prepare("SELECT status FROM career_opening WHERE id = ?")
    .bind(openingId)
    .first<{ status: OpeningStatus }>();
  if (!current) throw new ToolError("not_found", `No opening ${openingId}`);
  if (current.status === "tracked")
    throw new ToolError(
      "conflict",
      `Opening ${openingId} is tracked as a job: change the job instead`,
    );
  await db
    .prepare(
      "UPDATE career_opening SET status = ?, updated_at = ? WHERE id = ?",
    )
    .bind(status, now.toISOString(), openingId)
    .run();
  const opening = await db
    .prepare(`${OPENING_SQL} WHERE id = ?`)
    .bind(openingId)
    .first<Omit<Opening, "stale">>();
  if (!opening) throw new Error(`Opening ${openingId} vanished`);
  return { ...opening, stale: isStale(opening, now.toISOString()) };
}
