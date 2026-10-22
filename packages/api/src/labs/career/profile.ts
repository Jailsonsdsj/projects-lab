// Career profile services (docs/prd/20-career-profile.md), shared by the
// /api/career routes and the career_* tools. Inputs are already validated by
// @projects-lab/shared/career's schemas. On an update an omitted field is
// kept and `null` clears it. Multi-statement writes go in one db.batch().
import {
  type declareSkillInputSchema,
  endNotBeforeStart,
  type removeItemInputSchema,
  type saveEducationInputSchema,
  type saveExperienceInputSchema,
  type saveFactInputSchema,
  type setLinksInputSchema,
  type updatePersonInputSchema,
} from "@projects-lab/shared/career";
import type { z } from "zod";
import { ToolError } from "../../core/lab";
import { findOrCreateSkill, findSkill } from "../../core/skills";

const PERSON = "person";

/** A batch statement's rows; D1 always returns them, the type says maybe. */
const rows = <T>(result: D1Result | undefined): T[] =>
  (result?.results ?? []) as T[];

export interface ProfileSkillRef {
  id: string;
  name: string;
}

export interface ProfileFact {
  id: string;
  text: string;
  /** False: kept out of documents until the owner confirms it. */
  verified: boolean;
  position: number;
  skills: ProfileSkillRef[];
}

export interface ProfilePerson {
  fullName: string;
  headline: string;
  /** Derived: "City, State, Country", or the free text written before the parts. */
  location: string;
  city: string;
  /** State or province. */
  region: string;
  country: string;
  timezone: string;
  email: string;
  phone: string;
  summary: string;
  languages: { name: string; level: string }[];
  /** Served by GET /api/career/photo; null shows initials. */
  photo: { type: string } | null;
  /** Null until the first edit creates the row. */
  updatedAt: string | null;
}

export interface ProfileLink {
  id: string;
  kind: string;
  label: string;
  url: string;
  position: number;
}

export interface ProfileExperience {
  id: string;
  organization: string;
  title: string;
  kind: string;
  start: string;
  /** Null: current. */
  end: string | null;
  location: string;
  summary: string;
  position: number;
  facts: ProfileFact[];
}

export interface ProfileEducation {
  id: string;
  institution: string;
  degree: string;
  field: string;
  start: string;
  /** Null: in progress. */
  end: string | null;
  notes: string;
  position: number;
  facts: ProfileFact[];
}

export interface DeclaredSkill {
  skillId: string;
  name: string;
  level: string;
  years: number | null;
  note: string;
}

export interface Profile {
  person: ProfilePerson;
  links: ProfileLink[];
  experiences: ProfileExperience[];
  education: ProfileEducation[];
  /** Facts that belong to neither an experience nor an education. */
  facts: ProfileFact[];
  skills: DeclaredSkill[];
}

const EMPTY_PERSON: ProfilePerson = {
  fullName: "",
  headline: "",
  location: "",
  city: "",
  region: "",
  country: "",
  timezone: "",
  email: "",
  phone: "",
  summary: "",
  languages: [],
  photo: null,
  updatedAt: null,
};

type PersonRow = {
  fullName: string;
  headline: string;
  location: string;
  city: string;
  region: string;
  country: string;
  timezone: string;
  email: string;
  phone: string;
  summary: string;
  languagesJson: string;
  photoType: string | null;
  updatedAt: string;
};

type FactRow = {
  id: string;
  experienceId: string | null;
  educationId: string | null;
  text: string;
  verified: number;
  position: number;
};

const toPerson = (row: PersonRow | null): ProfilePerson =>
  row
    ? {
        fullName: row.fullName,
        headline: row.headline,
        // Derived from the parts when there are any (CLAUDE.md: derived state
        // is computed at read time); the free text written before them else.
        location:
          [row.city, row.region, row.country].filter(Boolean).join(", ") ||
          row.location,
        city: row.city,
        region: row.region,
        country: row.country,
        timezone: row.timezone,
        email: row.email,
        phone: row.phone,
        summary: row.summary,
        languages: JSON.parse(row.languagesJson),
        photo: row.photoType ? { type: row.photoType } : null,
        updatedAt: row.updatedAt,
      }
    : EMPTY_PERSON;

