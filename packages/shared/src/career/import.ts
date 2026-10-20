// `Master Resume — source of truth.md` → profile records (CA-14, PRD 20 § Seed).
// Not on the barrel: only scripts/import-resume.ts uses it. Bullets become
// facts; `[UNVERIFIED…]` ones import as not verified (the tag's note is
// reported). Bullets that are guidance, not claims (bold-led ones, "Internal
// context only…"), go to the experience's summary, which documents never cite.
// "Facts to add once true", blockquoted notes and "Claimed but thin" skills are
// reported, never imported.

export interface ImportedFact {
  text: string;
  verified: boolean;
  /** The [UNVERIFIED: …] note: what to confirm first. */
  toConfirm: string | null;
  /** Declared skills named in the text. */
  skills: string[];
}

export interface ImportedExperience {
  title: string;
  organization: string;
  kind: "job" | "contract" | "research" | "project";
  start: string;
  end: string | null;
  location: string;
  /** Guidance bullets, joined: context for Claude, never a claim. */
  summary: string;
  facts: ImportedFact[];
}

export interface ImportedEducation {
  degree: string;
  field: string;
  institution: string;
  start: string;
  end: string | null;
  notes: string;
}

export interface ImportedResume {
  person: {
    fullName: string;
    location: string;
    email: string;
    phone: string;
  };
  links: {
    kind: "linkedin" | "github" | "portfolio" | "other";
    label: string;
    url: string;
  }[];
  education: ImportedEducation[];
  experiences: ImportedExperience[];
  /** Declared skills: their group is the note. */
  skills: { name: string; group: string }[];
  /** Read but not imported, with why: the owner reviews these. */
  notImported: string[];
  warnings: string[];
}

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** "Oct 2023" → "2023-10", "2026" → "2026"; null for anything else. */
export function resumeDate(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (/^\d{4}$/.test(t)) return t;
  const m = /^([a-z]{3})[a-z]*\.?\s+(\d{4})$/.exec(t);
  const month = m ? MONTHS.indexOf(m[1] as string) : -1;
  return m && month >= 0
    ? `${m[2]}-${String(month + 1).padStart(2, "0")}`
    : null;
}

const RANGE =
  /((?:[A-Z][a-z]{2,8}\.?\s+)?\d{4})\s*[–-]\s*((?:[A-Z][a-z]{2,8}\.?\s+)?\d{4}|present|ongoing)/i;

/** "Oct 2023 – present" → start, end (null when current); a single year is both. */
function dateRange(text: string): { start: string; end: string | null } | null {
  const range = RANGE.exec(text);
  if (range) {
    const start = resumeDate(range[1] as string);
    const to = (range[2] as string).toLowerCase();
    // "present" and "ongoing" read as no date: a current role has no end.
    const end = resumeDate(range[2] as string);
    if (start && (end || to === "present" || to === "ongoing"))
      return { start, end };
  }
  const single = /\b(\d{4})\b/.exec(text);
  return single
    ? { start: single[1] as string, end: single[1] as string }
    : null;
}

/** Markdown inline → plain text: [text](url) → text, **x** / *x* → x. */
const plain = (text: string) =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

/** "## Heading" → its body, in order. */
function sections(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = markdown.split(/^## /m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    out.set(part.slice(0, newline).trim(), part.slice(newline + 1));
  }
  return out;
}

/** "- " items with their wrapped continuation lines, and the other lines. */
function bullets(body: string): { items: string[]; rest: string[] } {
  const items: string[] = [];
  const rest: string[] = [];
  for (const line of body.split("\n")) {
    if (/^\s*-\s+/.test(line)) items.push(line.replace(/^\s*-\s+/, ""));
    else if (/^\s{2,}\S/.test(line) && items.length > 0)
      items[items.length - 1] += ` ${line.trim()}`;
    else if (line.trim()) rest.push(line.trim());
  }
  return { items: items.map((i) => i.replace(/\s+/g, " ").trim()), rest };
}

