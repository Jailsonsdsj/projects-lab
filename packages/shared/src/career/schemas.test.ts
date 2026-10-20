import { describe, expect, it } from "vitest";
import { toJSONSchema, type ZodType } from "zod";
import {
  LONG_TOOL_STRINGS,
  TOOL_STRING_MAX,
  unboundedToolStrings,
} from "../core/tool-strings";
import {
  addJobInputSchema,
  declareSkillInputSchema,
  documentBriefInputSchema,
  getJobInputSchema,
  getProfileInputSchema,
  getSearchCriteriaInputSchema,
  listAnswersInputSchema,
  listDrillsInputSchema,
  listJobsInputSchema,
  listOpeningsInputSchema,
  listStoriesInputSchema,
  logDrillInputSchema,
  removeItemInputSchema,
  removeJobInputSchema,
  removeSkillInputSchema,
  saveAnswerInputSchema,
  saveEducationInputSchema,
  saveExperienceInputSchema,
  saveFactInputSchema,
  saveJobKitInputSchema,
  saveOpeningsInputSchema,
  saveSearchCriteriaInputSchema,
  saveSelectionInputSchema,
  saveStandardAnswersInputSchema,
  saveStoryInputSchema,
  sendGapsInputSchema,
  setLinksInputSchema,
  updateJobInputSchema,
  updateOpeningInputSchema,
  updatePersonInputSchema,
  updateRequirementInputSchema,
} from "./schemas";

// Each failing path once: a value can break two checks (length and pattern).
const issues = (schema: ZodType, input: unknown) => {
  const result = schema.safeParse(input);
  return result.success
    ? []
    : [...new Set(result.error.issues.map((i) => i.path.join(".")))];
};
const ok = (schema: ZodType, input: unknown) =>
  expect(issues(schema, input)).toEqual([]);
const x = (n: number) => "x".repeat(n);
const ID = "3f6b1c2e-9a7d-4e21-8b5c-0d4f7a9e1b23";
const DRIVE =
  "https://drive.google.com/file/d/1aBcD_eFgHiJ-kLmNoPqRsTuVwXyZ012/view";