const PERSON_SQL = `SELECT full_name AS fullName, headline, location, city, region, country, timezone, email, phone,
  summary, languages_json AS languagesJson, photo_type AS photoType, updated_at AS updatedAt
  FROM career_person WHERE id = '${PERSON}'`;

const EXPERIENCE_SQL = `SELECT id, organization, title, kind, start_on AS start, end_on AS "end",
  location, summary, position FROM career_experience`;

const EDUCATION_SQL = `SELECT id, institution, degree, field, start_on AS start, end_on AS "end",
  notes, position FROM career_education`;

// Live facts. One under a removed experience or education isn't listed: the
// profile only nests facts under live parents.
const FACT_SQL = `SELECT id, experience_id AS experienceId, education_id AS educationId,
  text, verified, position FROM career_fact WHERE deleted_at IS NULL`;

/** The whole profile, compact: what the Profile tab and career_get_profile show. */
export async function getProfile(db: D1Database): Promise<Profile> {
  const [person, links, experiences, education, facts, factSkills, skills] =
    await db.batch([
      db.prepare(PERSON_SQL),
      db.prepare(
        "SELECT id, kind, label, url, position FROM career_link ORDER BY position, created_at",
      ),
      db.prepare(
        `${EXPERIENCE_SQL} WHERE deleted_at IS NULL ORDER BY position, start_on DESC`,
      ),
      db.prepare(
        `${EDUCATION_SQL} WHERE deleted_at IS NULL ORDER BY position, start_on DESC`,
      ),
      db.prepare(`${FACT_SQL} ORDER BY position, created_at`),
      db.prepare(
        `SELECT fs.fact_id AS factId, s.id, s.name FROM career_fact_skill fs
         JOIN skill s ON s.id = fs.skill_id ORDER BY s.name COLLATE NOCASE`,
      ),
      db.prepare(
        `SELECT d.skill_id AS skillId, s.name, d.level, d.years, d.note
         FROM career_declared_skill d JOIN skill s ON s.id = d.skill_id
         ORDER BY s.name COLLATE NOCASE`,
      ),
    ]);

  const skillsOf = new Map<string, ProfileSkillRef[]>();
  for (const row of rows<ProfileSkillRef & { factId: string }>(factSkills)) {
    const list = skillsOf.get(row.factId) ?? [];
    list.push({ id: row.id, name: row.name });
    skillsOf.set(row.factId, list);
  }
  const allFacts = rows<FactRow>(facts).map((row) => ({
    row,
    fact: toFact(row, skillsOf.get(row.id) ?? []),
  }));
  const factsUnder = (key: "experienceId" | "educationId", id: string) =>
    allFacts.filter(({ row }) => row[key] === id).map(({ fact }) => fact);

  return {
    person: toPerson(rows<PersonRow>(person)[0] ?? null),
    links: rows<ProfileLink>(links),
    experiences: rows<Omit<ProfileExperience, "facts">>(experiences).map(
      (row) => ({ ...row, facts: factsUnder("experienceId", row.id) }),
    ),
    education: rows<Omit<ProfileEducation, "facts">>(education).map((row) => ({
      ...row,
      facts: factsUnder("educationId", row.id),
    })),
    facts: allFacts
      .filter(
        ({ row }) => row.experienceId === null && row.educationId === null,
      )
      .map(({ fact }) => fact),
    skills: rows<DeclaredSkill>(skills),
  };
}

const toFact = (row: FactRow, skills: ProfileSkillRef[]): ProfileFact => ({
  id: row.id,
  text: row.text,
  verified: row.verified === 1,
  position: row.position,
  skills,
});

