// The Skills tab's read (CA-10, docs/prd/20-career-profile.md § Screens)
// through the real Worker and Study contract: declared skills carry Study's
// verification, and Study's verified skills the profile doesn't declare are
// offered once, then gone when declared.
import { SELF } from "cloudflare:test";
import { skillsResponseSchema } from "@projects-lab/shared/career";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { ORIGIN, seedOwner, sessionJwt } from "./oauth-flow";

let session: string;
beforeAll(async () => {
  await seedOwner();
  session = await sessionJwt();
});

const call = (
  base: "career" | "study",
  path: string,
  init: { method?: string; body?: unknown } = {},
) =>
  SELF.fetch(`${ORIGIN}/api/${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session}`,
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
const skills = async () => {
  const res = await call("career", "/skills");
  expect(res.status).toBe(200);
  return skillsResponseSchema.parse(await res.json());
};

/** Study verifies a skill: a Done topic with an exam graded `grade` (tenths). */
async function verifyInStudy(skill: string, area: string, grade: number) {
  const res = await call("study", "/topics", {
    method: "POST",
    body: { topics: [{ skill, area }] },
  });
  const code = ((await res.json()) as { topics: { topic: { id: string } }[] })
    .topics[0]?.topic.id as string;
  const base = `Study Lab/x/${code.toLowerCase()}/${code.toLowerCase()}__essential__exam-1`;
  await db().batch([
    db()
      .prepare(
        "INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) SELECT ?, id, 'essential', 1, ?, ?, 't' FROM learn_topic WHERE code = ?",
      )
      .bind(`exam-${code}`, `${base}.md`, `${base}.pdf`, code),
    db()
      .prepare(
        "UPDATE learn_exam SET grade = ?, graded_at = '2026-10-01T12:00:00.000Z' WHERE id = ?",
      )
      .bind(grade, `exam-${code}`),
    db()
      .prepare("UPDATE learn_topic SET status = 'done' WHERE code = ?")
      .bind(code),
  ]);
}

describe("skills", () => {
  it("are empty with nothing declared or verified", async () => {
    expect(await skills()).toEqual({ skills: [], offers: [] });
  });

  it("carry Study's verification and offer what Study verified but isn't declared", async () => {
    await call("career", "/skills", {
      method: "PUT",
      body: { skill: "TypeScript", level: "strong", years: 6 },
    });
    await call("career", "/skills", {
      method: "PUT",
      body: { skill: "Python", level: "working" },
    });
    await verifyInStudy("TypeScript", "FE", 85);
    await verifyInStudy("Kubernetes", "DO", 72);
    await verifyInStudy("Graphs", "CS", 65); // below 7.0: not verified, not offered

    const { skills: declared, offers } = await skills();
    expect(declared).toMatchObject([
      { name: "Python", level: "working", readiness: "declared", grade: null },
      {
        name: "TypeScript",
        level: "strong",
        years: 6,
        readiness: "verified",
        grade: 85,
      },
    ]);
    expect(offers).toMatchObject([{ name: "Kubernetes", grade: 72 }]);
  });

  it("stop offering a skill once it's declared, and never offer it twice", async () => {
    const before = await skills();
    const k8s = before.offers[0];
    await call("career", "/skills", {
      method: "PUT",
      body: { skill: "Kubernetes", level: "familiar" },
    });
    await call("career", "/skills", {
      method: "PUT",
      body: { skill: "kubernetes", level: "familiar" },
    });
    const after = await skills();
    expect(after.offers).toEqual([]);
    expect(after.skills.filter((s) => s.skillId === k8s?.skillId)).toHaveLength(
      1,
    );
    expect(after.skills.find((s) => s.name === "Kubernetes")).toMatchObject({
      readiness: "verified",
      grade: 72,
    });
  });
});