describe("profile inputs (20)", () => {
  it("updates the person partly, refusing nothing to change", () => {
    ok(updatePersonInputSchema, {
      headline: "AI engineer",
      timezone: "America/Recife",
    });
    ok(updatePersonInputSchema, {
      languages: [{ name: "English", level: "C1" }],
    });
    expect(issues(updatePersonInputSchema, {})).toEqual([""]);
    expect(
      issues(updatePersonInputSchema, { timezone: "Mars/Olympus" }),
    ).toEqual(["timezone"]);
    expect(issues(updatePersonInputSchema, { timezone: "" })).toEqual([
      "timezone",
    ]);
    expect(issues(updatePersonInputSchema, { email: "not an email" })).toEqual([
      "email",
    ]);
    expect(issues(updatePersonInputSchema, { summary: x(601) })).toEqual([
      "summary",
    ]);
  });

  it("sets links over https only", () => {
    ok(setLinksInputSchema, {
      links: [
        { kind: "github", label: "GitHub", url: "https://github.com/someone" },
      ],
    });
    ok(setLinksInputSchema, { links: [] });
    expect(
      issues(setLinksInputSchema, {
        links: [
          { kind: "github", label: "GitHub", url: "http://github.com/someone" },
        ],
      }),
    ).toEqual(["links.0.url"]);
    expect(
      issues(setLinksInputSchema, {
        links: [{ kind: "twitter", label: "X", url: "https://x.com/a" }],
      }),
    ).toEqual(["links.0.kind"]);
  });

  it("saves an experience with dates in order", () => {
    const job = {
      organization: "Acme",
      title: "Engineer",
      kind: "contract",
      start: "2023-04",
    };
    ok(saveExperienceInputSchema, job);
    ok(saveExperienceInputSchema, { ...job, id: ID, end: "2024" });
    ok(saveExperienceInputSchema, { ...job, end: null });
    expect(
      issues(saveExperienceInputSchema, { ...job, end: "2023-03" }),
    ).toEqual(["end"]);
    expect(
      issues(saveExperienceInputSchema, { ...job, start: "04/2023" }),
    ).toEqual(["start"]);
    expect(
      issues(saveExperienceInputSchema, { ...job, kind: "volunteer" }),
    ).toEqual(["kind"]);
    expect(
      issues(saveExperienceInputSchema, { ...job, organization: "  " }),
    ).toEqual(["organization"]);
  });

  it("saves education with dates in order", () => {
    const degree = { institution: "UFPE", degree: "BSc", start: "2015" };
    ok(saveEducationInputSchema, { ...degree, end: "2019-12" });
    expect(
      issues(saveEducationInputSchema, { ...degree, end: "2014" }),
    ).toEqual(["end"]);
  });

  it("saves a fact under one parent at most, within 300 characters", () => {
    ok(saveFactInputSchema, {
      text: x(300),
      experienceId: ID,
      skills: ["TypeScript"],
    });
    ok(saveFactInputSchema, { text: "Shipped it", verified: true });
    expect(issues(saveFactInputSchema, { text: x(301) })).toEqual(["text"]);
    expect(issues(saveFactInputSchema, { text: "" })).toEqual(["text"]);
    expect(
      issues(saveFactInputSchema, {
        text: "a",
        experienceId: ID,
        educationId: ID,
      }),
    ).toEqual(["educationId"]);
    expect(
      issues(saveFactInputSchema, { text: "a", experienceId: "../x" }),
    ).toEqual(["experienceId"]);
  });

  it("declares a skill at a level", () => {
    ok(declareSkillInputSchema, { skill: "React", level: "strong", years: 5 });
    expect(
      issues(declareSkillInputSchema, { skill: "React", level: "expert" }),
    ).toEqual(["level"]);
    expect(
      issues(declareSkillInputSchema, {
        skill: "React",
        level: "working",
        years: 2.5,
      }),
    ).toEqual(["years"]);
    expect(
      issues(declareSkillInputSchema, {
        skill: "React",
        level: "working",
        years: -1,
      }),
    ).toEqual(["years"]);
  });

  it("removes experiences, education and facts only", () => {
    ok(removeItemInputSchema, { kind: "fact", id: ID });
    expect(issues(removeItemInputSchema, { kind: "job", id: ID })).toEqual([
      "kind",
    ]);
    ok(removeSkillInputSchema, { skill: "React" });
  });
});

