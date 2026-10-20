// H-05: the MCP contract, tool by tool (docs/prd/02-integration.md § Tool
// conventions). Every registered tool needs a case below, so a tool added
// without one fails here: its kind, the shared /api schema it must take, and
// valid input. Each tool then runs through the real Worker with a real OAuth
// token, and each write is replayed with its idempotencyKey: same result, and
// nothing in the database changes. GitHub is a stand-in on the global fetch
// holding the course and exam files the study_record_* tools check.
import { findSkillInputSchema } from "@projects-lab/shared";
import * as career from "@projects-lab/shared/career";
import * as study from "@projects-lab/shared/study";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { LabTool } from "../src/core/lab";
import { labTools } from "../src/index";
import { coreTools } from "../src/mcp/tools/core";
import { db } from "./db";
import { callTool, mcp, seedOwner, signInClaude } from "./oauth-flow";

const CONTENTS = "https://api.github.com/repos/owner/study-materials/contents/";
const BASE = "Study Lab/cs-fundamentals/big-o-notation/big-o-notation";
const COURSE = `${BASE}__fast-track.md`;
const EXAM = `${BASE}__fast-track__exam-1`;
const HELD = new Set([COURSE, `${EXAM}.md`, `${EXAM}.pdf`]);

/** What earlier calls created, for the inputs that name it. */
type Ids = Record<string, string>;
type Args = Record<string, unknown>;

interface Case {
  kind: "read" | "write";
  /** The shared schema of the matching /api route; null: takes nothing. */
  schema: z.ZodObject | null;
  args: (ids: Ids) => Args;
  /** IDs this call's result gives to later cases. */
  keep?: (value: unknown) => Ids;
}

/** A string inside a tool's result, by path ("topics", 0, "topic", "id"). */
function at(value: unknown, ...path: (string | number)[]): string {
  const found = path.reduce<unknown>(
    (node, key) => (node as Record<string | number, unknown>)[key],
    value,
  );
  if (typeof found !== "string")
    throw new Error(`no string at ${path.join(".")}`);
  return found;
}

const read = (schema: Case["schema"], args: Case["args"] = () => ({})) =>
  ({ kind: "read", schema, args }) satisfies Case;
const write = (
  schema: z.ZodObject,
  args: Case["args"],
  keep?: Case["keep"],
): Case => ({ kind: "write", schema, args, keep });

