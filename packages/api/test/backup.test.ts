// H-02: a backup restored into an empty database and bucket (same migrations)
// reproduces every row and every file. The data is seeded through the real
// routes where they exist, with the cases the triggers make hard: graded and
// corrected exams, a fact removed after a selection cited it, a tracked
// opening, a soft-deleted skill, the photo.
import { applyD1Migrations, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import {
  BACKUP_EXCLUDED,
  BACKUP_TABLES,
  backupDataSchema,
  backupStatusSchema,
  restoreStatements,
} from "@projects-lab/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { backupData } from "../src/core/backup-routes";
import { db } from "./db";
import { ORIGIN, seedOwner, sessionJwt, signInClaude } from "./oauth-flow";

let session: string;
let authKey: string;

const call = (
  path: string,
  init: {
    method?: string;
    body?: unknown;
    raw?: BodyInit;
    type?: string;
    token?: string;
  } = {},
) =>
  SELF.fetch(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token ?? session}`,
      "Content-Type": init.type ?? "application/json",
    },
    ...(init.raw !== undefined
      ? { body: init.raw }
      : init.body === undefined
        ? {}
        : { body: JSON.stringify(init.body) }),
  });
async function ok<T>(res: Response): Promise<T> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
}
const post = <T>(path: string, body: unknown, method = "POST") =>
  call(path, { method, body }).then((r) => ok<T>(r));

const JPEG = new Uint8Array(64);
JPEG.set([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeAll(async () => {
  authKey = await seedOwner();
  session = await sessionJwt();

  // Study: a topic with a course, an essential exam graded then corrected, a
  // second attempt graded, and a removed topic.
  const added = await post<{ topics: { topic: { id: string } }[] }>(
    "/api/study/topics",
    {
      topics: [
        { skill: "Graphs", area: "CS", level: "essential" },
        { skill: "Docker", area: "DO" },
      ],
    },
  );
  const code = added.topics[0]?.topic.id as string;
  const topic = await db()
    .prepare("SELECT id FROM learn_topic WHERE code = ?")
    .bind(code)
    .first<{ id: string }>();
  const path = (n: number, ext: string) =>
    `Study Lab/cs/graphs/graphs__essential__exam-${n}.${ext}`;
  await db().batch([
    db()
      .prepare(
        "INSERT INTO learn_course (id, topic_id, level, path, recorded_at) VALUES ('c1', ?, 'essential', 'Study Lab/cs/graphs/graphs__essential.md', 't')",
      )
      .bind(topic?.id),
    ...[1, 2].map((n) =>
      db()
        .prepare(
          "INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES (?, ?, 'essential', ?, ?, ?, 't')",
        )
        .bind(`e${n}`, topic?.id, n, path(n, "md"), path(n, "pdf")),
    ),
    db().prepare(
      "UPDATE learn_exam SET grade = 60, graded_at = '2026-10-01T10:00:00.000Z' WHERE id = 'e1'",
    ),
    db().prepare("UPDATE learn_exam SET grade = 65 WHERE id = 'e1'"),
    db().prepare(
      "UPDATE learn_exam SET grade = 85, graded_at = '2026-10-05T10:00:00.000Z' WHERE id = 'e2'",
    ),
    // Two exams made in the app (ST-13), no PDF: one submitted and graded,
    // one with only a draft.
    ...[3, 4].map((n) =>
      db()
        .prepare(
          "INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES (?, ?, 'essential', ?, ?, NULL, 'app', 't')",
        )
        .bind(`e${n}`, topic?.id, n, path(n, "md")),
    ),
    ...[3, 4].map((n) =>
      db()
        .prepare(
          `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at)
           VALUES (?, 'Graphs', '{"questions":1}', '[{"type":"OPEN","stem":"Why BFS?"}]', '[{"type":"OPEN","modelAnswer":"Levels.","mustCover":["levels"]}]', '[{"type":"OPEN","text":"Layers"}]', 't', 't')`,
        )
        .bind(`e${n}`),
    ),
    db().prepare(
      `UPDATE learn_exam_paper SET submitted_at = '2026-10-06T10:00:00.000Z', results_json = '[{"number":1,"accuracy":70,"feedback":"Close."}]' WHERE exam_id = 'e3'`,
    ),
    db().prepare(
      "UPDATE learn_exam SET grade = 70, graded_at = '2026-10-06T10:00:00.000Z' WHERE id = 'e3'",
    ),
    db()
      .prepare("UPDATE learn_topic SET status = 'done' WHERE id = ?")
      .bind(topic?.id),
  ]);
  await call(`/api/study/topics/${added.topics[1]?.topic.id}`, {
    method: "DELETE",
  });

  // Skills: one with an alias, one soft-deleted.
  await db().batch([
    db().prepare(
      "INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('pg', 'PostgreSQL', '[\"Postgres\"]', 't')",
    ),
    db().prepare(
      "INSERT INTO skill (id, name, created_at, deleted_at) VALUES ('old', 'Perl', 't', 't')",
    ),
    db().prepare(
      "INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m1', 'career_add_job', 'claude', 1, 't')",
    ),
  ]);

  // Career: profile, a fact cited by a selection and then removed, a job with
  // its history, kit and answers, a tracked opening, criteria, stories,
  // answers, drills, the photo.
  await post(
    "/api/career/person",
    { fullName: "Sam Rivera", email: "sam@example.com" },
    "PATCH",
  );
  await post(
    "/api/career/links",
    {
      links: [
        { kind: "github", label: "GitHub", url: "https://github.com/sam" },
      ],
    },
    "PUT",
  );
  const exp = (
    await post<{ experience: { id: string } }>("/api/career/experiences", {
      organization: "Acme",
      title: "Engineer",
      kind: "contract",
      start: "2023-04",
    })
  ).experience.id;
  await post("/api/career/education", {
    institution: "UFPE",
    degree: "BSc",
    start: "2015",
    end: "2019",
  });
  const kept = (
    await post<{ fact: { id: string } }>("/api/career/facts", {
      experienceId: exp,
      text: "Built the eval harness",
      skills: ["PostgreSQL"],
      verified: true,
    })
  ).fact.id;
  const gone = (
    await post<{ fact: { id: string } }>("/api/career/facts", {
      experienceId: exp,
      text: "Cut eval runtime",
      verified: true,
    })
  ).fact.id;
  await post(
    "/api/career/skills",
    { skill: "PostgreSQL", level: "strong", years: 4 },
    "PUT",
  );
  await db()
    .prepare(
      "INSERT INTO career_opening (id, url, company, role, lane, posting, why, created_at, updated_at) VALUES ('op1', 'https://jobs.example/1', 'Acme', 'AI Engineer', 'AI', 'Excerpt', 'Evals', 't', 't')",
    )
    .run();
  const job = (
    await post<{ job: { id: string } }>("/api/career/jobs", {
      openingId: "op1",
      company: "Acme",
      role: "AI Engineer",
      language: "en",
      posting: "We need evals.",
      requirements: [
        { text: "Postgres", type: "required", skill: "Postgres" },
        { text: "Visa", type: "not_mapped" },
      ],
      fit: { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 },
    })
  ).job.id;
  await post(
    `/api/career/jobs/${job}`,
    { status: "applied", note: "Sent" },
    "PATCH",
  );
  await post(
    `/api/career/jobs/${job}/selection`,
    {
      variant: "ai",
      items: [
        { kind: "fact", id: kept },
        { kind: "fact", id: gone },
      ],
    },
    "PUT",
  );
  await call(`/api/career/items/fact/${gone}`, { method: "DELETE" });
  await post(
    `/api/career/jobs/${job}/kit`,
    {
      intro: "I build evals.",
      salary: { min: 40, max: 60, currency: "USD", period: "hour" },
      answers: [{ question: "Why us?", answer: "Evals." }],
    },
    "PUT",
  );
  await post(
    "/api/career/standard-answers",
    { answers: [{ label: "Notice", value: "30 days" }] },
    "PUT",
  );
  await post(
    "/api/career/search-criteria",
    {
      queries: ["ai engineer"],
      lanes: ["AI"],
      shapes: ["contract"],
      maxHours: 20,
      timezoneNote: "",
      rateFloor: { amount: 35, currency: "USD", period: "hour" },
      autoReject: [],
      maxAgeDays: 14,
      sources: [],
    },
    "PUT",
  );
  const story = (
    await post<{ story: { id: string } }>("/api/career/stories", {
      title: "Evals",
      situation: "s",
      task: "t",
      action: "a",
      result: "r",
      factIds: [kept],
      skills: ["PostgreSQL"],
    })
  ).story.id;
  await post("/api/career/answers", {
    question: "Why evals?",
    answer: "Because.",
    driveLink:
      "https://drive.google.com/file/d/1aBcD_eFgHiJ-kLmNoPqRsTuVwXyZ012/view",
    storyId: story,
    jobId: job,
  });
  await post("/api/career/drills", {
    mode: "behavioral",
    topic: "Acme",
    weakest: ["a"],
    fix: "f",
  });
  const photo = await call("/api/career/photo", {
    method: "PUT",
    raw: JPEG,
    type: "image/jpeg",
  });
  expect(photo.status).toBe(200);
});

describe("backup", () => {
  it("covers every table: each is backed up or excluded on purpose", async () => {
    const { results } = await db()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations'",
      )
      .all<{ name: string }>();
    expect(results.map((r) => r.name).sort()).toEqual(
      [...BACKUP_TABLES, ...BACKUP_EXCLUDED].sort(),
    );
  });

  it("is the session's only: an OAuth token can't read it", async () => {
    const claude = await signInClaude(authKey);
    const token = claude.tokens.access_token ?? "";
    expect((await call("/api/backup/data", { token })).status).toBe(401);
    expect(
      (await call("/api/backup/files/profile/photo.jpg", { token })).status,
    ).toBe(401);
  });

  it("restores into an empty database and bucket: every row and every file", async () => {
    const data = backupDataSchema.parse(
      await ok(await call("/api/backup/data")),
    );
    // Every table that holds the owner's data has rows here.
    for (const table of BACKUP_TABLES)
      expect(data.tables[table]?.length, table).toBeGreaterThan(0);
    expect(data.files.map((f) => f.key)).toEqual(["profile/photo.jpg"]);
    const bytes = new Uint8Array(
      await (await call("/api/backup/files/profile/photo.jpg")).arrayBuffer(),
    );
    expect(bytes).toEqual(JPEG);

    await applyD1Migrations(env.RESTORE_DB, env.TEST_MIGRATIONS);
    const statements = restoreStatements(data);
    await env.RESTORE_DB.batch(
      statements.map((sql) => env.RESTORE_DB.prepare(sql)),
    );
    for (const file of data.files)
      await env.RESTORE_FILES.put(file.key, bytes, {
        httpMetadata: { contentType: file.contentType },
      });

    const sorted = (rows: unknown[]) =>
      rows.map((r) => JSON.stringify(r)).sort();
    for (const table of BACKUP_TABLES) {
      const { results } = await env.RESTORE_DB.prepare(
        `SELECT * FROM ${table}`,
      ).all();
      expect(sorted(results), table).toEqual(sorted(data.tables[table] ?? []));
    }
    const restored = await env.RESTORE_FILES.get("profile/photo.jpg");
    expect(
      new Uint8Array(await (restored as R2ObjectBody).arrayBuffer()),
    ).toEqual(JPEG);
    expect(restored?.httpMetadata?.contentType).toBe("image/jpeg");
  });

  it("records the export on the server, never in the browser", async () => {
    expect(
      backupStatusSchema.parse(await ok(await call("/api/backup"))),
    ).toEqual({
      lastExportedAt: null,
    });
    const done = await ok<{ lastExportedAt: string }>(
      await call("/api/backup/done", { method: "POST" }),
    );
    expect(Date.parse(done.lastExportedAt)).not.toBeNaN();
    expect(await ok(await call("/api/backup"))).toEqual(done);
  });

  it("refuses a missing file, and no key at all", async () => {
    expect((await call("/api/backup/files/profile/nope.png")).status).toBe(404);
    expect((await call("/api/backup/files/")).status).toBe(404);
  });

  it("lists every file when R2 pages the list", async () => {
    const pages = [
      { objects: [{ key: "a.png", size: 1 }], truncated: true, cursor: "c1" },
      { objects: [{ key: "b.png", size: 2 }], truncated: false },
    ];
    const cursors: (string | undefined)[] = [];
    const paged = {
      list: async (options: { cursor?: string }) => {
        cursors.push(options.cursor);
        return pages[cursors.length - 1];
      },
    } as unknown as R2Bucket;
    const data = await backupData(db(), paged, new Date());
    expect(data.files.map((f) => f.key)).toEqual(["a.png", "b.png"]);
    expect(cursors).toEqual([undefined, "c1"]);
  });
});