describe("job inputs (21)", () => {
  const fit = { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 };
  const job = {
    company: "Acme",
    role: "AI Engineer",
    language: "en",
    posting: "We need an AI engineer…",
    requirements: [
      { text: "TypeScript", type: "required", skill: "TypeScript" },
      { text: "Evals", type: "nice", skill: "LLM evaluation" },
      { text: "5+ years", type: "not_mapped" },
    ],
    fit,
  };

  it("adds a job with mapped requirements and five fit scores", () => {
    ok(addJobInputSchema, job);
    ok(addJobInputSchema, {
      ...job,
      language: "pt-BR",
      posting: x(20_000),
      openingId: ID,
    });
    expect(issues(addJobInputSchema, { ...job, posting: x(20_001) })).toEqual([
      "posting",
    ]);
    for (const bad of ["EN", "en-br", "e"])
      expect(issues(addJobInputSchema, { ...job, language: bad })).toEqual([
        "language",
      ]);
    expect(issues(addJobInputSchema, { ...job, language: "English" })).toEqual([
      "language",
    ]);
    expect(issues(addJobInputSchema, { ...job, requirements: [] })).toEqual([
      "requirements",
    ]);
  });

  it("pairs a requirement's skill with its type (K-9)", () => {
    const one = (requirement: object) =>
      issues(addJobInputSchema, { ...job, requirements: [requirement] });
    expect(one({ text: "Go", type: "required" })).toEqual([
      "requirements.0.skill",
    ]);
    expect(one({ text: "Visa", type: "not_mapped", skill: "Visa" })).toEqual([
      "requirements.0.skill",
    ]);
    expect(one({ text: x(121), type: "required", skill: "Go" })).toEqual([
      "requirements.0.text",
    ]);
  });

  it("takes the fit's dimensions only, each within its maximum", () => {
    expect(
      issues(addJobInputSchema, { ...job, fit: { ...fit, growth: 21 } }),
    ).toEqual(["fit.growth"]);
    expect(
      issues(addJobInputSchema, { ...job, fit: { ...fit, pay: 7.5 } }),
    ).toEqual(["fit.pay"]);
    const { signal: _, ...missing } = fit;
    expect(issues(addJobInputSchema, { ...job, fit: missing })).toEqual([
      "fit.signal",
    ]);
  });

  it("updates a job: a note only with a status, something to change", () => {
    ok(updateJobInputSchema, {
      jobId: ID,
      status: "applied",
      note: "Sent via form",
    });
    ok(updateJobInputSchema, { jobId: ID, fit });
    expect(issues(updateJobInputSchema, { jobId: ID })).toEqual([""]);
    expect(issues(updateJobInputSchema, { jobId: ID, note: "hi" })).toEqual([
      "",
      "note",
    ]);
    expect(
      issues(updateJobInputSchema, { jobId: ID, status: "ghosted" }),
    ).toEqual(["status"]);
  });

  it("updates a requirement keeping K-9", () => {
    ok(updateRequirementInputSchema, { requirementId: ID, skill: "Go" });
    ok(updateRequirementInputSchema, {
      requirementId: ID,
      type: "not_mapped",
      skill: null,
    });
    expect(issues(updateRequirementInputSchema, { requirementId: ID })).toEqual(
      [""],
    );
    expect(
      issues(updateRequirementInputSchema, {
        requirementId: ID,
        type: "not_mapped",
        skill: "Go",
      }),
    ).toEqual(["skill"]);
    expect(
      issues(updateRequirementInputSchema, { requirementId: ID, skill: null }),
    ).toEqual(["skill"]);
  });

  it("sends gaps with an area and a priority, each once", () => {
    const gap = { requirementId: ID, area: "AI", priority: 1 };
    ok(sendGapsInputSchema, { jobId: ID, gaps: [gap] });
    expect(
      issues(sendGapsInputSchema, {
        jobId: ID,
        gaps: [{ ...gap, area: "ai" }],
      }),
    ).toEqual(["gaps.0.area"]);
    expect(
      issues(sendGapsInputSchema, {
        jobId: ID,
        gaps: [{ ...gap, priority: 4 }],
      }),
    ).toEqual(["gaps.0.priority"]);
    expect(
      issues(sendGapsInputSchema, { jobId: ID, gaps: [gap, gap] }),
    ).toEqual(["gaps"]);
    expect(issues(sendGapsInputSchema, { jobId: ID, gaps: [] })).toEqual([
      "gaps",
    ]);
  });

  it("lists, gets and removes by ID", () => {
    ok(listJobsInputSchema, {});
    ok(listJobsInputSchema, { status: "closed_silent" });
    ok(getJobInputSchema, { jobId: ID });
    expect(issues(removeJobInputSchema, { jobId: "" })).toEqual(["jobId"]);
    expect(issues(getJobInputSchema, { jobId: x(65) })).toEqual(["jobId"]);
  });
});