// In the order they run: a case may name what an earlier one created.
const CASES: Record<string, Case> = {
  core_whoami: read(null),
  core_find_skill: read(findSkillInputSchema, () => ({ query: "TypeScript" })),

  study_add_area: write(study.addAreaInputSchema, () => ({
    name: "Contract testing",
    prefix: "CT",
  })),
  study_add_topics: write(
    study.addTopicsInputSchema,
    () => ({ topics: [{ skill: "Big-O notation", area: "CS" }] }),
    (v) => ({ topic: at(v, "topics", 0, "topic", "id") }),
  ),
  study_update_topic: write(study.updateTopicInputSchema, (ids) => ({
    topicId: ids.topic,
    priority: 1,
  })),
  study_list_backlog: read(study.listBacklogInputSchema),
  study_get_summary: read(study.getSummaryInputSchema),
  study_record_course: write(study.recordCourseInputSchema, (ids) => ({
    topicId: ids.topic,
    level: "fast_track",
    path: COURSE,
  })),
  study_list_courses: read(study.listCoursesInputSchema),
  study_record_exam: write(study.recordExamInputSchema, (ids) => ({
    topicId: ids.topic,
    level: "fast_track",
    attempt: 1,
    mdPath: `${EXAM}.md`,
    pdfPath: `${EXAM}.pdf`,
  })),
  study_record_grade: write(study.recordGradeInputSchema, (ids) => ({
    topicId: ids.topic,
    level: "fast_track",
    attempt: 1,
    grade: 85,
  })),
  study_list_exams: read(study.listExamsInputSchema),

  career_get_profile: read(career.getProfileInputSchema),
  career_update_person: write(career.updatePersonInputSchema, () => ({
    fullName: "Owner",
  })),
  career_set_links: write(career.setLinksInputSchema, () => ({
    links: [{ kind: "github", label: "GitHub", url: "https://github.com/o" }],
  })),
  career_save_experience: write(
    career.saveExperienceInputSchema,
    () => ({
      organization: "Acme",
      title: "AI Engineer",
      kind: "contract",
      start: "2024-02",
    }),
    (v) => ({ experience: at(v, "experience", "id") }),
  ),
  career_save_education: write(
    career.saveEducationInputSchema,
    () => ({ institution: "UFPE", degree: "BSc", start: "2015" }),
    (v) => ({ education: at(v, "education", "id") }),
  ),
  career_save_fact: write(
    career.saveFactInputSchema,
    (ids) => ({
      experienceId: ids.experience,
      text: "Cut eval runtime by 40%",
      verified: true,
      skills: ["TypeScript"],
    }),
    (v) => ({ fact: at(v, "fact", "id") }),
  ),
  career_declare_skill: write(career.declareSkillInputSchema, () => ({
    skill: "TypeScript",
    level: "working",
  })),
  career_add_job: write(
    career.addJobInputSchema,
    () => ({
      company: "Evalco",
      role: "AI Engineer",
      language: "en",
      posting: "Evalco needs evals.",
      requirements: [
        { text: "Kubernetes", type: "required", skill: "Kubernetes" },
        { text: "TypeScript", type: "nice", skill: "TypeScript" },
      ],
      fit: { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 },
    }),
    (v) => ({
      job: at(v, "job", "id"),
      // Requirements come back in posting order: Kubernetes first.
      requirement: at(v, "job", "requirements", 0, "id"),
    }),
  ),
  career_list_jobs: read(career.listJobsInputSchema),
  career_get_job: read(career.getJobInputSchema, (ids) => ({ jobId: ids.job })),
  career_update_job: write(career.updateJobInputSchema, (ids) => ({
    jobId: ids.job,
    status: "applied",
  })),
  career_send_gaps: write(career.sendGapsInputSchema, (ids) => ({
    jobId: ids.job,
    gaps: [{ requirementId: ids.requirement, area: "DO", priority: 1 }],
  })),
  career_update_requirement: write(
    career.updateRequirementInputSchema,
    (ids) => ({ requirementId: ids.requirement, type: "nice" }),
  ),
  career_document_brief: read(career.documentBriefInputSchema, (ids) => ({
    jobId: ids.job,
    kind: "resume",
  })),
  career_save_selection: write(career.saveSelectionInputSchema, (ids) => ({
    jobId: ids.job,
    variant: "ai",
    items: [{ kind: "fact", id: ids.fact }],
  })),
  career_save_job_kit: write(career.saveJobKitInputSchema, (ids) => ({
    jobId: ids.job,
    intro: "I build evals.",
  })),
  career_save_standard_answers: write(
    career.saveStandardAnswersInputSchema,
    () => ({ answers: [{ label: "Notice period", value: "30 days" }] }),
  ),
  career_get_search_criteria: read(career.getSearchCriteriaInputSchema),
  career_save_openings: write(career.saveOpeningsInputSchema, () => ({
    openings: [
      {
        url: "https://jobs.example/1",
        company: "Company 1",
        role: "AI Engineer",
        lane: "AI engineering",
        posting: "We need evals.",
        why: "Evals-heavy, async",
      },
    ],
  })),
  career_list_openings: {
    ...read(career.listOpeningsInputSchema),
    keep: (v) => ({ opening: at(v, "openings", 0, "id") }),
  },
  career_update_opening: write(career.updateOpeningInputSchema, (ids) => ({
    openingId: ids.opening,
    status: "kept",
  })),
  career_save_story: write(
    career.saveStoryInputSchema,
    (ids) => ({
      title: "Faster evals",
      situation: "Evals took 2 hours",
      task: "Make them usable in CI",
      action: "Parallelized and cached",
      result: "Runtime cut",
      factIds: [ids.fact],
    }),
    (v) => ({ story: at(v, "story", "id") }),
  ),
  career_list_stories: read(career.listStoriesInputSchema),
  career_save_answer: write(career.saveAnswerInputSchema, (ids) => ({
    question: "What's your rate?",
    answer: "USD 50 an hour for this scope.",
    jobId: ids.job,
    storyId: ids.story,
  })),
  career_list_answers: read(career.listAnswersInputSchema),
  career_log_drill: write(career.logDrillInputSchema, () => ({
    mode: "negotiation",
    topic: "Evalco",
    weakest: ["Conceded the floor too early"],
    fix: "Hold the range; trade scope, not rate",
  })),
  career_list_drills: read(career.listDrillsInputSchema),

  // Removals last: what they remove was needed above.
  career_remove_skill: write(career.removeSkillInputSchema, () => ({
    skill: "TypeScript",
  })),
  career_remove_item: write(career.removeItemInputSchema, (ids) => ({
    kind: "education",
    id: ids.education,
  })),
  career_remove_job: write(career.removeJobInputSchema, (ids) => ({
    jobId: ids.job,
  })),
  study_remove_topic: write(study.removeTopicInputSchema, (ids) => ({
    topicId: ids.topic,
  })),
};