function contact(body: string, out: ImportedResume) {
  const text = plain(body);
  const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(text)?.[0] ?? "";
  const phone = /\+\d[\d\s-]{7,}\d/.exec(text)?.[0] ?? "";
  const [name = "", afterName = ""] = text.split("·").map((p) => p.trim());
  // The location runs from after the name to the email (or the next "·").
  const location = afterName.split(email || "·")[0]?.trim() ?? "";
  out.person = { fullName: name, location, email, phone };
  for (const raw of text.match(
    /(?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+\/[\w./-]*/g,
  ) ?? []) {
    if (raw.includes("@")) continue;
    const url = raw.startsWith("http")
      ? raw.replace(/^http:/, "https:")
      : `https://${raw}`;
    const kind = /linkedin\.com/.test(url)
      ? "linkedin"
      : /github\.com/.test(url)
        ? "github"
        : /github\.io|\.dev\b|website/.test(url)
          ? "portfolio"
          : "other";
    const label =
      kind === "linkedin"
        ? "LinkedIn"
        : kind === "github"
          ? "GitHub"
          : kind === "portfolio"
            ? "Website"
            : url;
    out.links.push({ kind, label, url });
  }
  if (!name) out.warnings.push("Contact: no name found before the first ·");
}

function education(body: string, out: ImportedResume) {
  const text = body.replace(/\n(?!\s*\n)/g, " ");
  for (const m of text.matchAll(/\*\*([^*]+)\*\*([^*]*)/g)) {
    const head = (m[1] as string).trim();
    const tail = (m[2] as string).trim();
    const [degreeField = "", institution = ""] = head.split(/\s+—\s+/);
    const [degree = "", ...field] = degreeField.split(",");
    const range = dateRange(tail);
    const inProgress = /in progress/i.test(tail);
    if (!range || !institution) {
      out.warnings.push(`Education: couldn't read "${head}"`);
      continue;
    }
    const notes = plain(
      tail
        .replace(RANGE, "")
        .replace(/^\s*·\s*/, "")
        .replace(/\(in progress\)/i, ""),
    );
    out.education.push({
      degree: degree.trim(),
      field: field.join(",").trim(),
      institution: institution.trim(),
      start: range.start,
      end: inProgress ? null : range.end,
      notes: [
        inProgress && range.end ? `Expected ${range.end.slice(0, 4)}.` : "",
        notes,
      ]
        .filter(Boolean)
        .join(" "),
    });
  }
}

/** A guidance bullet (how to tell the story), not a claim a document can use. */
const isGuidance = (item: string) =>
  /^\*\*/.test(item) || /^internal context only/i.test(item);

function experiences(body: string, research: boolean, out: ImportedResume) {
  for (const block of body.split(/^### /m).slice(1)) {
    const lines = block.split("\n");
    const heading = (lines[0] ?? "").trim();
    // The date line is the first non-empty line under the heading.
    const metaAt = lines.findIndex((line, i) => i > 0 && line.trim() !== "");
    const meta = metaAt > 0 ? (lines[metaAt] ?? "").trim() : "";
    const { items, rest } = bullets(lines.slice(metaAt + 1).join("\n"));
    for (const line of rest)
      if (line.startsWith(">"))
        out.notImported.push(
          `Note under "${heading}": ${plain(line.replace(/^>\s*/, ""))}`,
        );

    const range = dateRange(meta);
    const metaParts = meta.split("·").map((p) => p.trim());
    const notDate = metaParts.find((p) => !dateRange(p)) ?? "";
    let title = heading;
    let organization = "";
    let kind: ImportedExperience["kind"] = research ? "research" : "job";
    const notes: string[] = [];
    if (research) {
      organization = notDate;
      if (/\bproject\b/i.test(heading)) kind = "project";
    } else {
      const [t = "", org = ""] = heading.split(/\s+—\s+/);
      title = t;
      organization = org;
      if (/\(contract\)/i.test(title)) kind = "contract";
      if (/\(temporary\)/i.test(title)) notes.push("Temporary role.");
      title = title.replace(/\s*\((contract|temporary)\)/i, "").trim();
      if (!organization) {
        organization = "Freelance client";
        out.warnings.push(
          `"${heading}" names no organization: imported as "Freelance client"; rename it in the profile.`,
        );
      }
    }
    if (!range) {
      out.warnings.push(`"${heading}": no dates found in "${meta}"; skipped`);
      continue;
    }
    const facts: ImportedFact[] = [];
    for (const item of items) {
      if (isGuidance(item)) {
        notes.push(plain(item));
        continue;
      }
      const tag = /`?\[UNVERIFIED:?\s*([^\]]*)\]`?/i.exec(item);
      const text = plain(item.replace(/`?\[UNVERIFIED[^\]]*\]`?/i, ""));
      if (text.length > 300) {
        out.warnings.push(
          `A fact under "${heading}" is over 300 characters; skipped: ${text.slice(0, 60)}…`,
        );
        continue;
      }
      facts.push({
        text,
        verified: !tag,
        toConfirm: tag ? (tag[1] as string).trim() || "confirm it" : null,
        skills: [],
      });
    }
    const summary = notes.join(" ");
    if (summary.length > 600)
      out.warnings.push(
        `The notes under "${heading}" are over 600 characters; cut.`,
      );
    out.experiences.push({
      title,
      organization,
      kind,
      start: range.start,
      end: range.end,
      location: research ? "" : notDate,
      summary: summary.slice(0, 600),
      facts,
    });
  }
}

/** Splits on commas and semicolons outside parentheses. */
function items(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === "," || ch === ";") && depth === 0) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim().replace(/\.$/, "").trim()).filter(Boolean);
}