describe("document inputs (22)", () => {
  it("asks for a brief by kind", () => {
    ok(documentBriefInputSchema, { jobId: ID, kind: "cover_letter" });
    expect(
      issues(documentBriefInputSchema, { jobId: ID, kind: "portfolio" }),
    ).toEqual(["kind"]);
  });

  it("saves a selection of IDs, each once, with a variant", () => {
    const items = [
      { kind: "fact", id: ID },
      { kind: "skill", id: "s1" },
    ];
    ok(saveSelectionInputSchema, { jobId: ID, variant: "ai", items });
    expect(
      issues(saveSelectionInputSchema, { jobId: ID, variant: "AI!", items }),
    ).toEqual(["variant"]);
    expect(
      issues(saveSelectionInputSchema, {
        jobId: ID,
        variant: "ai",
        items: [items[0], items[0]],
      }),
    ).toEqual(["items"]);
    expect(
      issues(saveSelectionInputSchema, {
        jobId: ID,
        variant: "ai",
        items: [{ kind: "file", id: ID }],
      }),
    ).toEqual(["items.0.kind"]);
  });

  it("saves a job kit: whole-unit salary, bounded texts, null clears", () => {
    const salary = { min: 40, max: 60, currency: "USD", period: "hour" };
    ok(saveJobKitInputSchema, {
      jobId: ID,
      intro: x(1_500),
      salary,
      answers: [{ question: "Why us?", answer: x(2_000) }],
    });
    ok(saveJobKitInputSchema, { jobId: ID, salary: null });
    expect(issues(saveJobKitInputSchema, { jobId: ID })).toEqual([""]);
    expect(
      issues(saveJobKitInputSchema, { jobId: ID, intro: x(1_501) }),
    ).toEqual(["intro"]);
    expect(
      issues(saveJobKitInputSchema, {
        jobId: ID,
        salary: { ...salary, min: 61 },
      }),
    ).toEqual(["salary.max"]);
    expect(
      issues(saveJobKitInputSchema, {
        jobId: ID,
        salary: { ...salary, max: 60.5 },
      }),
    ).toEqual(["salary.max"]);
    expect(
      issues(saveJobKitInputSchema, {
        jobId: ID,
        salary: { ...salary, currency: "XYZ" },
      }),
    ).toEqual(["salary.currency"]);
    expect(
      issues(saveJobKitInputSchema, {
        jobId: ID,
        answers: [{ question: "Q", answer: x(2_001) }],
      }),
    ).toEqual(["answers.0.answer"]);
  });

  it("saves standard answers with labels unique ignoring case", () => {
    ok(saveStandardAnswersInputSchema, {
      answers: [{ label: "Notice period", value: "30 days" }],
    });
    expect(
      issues(saveStandardAnswersInputSchema, {
        answers: [
          { label: "Notice period", value: "30 days" },
          { label: "notice PERIOD", value: "2 weeks" },
        ],
      }),
    ).toEqual(["answers"]);
    expect(
      issues(saveStandardAnswersInputSchema, {
        answers: [{ label: "A", value: x(301) }],
      }),
    ).toEqual(["answers.0.value"]);
  });
});