/** Creates the one person row on the first edit (K-1); an omitted field is kept. */
export async function updatePerson(
  db: D1Database,
  input: z.infer<typeof updatePersonInputSchema>,
  now: Date,
): Promise<ProfilePerson> {
  const columns: [string, unknown][] = (
    [
      ["full_name", input.fullName],
      ["headline", input.headline],
      ["location", input.location],
      ["city", input.city],
      ["region", input.region],
      ["country", input.country],
      ["timezone", input.timezone],
      ["email", input.email],
      ["phone", input.phone],
      ["summary", input.summary],
      ["languages_json", input.languages && JSON.stringify(input.languages)],
    ] as [string, unknown][]
  ).filter(([, value]) => value !== undefined);
  const names = columns.map(([name]) => name);
  await db
    .prepare(
      `INSERT INTO career_person (id, updated_at${names.map((n) => `, ${n}`).join("")})
       VALUES ('${PERSON}', ?${names.map(() => ", ?").join("")})
       ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at${names
         .map((n) => `, ${n} = excluded.${n}`)
         .join("")}`,
    )
    .bind(now.toISOString(), ...columns.map(([, value]) => value))
    .run();
  return toPerson(await db.prepare(PERSON_SQL).first<PersonRow>());
}

/** Replaces the links, in the order given. */
export async function setLinks(
  db: D1Database,
  { links }: z.infer<typeof setLinksInputSchema>,
  now: Date,
): Promise<ProfileLink[]> {
  const rows = links.map((link, position) => ({
    id: crypto.randomUUID(),
    ...link,
    position,
  }));
  await db.batch([
    db.prepare("DELETE FROM career_link"),
    ...rows.map((row) =>
      db
        .prepare(
          "INSERT INTO career_link (id, kind, label, url, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          row.id,
          row.kind,
          row.label,
          row.url,
          row.position,
          now.toISOString(),
        ),
    ),
  ]);
  return rows;
}

/**
 * An UPDATE of only the columns given, on a live row; not_found otherwise. A
 * new start checked against the kept end here, so K-4's trigger never fires.
 */