function skills(body: string, out: ImportedResume) {
  const text = body.replace(/\s+/g, " ");
  const seen = new Set<string>();
  for (const m of text.matchAll(/\*\*([^*:]+):\*\*([^*]*)/g)) {
    const group = (m[1] as string).trim();
    if (/claimed but thin/i.test(group)) {
      out.notImported.push(
        `Skills "${group}" (not declared): ${(m[2] as string).trim()}`,
      );
      continue;
    }
    for (const name of items(m[2] as string)) {
      if (seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      if (name.length > 60)
        out.warnings.push(`A long skill name, imported as written: "${name}"`);
      out.skills.push({ name, group });
    }
  }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The declared skills a fact's text names (whole words, ignoring case). */
function linkSkills(out: ImportedResume) {
  for (const experience of out.experiences)
    for (const fact of experience.facts)
      fact.skills = out.skills
        .map((s) => s.name)
        .filter((name) =>
          new RegExp(`(^|[^\\w.])${escapeRegExp(name)}($|[^\\w])`, "i").test(
            fact.text,
          ),
        );
}

export function parseMasterResume(markdown: string): ImportedResume {
  const out: ImportedResume = {
    person: { fullName: "", location: "", email: "", phone: "" },
    links: [],
    education: [],
    experiences: [],
    skills: [],
    notImported: [],
    warnings: [],
  };
  // Horizontal rules ("---", "------") separate sections; they're not content.
  const parts = sections(markdown.replace(/^-{3,}\s*$/gm, ""));
  for (const [heading, body] of parts) {
    if (/^contact/i.test(heading)) contact(body, out);
    else if (/^education/i.test(heading)) education(body, out);
    else if (/research/i.test(heading)) experiences(body, true, out);
    else if (/experience/i.test(heading)) experiences(body, false, out);
    else if (/^skills/i.test(heading)) skills(body, out);
    else if (/to add once true/i.test(heading))
      for (const item of bullets(body).items)
        out.notImported.push(
          `Not yet true: ${plain(item.replace(/^\[\s?\]\s*/, ""))}`,
        );
    else out.notImported.push(`Section "${heading}" (not part of the profile)`);
  }
  linkSkills(out);
  return out;
}

/** Facts and skills one resume has and the other doesn't, for the owner to merge. */
export function compareResumes(a: ImportedResume, b: ImportedResume) {
  const facts = (r: ImportedResume) =>
    new Map(
      r.experiences.flatMap((e) =>
        e.facts.map((f) => [
          `${e.title}: ${f.text}`.toLowerCase(),
          `${e.title}: ${f.text}`,
        ]),
      ),
    );
  const guidance = (r: ImportedResume) =>
    new Map(
      r.experiences.filter((e) => e.summary).map((e) => [e.title, e.summary]),
    );
  const fa = facts(a);
  const fb = facts(b);
  const ga = guidance(a);
  const gb = guidance(b);
  return {
    onlyInFirst: [...fa].filter(([k]) => !fb.has(k)).map(([, v]) => v),
    onlyInSecond: [...fb].filter(([k]) => !fa.has(k)).map(([, v]) => v),
    guidanceDiffers: [...new Set([...ga.keys(), ...gb.keys()])]
      .filter((title) => ga.get(title) !== gb.get(title))
      .map((title) => ({
        title,
        first: ga.get(title) ?? "",
        second: gb.get(title) ?? "",
      })),
  };
}

const q = (value: string | number | null) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : `'${value.replace(/'/g, "''")}'`;

/** The skill a name finds: a live one by name or alias, else any by name (as ST-10). */
const skillOf = (name: string) =>
  `(SELECT id FROM skill
     WHERE name = ${q(name)} COLLATE NOCASE
        OR (deleted_at IS NULL AND EXISTS (
              SELECT 1 FROM json_each(skill.aliases_json) WHERE value = ${q(name)} COLLATE NOCASE))
     ORDER BY deleted_at IS NOT NULL LIMIT 1)`;

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/**
 * The statements that load an imported resume, in order. Fixed IDs and a
 * NOT EXISTS (or ON CONFLICT DO NOTHING) on every insert: running them twice
 * changes nothing, and what the owner edited since is kept. Never deletes.
 */
export function resumeSql(resume: ImportedResume, now: string): string[] {
  const s: string[] = [];
  const p = resume.person;
  s.push(
    `INSERT INTO career_person (id, full_name, location, email, phone, updated_at)
  VALUES ('person', ${q(p.fullName)}, ${q(p.location)}, ${q(p.email)}, ${q(p.phone)}, ${q(now)})
  ON CONFLICT (id) DO NOTHING`,
  );
  for (const [i, link] of resume.links.entries())
    s.push(
      `INSERT INTO career_link (id, kind, label, url, position, created_at)
  SELECT ${q(`import-link-${i + 1}`)}, ${q(link.kind)}, ${q(link.label)}, ${q(link.url)}, ${i}, ${q(now)}
  WHERE NOT EXISTS (SELECT 1 FROM career_link WHERE url = ${q(link.url)})`,
    );
  for (const [i, e] of resume.education.entries())
    s.push(
      `INSERT INTO career_education (id, institution, degree, field, start_on, end_on, notes, position, created_at)
  SELECT ${q(`import-edu-${i + 1}`)}, ${q(e.institution)}, ${q(e.degree)}, ${q(e.field)}, ${q(e.start)}, ${q(e.end)}, ${q(e.notes)}, ${i}, ${q(now)}
  WHERE NOT EXISTS (SELECT 1 FROM career_education WHERE id = ${q(`import-edu-${i + 1}`)})`,
    );
  for (const skill of resume.skills)
    s.push(
      `UPDATE skill SET deleted_at = NULL
  WHERE name = ${q(skill.name)} COLLATE NOCASE AND deleted_at IS NOT NULL`,
      `INSERT INTO skill (id, name, created_at)
  SELECT ${q(`import-skill-${slug(skill.name)}`)}, ${q(skill.name)}, ${q(now)}
  WHERE ${skillOf(skill.name)} IS NULL`,
      `INSERT INTO career_declared_skill (skill_id, level, note, created_at, updated_at)
  SELECT ${skillOf(skill.name)}, 'working', ${q(skill.group)}, ${q(now)}, ${q(now)}
  WHERE NOT EXISTS (SELECT 1 FROM career_declared_skill WHERE skill_id = ${skillOf(skill.name)})`,
    );
  resume.experiences.forEach((x, i) => {
    const id = `import-exp-${i + 1}`;
    s.push(
      `INSERT INTO career_experience (id, organization, title, kind, start_on, end_on, location, summary, position, created_at)
  SELECT ${q(id)}, ${q(x.organization)}, ${q(x.title)}, ${q(x.kind)}, ${q(x.start)}, ${q(x.end)}, ${q(x.location)}, ${q(x.summary)}, ${i}, ${q(now)}
  WHERE NOT EXISTS (SELECT 1 FROM career_experience WHERE id = ${q(id)})`,
    );
    x.facts.forEach((f, j) => {
      const factId = `import-fact-${i + 1}-${j + 1}`;
      s.push(
        `INSERT INTO career_fact (id, experience_id, text, verified, position, created_at, updated_at)
  SELECT ${q(factId)}, ${q(id)}, ${q(f.text)}, ${f.verified ? 1 : 0}, ${j}, ${q(now)}, ${q(now)}
  WHERE NOT EXISTS (SELECT 1 FROM career_fact WHERE id = ${q(factId)})`,
      );
      for (const name of f.skills)
        s.push(
          `INSERT INTO career_fact_skill (fact_id, skill_id)
  SELECT ${q(factId)}, ${skillOf(name)}
  WHERE NOT EXISTS (SELECT 1 FROM career_fact_skill WHERE fact_id = ${q(factId)} AND skill_id = ${skillOf(name)})`,
        );
    });
  });
  const sql = s.join(";\n");
  if (/\b(DELETE|DROP|ALTER|PRAGMA)\b/i.test(sql))
    throw new Error("import SQL may only insert and update");
  return s;
}
