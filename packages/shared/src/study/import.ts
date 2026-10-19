// cs-learning-lab's learning-backlog.md → topics (ST-10, PRD 10 Decisions: a
// one-off import keeping the IDs). Not on the study barrel: only the import
// script uses it. It refuses what it can't map rather than guessing.
import type { Priority, TopicLevel, TopicStatus } from "./backlog";
import { parseTopicCode } from "./backlog";
import { parseGrade } from "./grades";

export interface ImportedTopic {
  code: string;
  prefix: string;
  areaName: string;
  skill: string;
  level: TopicLevel;
  priority: Priority;
  status: TopicStatus;
  /** Dates as written (YYYY-MM-DD); null for "—". */
  startedOn: string | null;
  note: string;
}

export interface ImportResult {
  topics: ImportedTopic[];
  /** What was kept differently than written (a grade with no exam record). */
  warnings: string[];
}

const LEVELS: Record<string, TopicLevel> = {
  "—": "unset",
  "": "unset",
  "fast track": "fast_track",
  essential: "essential",
  specialized: "specialized",
};
const STATUSES: Record<string, TopicStatus> = {
  "not started": "not_started",
  "in progress": "in_progress",
  done: "done",
};
const PRIORITIES: Record<string, Priority> = { p1: 1, p2: 2, p3: 3 };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** The learning-backlog.md format (cs-learning-lab backlog-rules.md). */
export function parseLearningBacklog(markdown: string): ImportResult {
  const topics: ImportedTopic[] = [];
  const warnings: string[] = [];
  let area: string | null = null;

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^## (.+?)\s*$/.exec(raw);
    if (heading) {
      area = heading[1] === "Summary" ? null : (heading[1] as string);
      continue;
    }
    if (!area || !raw.trim().startsWith("|")) continue;
    const row = cells(raw);
    const [
      code = "",
      skill = "",
      level = "",
      priority = "",
      status = "",
      grade = "",
      started = "",
      ,
      note = "",
    ] = row;
    // The header, its rule, and an empty area's placeholder row.
    if (code === "ID" || /^-+$/.test(code) || code === "—") continue;

    const where = `"${raw.trim()}"`;
    const parsed = parseTopicCode(code);
    if (!parsed) throw new Error(`Not a topic ID (${code}) in ${where}`);
    const knownLevel = LEVELS[level.toLowerCase()];
    if (!knownLevel) throw new Error(`Unknown level "${level}" in ${where}`);
    const knownPriority = PRIORITIES[priority.toLowerCase()];
    if (!knownPriority)
      throw new Error(`Unknown priority "${priority}" in ${where}`);
    const knownStatus = STATUSES[status.toLowerCase()];
    if (!knownStatus) throw new Error(`Unknown status "${status}" in ${where}`);
    if (!skill) throw new Error(`No topic name in ${where}`);
    const prefixOfArea = topics.find((t) => t.areaName === area)?.prefix;
    if (prefixOfArea && prefixOfArea !== parsed.prefix)
      throw new Error(
        `${code} doesn't match its area's prefix ${prefixOfArea} in ${where}`,
      );

    let finalNote = note;
    if (grade && grade !== "—") {
      const tenths = parseGrade(grade);
      if (tenths === null)
        throw new Error(`Not a grade "${grade}" in ${where}`);
      // A grade comes from an exam record; there's no exam file behind this one.
      finalNote = [`Imported grade ${grade}`, note].filter(Boolean).join("; ");
      warnings.push(
        `${code}: grade ${grade} kept in the note (no exam record to import)`,
      );
    }

    topics.push({
      code,
      prefix: parsed.prefix,
      areaName: area,
      skill,
      level: knownLevel,
      priority: knownPriority,
      status: knownStatus,
      startedOn: DATE.test(started) ? started : null,
      note: finalNote.slice(0, 120),
    });
  }
  return { topics, warnings };
}