async function updateLive(
  db: D1Database,
  table: "career_experience" | "career_education",
  id: string,
  columns: [string, unknown][],
  what: string,
): Promise<void> {
  const existing = await db
    .prepare(
      `SELECT end_on AS "end" FROM ${table} WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(id)
    .first<{ end: string | null }>();
  if (!existing)
    throw new ToolError("not_found", `No ${what} ${id} in the profile`);
  const start = columns.find(([name]) => name === "start_on")?.[1] as string;
  const end = columns.find(([name]) => name === "end_on")?.[1];
  if (
    end === undefined &&
    existing.end !== null &&
    !endNotBeforeStart(start, existing.end)
  )
    throw new ToolError(
      "bad_request",
      `The ${what} ends ${existing.end}, before ${start}: give its end too`,
    );
  const set = columns.filter(([, value]) => value !== undefined);
  const result = await db
    .prepare(
      `UPDATE ${table} SET ${set.map(([name]) => `${name} = ?`).join(", ")}
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(...set.map(([, value]) => value), id)
    .run();
  if (result.meta.changes === 0)
    throw new ToolError("not_found", `No ${what} ${id} in the profile`);
}

/** No `id` adds an experience at the end (or at `position`); an `id` edits it. */
export async function saveExperience(
  db: D1Database,
  input: z.infer<typeof saveExperienceInputSchema>,
  now: Date,
): Promise<Omit<ProfileExperience, "facts">> {
  const id = input.id ?? crypto.randomUUID();
  const fields: [string, unknown][] = [
    ["organization", input.organization],
    ["title", input.title],
    ["kind", input.kind],
    ["start_on", input.start],
    ["end_on", input.end],
    ["location", input.location],
    ["summary", input.summary],
    ["position", input.position],
  ];
  if (input.id)
    await updateLive(db, "career_experience", id, fields, "experience");
  else
    await db
      .prepare(
        `INSERT INTO career_experience (id, organization, title, kind, start_on, end_on, location, summary, position, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
           COALESCE(?9, (SELECT COALESCE(MAX(position) + 1, 0) FROM career_experience WHERE deleted_at IS NULL)), ?10)`,
      )
      .bind(
        id,
        input.organization,
        input.title,
        input.kind,
        input.start,
        input.end ?? null,
        input.location ?? "",
        input.summary ?? "",
        input.position ?? null,
        now.toISOString(),
      )
      .run();
  const saved = await db
    .prepare(`${EXPERIENCE_SQL} WHERE id = ?`)
    .bind(id)
    .first<Omit<ProfileExperience, "facts">>();
  if (!saved) throw new Error(`Experience ${id} vanished after it was saved`);
  return saved;
}

/** No `id` adds an education at the end (or at `position`); an `id` edits it. */
export async function saveEducation(
  db: D1Database,
  input: z.infer<typeof saveEducationInputSchema>,
  now: Date,
): Promise<Omit<ProfileEducation, "facts">> {
  const id = input.id ?? crypto.randomUUID();
  const fields: [string, unknown][] = [
    ["institution", input.institution],
    ["degree", input.degree],
    ["field", input.field],
    ["start_on", input.start],
    ["end_on", input.end],
    ["notes", input.notes],
    ["position", input.position],
  ];
  if (input.id)
    await updateLive(db, "career_education", id, fields, "education");
  else
    await db
      .prepare(
        `INSERT INTO career_education (id, institution, degree, field, start_on, end_on, notes, position, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
           COALESCE(?8, (SELECT COALESCE(MAX(position) + 1, 0) FROM career_education WHERE deleted_at IS NULL)), ?9)`,
      )
      .bind(
        id,
        input.institution,
        input.degree,
        input.field ?? "",
        input.start,
        input.end ?? null,
        input.notes ?? "",
        input.position ?? null,
        now.toISOString(),
      )
      .run();
  const saved = await db
    .prepare(`${EDUCATION_SQL} WHERE id = ?`)
    .bind(id)
    .first<Omit<ProfileEducation, "facts">>();
  if (!saved) throw new Error(`Education ${id} vanished after it was saved`);
  return saved;
}

async function requireLiveParent(
  db: D1Database,
  table: "career_experience" | "career_education",
  id: string,
  what: string,
): Promise<void> {
  const row = await db
    .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first();
  if (!row) throw new ToolError("not_found", `No ${what} ${id} in the profile`);
}

/**
 * Adds or edits a fact. `verified` is kept unless given (the owner sets it in
 * the app, Claude only after the owner confirms). Skills are found or created
 * in the registry and, when given, replace the fact's skills. Moving it under
 * one parent clears the other (K-5).
 */
export async function saveFact(
  db: D1Database,
  input: z.infer<typeof saveFactInputSchema>,
  now: Date,
): Promise<ProfileFact> {
  if (input.experienceId)
    await requireLiveParent(
      db,
      "career_experience",
      input.experienceId,
      "experience",
    );
  if (input.educationId)
    await requireLiveParent(
      db,
      "career_education",
      input.educationId,
      "education",
    );

  const stamp = now.toISOString();
  const skillIds = input.skills && [
    ...new Set(
      (
        await Promise.all(
          input.skills.map((name) => findOrCreateSkill(db, name, stamp)),
        )
      ).map((skill) => skill.id),
    ),
  ];

  const id = input.id ?? crypto.randomUUID();
  const verified =
    input.verified === undefined ? undefined : input.verified ? 1 : 0;
  const parentGiven =
    input.experienceId !== undefined || input.educationId !== undefined;
  const statements: D1PreparedStatement[] = [];

  if (input.id) {
    const set: [string, unknown][] = [
      ["text", input.text],
      ["verified", verified],
      ["position", input.position],
      ["updated_at", stamp],
    ];
    if (parentGiven)
      set.push(
        ["experience_id", input.experienceId ?? null],
        ["education_id", input.educationId ?? null],
      );
    const given = set.filter(([, value]) => value !== undefined);
    const exists = await db
      .prepare("SELECT 1 FROM career_fact WHERE id = ? AND deleted_at IS NULL")
      .bind(id)
      .first();
    if (!exists)
      throw new ToolError("not_found", `No fact ${id} in the profile`);
    statements.push(
      db
        .prepare(
          `UPDATE career_fact SET ${given.map(([name]) => `${name} = ?`).join(", ")} WHERE id = ?`,
        )
        .bind(...given.map(([, value]) => value), id),
    );
  } else {
    const experienceId = input.experienceId ?? null;
    const educationId = input.educationId ?? null;
    statements.push(
      db
        .prepare(
          `INSERT INTO career_fact (id, experience_id, education_id, text, verified, position, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5,
             COALESCE(?6, (SELECT COALESCE(MAX(position) + 1, 0) FROM career_fact
               WHERE deleted_at IS NULL AND experience_id IS ?2 AND education_id IS ?3)), ?7, ?7)`,
        )
        .bind(
          id,
          experienceId,
          educationId,
          input.text,
          verified ?? 0,
          input.position ?? null,
          stamp,
        ),
    );
  }
  if (skillIds)
    statements.push(
      db.prepare("DELETE FROM career_fact_skill WHERE fact_id = ?").bind(id),
      ...skillIds.map((skillId) =>
        db
          .prepare(
            "INSERT INTO career_fact_skill (fact_id, skill_id) VALUES (?, ?)",
          )
          .bind(id, skillId),
      ),
    );
  await db.batch(statements);

  const [row, skills] = await db.batch([
    db
      .prepare(
        "SELECT id, experience_id AS experienceId, education_id AS educationId, text, verified, position FROM career_fact WHERE id = ?",
      )
      .bind(id),
    db
      .prepare(
        `SELECT s.id, s.name FROM career_fact_skill fs JOIN skill s ON s.id = fs.skill_id
         WHERE fs.fact_id = ? ORDER BY s.name COLLATE NOCASE`,
      )
      .bind(id),
  ]);
  const fact = rows<FactRow>(row)[0];
  if (!fact) throw new Error(`Fact ${id} vanished after it was saved`);
  return toFact(fact, rows<ProfileSkillRef>(skills));
}

/** Declares a skill once (K-6), by name or alias; again updates the declaration. */
export async function declareSkill(
  db: D1Database,
  input: z.infer<typeof declareSkillInputSchema>,
  now: Date,
): Promise<DeclaredSkill> {
  const stamp = now.toISOString();
  const skill = await findOrCreateSkill(db, input.skill, stamp);
  const kept = [
    input.years !== undefined ? ", years = excluded.years" : "",
    input.note !== undefined ? ", note = excluded.note" : "",
  ].join("");
  await db
    .prepare(
      `INSERT INTO career_declared_skill (skill_id, level, years, note, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT (skill_id) DO UPDATE SET level = excluded.level, updated_at = excluded.updated_at${kept}`,
    )
    .bind(skill.id, input.level, input.years ?? null, input.note ?? "", stamp)
    .run();
  const declared = await db
    .prepare(
      `SELECT d.skill_id AS skillId, s.name, d.level, d.years, d.note
       FROM career_declared_skill d JOIN skill s ON s.id = d.skill_id WHERE d.skill_id = ?`,
    )
    .bind(skill.id)
    .first<DeclaredSkill>();
  if (!declared) throw new Error(`Declaration of ${skill.name} vanished`);
  return declared;
}

/** Removes a declaration; the skill stays in the registry. */
export async function removeSkill(db: D1Database, name: string): Promise<void> {
  const skill = await findSkill(db, name.trim());
  const result = skill
    ? await db
        .prepare("DELETE FROM career_declared_skill WHERE skill_id = ?")
        .bind(skill.id)
        .run()
    : null;
  if (!result || result.meta.changes === 0)
    throw new ToolError("not_found", `${name} isn't declared in the profile`);
}

const REMOVABLE = {
  experience: "career_experience",
  education: "career_education",
  fact: "career_fact",
} as const;

/** Soft-deletes an experience, an education or a fact (K-8: facts are never deleted). */
export async function removeItem(
  db: D1Database,
  { kind, id }: z.infer<typeof removeItemInputSchema>,
  now: Date,
): Promise<void> {
  const result = await db
    .prepare(
      `UPDATE ${REMOVABLE[kind]} SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(now.toISOString(), id)
    .run();
  if (result.meta.changes === 0)
    throw new ToolError("not_found", `No ${kind} ${id} in the profile`);
}