describe("job search inputs (23)", () => {
  const criteria = {
    queries: ['"AI engineer" contract remote'],
    lanes: ["AI engineering", "Front-end (fallback)"],
    shapes: ["contract", "part-time"],
    maxHours: 20,
    timezoneNote: "Overlap with UTC−3",
    rateFloor: { amount: 35, currency: "USD", period: "hour" },
    autoReject: ["crypto"],
    maxAgeDays: 14,
    sources: ["RemoteOK"],
  };

  it("saves the criteria form", () => {
    ok(saveSearchCriteriaInputSchema, criteria);
    ok(saveSearchCriteriaInputSchema, { ...criteria, rateFloor: null });
    expect(
      issues(saveSearchCriteriaInputSchema, { ...criteria, lanes: [] }),
    ).toEqual(["lanes"]);
    expect(
      issues(saveSearchCriteriaInputSchema, {
        ...criteria,
        lanes: ["AI", "ai"],
      }),
    ).toEqual(["lanes"]);
    expect(
      issues(saveSearchCriteriaInputSchema, { ...criteria, maxAgeDays: 0 }),
    ).toEqual(["maxAgeDays"]);
    expect(
      issues(saveSearchCriteriaInputSchema, { ...criteria, maxHours: 20.5 }),
    ).toEqual(["maxHours"]);
    expect(
      issues(saveSearchCriteriaInputSchema, {
        ...criteria,
        queries: Array(21)
          .fill("q")
          .map((q, i) => q + i),
      }),
    ).toEqual(["queries"]);
  });

  it("saves openings in batches of 20, each URL once, posting excerpts", () => {
    const opening = (n: number) => ({
      url: `https://jobs.example/${n}`,
      company: "Acme",
      role: "AI Engineer",
      lane: "AI engineering",
      posting: x(4_000),
      postedOn: "2026-10-12",
      why: "Evals-heavy, async",
    });
    ok(saveOpeningsInputSchema, {
      openings: Array.from({ length: 20 }, (_, n) => opening(n)),
    });
    expect(
      issues(saveOpeningsInputSchema, {
        openings: Array.from({ length: 21 }, (_, n) => opening(n)),
      }),
    ).toEqual(["openings"]);
    expect(
      issues(saveOpeningsInputSchema, { openings: [opening(1), opening(1)] }),
    ).toEqual(["openings"]);
    expect(
      issues(saveOpeningsInputSchema, {
        openings: [{ ...opening(1), posting: x(4_001) }],
      }),
    ).toEqual(["openings.0.posting"]);
    expect(
      issues(saveOpeningsInputSchema, {
        openings: [{ ...opening(1), postedOn: "2026-02-30" }],
      }),
    ).toEqual(["openings.0.postedOn"]);
    expect(
      issues(saveOpeningsInputSchema, {
        openings: [{ ...opening(1), url: "ftp://jobs.example/1" }],
      }),
    ).toEqual(["openings.0.url"]);
  });

  it("lets the owner keep or dismiss, never mark tracked", () => {
    ok(updateOpeningInputSchema, { openingId: ID, status: "dismissed" });
    expect(
      issues(updateOpeningInputSchema, { openingId: ID, status: "tracked" }),
    ).toEqual(["status"]);
    ok(listOpeningsInputSchema, { status: "new" });
  });
});

describe("interview inputs (24)", () => {
  const story = {
    title: "Cut eval time",
    situation: "s",
    task: "t",
    action: "a",
    result: "r",
    factIds: [ID],
  };

  it("saves a STAR story, each part within 600", () => {
    ok(saveStoryInputSchema, story);
    expect(issues(saveStoryInputSchema, { ...story, result: x(601) })).toEqual([
      "result",
    ]);
    expect(issues(saveStoryInputSchema, { ...story, task: "" })).toEqual([
      "task",
    ]);
    expect(
      issues(saveStoryInputSchema, { ...story, factIds: [ID, ID] }),
    ).toEqual(["factIds"]);
  });

  it("saves an answer with a Drive link only", () => {
    const answer = { question: "Tell me about yourself", answer: x(3_000) };
    ok(saveAnswerInputSchema, { ...answer, driveLink: DRIVE, jobId: ID });
    ok(saveAnswerInputSchema, { ...answer, driveLink: null });
    expect(
      issues(saveAnswerInputSchema, {
        ...answer,
        driveLink: "https://youtu.be/dQw4w9WgXcQ",
      }),
    ).toEqual(["driveLink"]);
    expect(
      issues(saveAnswerInputSchema, { ...answer, answer: x(3_001) }),
    ).toEqual(["answer"]);
    expect(
      issues(saveAnswerInputSchema, { ...answer, question: x(201) }),
    ).toEqual(["question"]);
  });

  it("lists a job's answers or the general ones", () => {
    ok(listAnswersInputSchema, { jobId: ID });
    ok(listAnswersInputSchema, { general: true });
    expect(
      issues(listAnswersInputSchema, { jobId: ID, general: true }),
    ).toEqual(["general"]);
  });

  it("logs a drill with at most two weakest answers", () => {
    const drill = {
      mode: "behavioral",
      topic: "Acme",
      weakest: ["a", "b"],
      fix: "Quantify",
    };
    ok(logDrillInputSchema, drill);
    expect(
      issues(logDrillInputSchema, { ...drill, weakest: ["a", "b", "c"] }),
    ).toEqual(["weakest"]);
    expect(issues(logDrillInputSchema, { ...drill, mode: "case" })).toEqual([
      "mode",
    ]);
    ok(listDrillsInputSchema, { limit: 10 });
    expect(issues(listDrillsInputSchema, { limit: 51 })).toEqual(["limit"]);
  });
});