const registered: readonly LabTool[] = [...coreTools, ...labTools];

type Listed = {
  name: string;
  inputSchema: { properties?: Record<string, unknown>; required?: string[] };
};
let token: string;
let listed: Listed[];

beforeAll(async () => {
  token = (await signInClaude(await seedOwner())).tokens.access_token ?? "";
  const { message } = await mcp(token, "tools/list");
  listed = ((message?.result ?? { tools: [] }) as { tools: Listed[] }).tools;

  // study-materials holds exactly the course and the exam's two files.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new Request(input).url;
    const path = decodeURIComponent(url.slice(CONTENTS.length));
    if (!url.startsWith(CONTENTS) || !HELD.has(path))
      return new Response("not found", { status: 404 });
    return Response.json({
      type: "file",
      name: path.split("/").pop(),
      path,
      sha: "b".repeat(40),
      size: 100,
    });
  });
});
afterAll(() => {
  vi.restoreAllMocks();
});

/** Every row the owner has, mcp_call aside (each call adds its audit row). */
async function everything(): Promise<string> {
  const { results } = await db()
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT IN ('mcp_call', 'd1_migrations')
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`,
    )
    .all<{ name: string }>();
  const rows = await db().batch(
    results.map(({ name }) =>
      db().prepare(`SELECT * FROM ${name} ORDER BY rowid`),
    ),
  );
  return JSON.stringify(
    Object.fromEntries(results.map(({ name }, i) => [name, rows[i]?.results])),
  );
}

describe("the MCP contract", () => {
  it("has a case for every registered tool, and a tool for every case", () => {
    const names = listed.map((t) => t.name).sort();
    expect(
      names,
      "a tool without a case in CASES, or a case for no tool",
    ).toEqual(Object.keys(CASES).sort());
    expect(registered.map((t) => t.name).sort()).toEqual(names);
  });

  it("gives each tool its shared /api schema; only writes take idempotencyKey", () => {
    for (const tool of registered) {
      const want = CASES[tool.name] as Case;
      expect(tool.kind, tool.name).toBe(want.kind);
      if (want.schema) expect(tool.input, tool.name).toBe(want.schema);
      else expect(Object.keys(tool.input.shape), tool.name).toEqual([]);

      // What Claude sees in tools/list: the same fields, the same required.
      const shape: Record<string, z.ZodType> = (want.schema ?? z.object({}))
        .shape;
      const published = listed.find((t) => t.name === tool.name)?.inputSchema;
      const fields = Object.keys(shape);
      expect(
        Object.keys(published?.properties ?? {}).sort(),
        tool.name,
      ).toEqual(
        (want.kind === "write" ? [...fields, "idempotencyKey"] : fields).sort(),
      );
      expect([...(published?.required ?? [])].sort(), tool.name).toEqual(
        fields
          .filter((f) => !(shape[f] as z.ZodType).safeParse(undefined).success)
          .sort(),
      );
    }
  });

  it("runs every tool on valid input; a write replayed with its key changes nothing", async () => {
    const ids: Ids = {};
    for (const [name, c] of Object.entries(CASES)) {
      const args = c.args(ids);
      if (c.kind === "read") {
        const result = await callTool(token, name, args);
        expect(result, name).toMatchObject({ isError: false });
        Object.assign(ids, c.keep?.(result.value));
        continue;
      }
      const idempotencyKey = `${name}-${crypto.randomUUID()}`;
      const first = await callTool(token, name, { ...args, idempotencyKey });
      expect(first, name).toMatchObject({ isError: false });
      Object.assign(ids, c.keep?.(first.value));

      const before = await everything();
      const again = await callTool(token, name, { ...args, idempotencyKey });
      expect(again, `${name} replayed`).toEqual(first);
      expect(await everything(), `${name} replay wrote`).toBe(before);
    }
  });
});