// The MCP tool-string rule (02-integration, core/tool-strings.ts), by tool name.
describe("every career_* input is bounded", () => {
  const tools: Record<string, ZodType> = {
    career_get_profile: getProfileInputSchema,
    career_update_person: updatePersonInputSchema,
    career_set_links: setLinksInputSchema,
    career_save_experience: saveExperienceInputSchema,
    career_save_education: saveEducationInputSchema,
    career_save_fact: saveFactInputSchema,
    career_declare_skill: declareSkillInputSchema,
    career_remove_item: removeItemInputSchema,
    career_remove_skill: removeSkillInputSchema,
    career_add_job: addJobInputSchema,
    career_list_jobs: listJobsInputSchema,
    career_get_job: getJobInputSchema,
    career_update_job: updateJobInputSchema,
    career_update_requirement: updateRequirementInputSchema,
    career_send_gaps: sendGapsInputSchema,
    career_remove_job: removeJobInputSchema,
    career_document_brief: documentBriefInputSchema,
    career_save_selection: saveSelectionInputSchema,
    career_save_job_kit: saveJobKitInputSchema,
    career_save_standard_answers: saveStandardAnswersInputSchema,
    career_get_search_criteria: getSearchCriteriaInputSchema,
    career_save_openings: saveOpeningsInputSchema,
    career_list_openings: listOpeningsInputSchema,
    career_update_opening: updateOpeningInputSchema,
    career_list_stories: listStoriesInputSchema,
    career_save_story: saveStoryInputSchema,
    career_list_answers: listAnswersInputSchema,
    career_save_answer: saveAnswerInputSchema,
    career_log_drill: logDrillInputSchema,
    // The criteria form is the app's only, but it's held to the same rule.
    criteria_form: saveSearchCriteriaInputSchema,
  };
  const json = Object.entries(tools).map(
    ([name, schema]) => [name, toJSONSchema(schema, { io: "input" })] as const,
  );

  it("has no unbounded string anywhere", () => {
    expect(
      json.flatMap(([name, schema]) => unboundedToolStrings(schema, name)),
    ).toEqual([]);
  });

  it("names exactly the fields longer than 1,000, so the list never goes stale", () => {
    const long: string[] = [];
    const walk = (node: unknown, where: string) => {
      if (!node || typeof node !== "object") return;
      const s = node as Record<string, unknown>;
      if (typeof s.maxLength === "number" && s.maxLength > TOOL_STRING_MAX)
        long.push(where);
      for (const [key, value] of Object.entries((s.properties ?? {}) as object))
        walk(value, `${where}.${key}`);
      if (s.items) walk(s.items, `${where}[]`);
      for (const sub of [
        ...((s.anyOf as unknown[]) ?? []),
        ...((s.allOf as unknown[]) ?? []),
      ])
        walk(sub, where);
    };
    for (const [name, schema] of json) walk(schema, name);
    expect([...new Set(long)].sort()).toEqual([...LONG_TOOL_STRINGS].sort());
  });
});
