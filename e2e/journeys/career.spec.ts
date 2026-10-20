import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { sql } from "./stack";

// H-04, journey 2, on the real stack (scripts/e2e-stack.sh): Claude maps a job
// → the owner sends its gap to the Study backlog from the job screen → Claude
// grades the topic's exam → the job's readiness counts it Verified. Career
// reads Study only through the contract, so this crosses both labs for real.
// Claude's writes go through the same /api routes its MCP tools call, except
// the exam, whose recording first checks its files on GitHub (SQL here).
test.use({ serviceWorkers: "block" });

test.beforeEach(() => {
  sql("DELETE FROM auth_attempt");
});

async function logIn(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Passphrase", { exact: true }).fill("projects-lab-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Your two labs")).toBeVisible();
}

/** A write as Claude makes it: the session's route, with an Idempotency-Key. */
async function asClaude(page: Page, path: string, body: unknown) {
  const token = await page.evaluate(() => localStorage.getItem("pl_session"));
  const response = await page.request.post(path, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": randomUUID(),
    },
    data: body,
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function openLab(page: Page, lab: RegExp) {
  await page
    .getByRole("button", { name: /Home|Lab/ })
    .first()
    .click();
  await page
    .getByRole("navigation", { name: "Labs" })
    .getByRole("link", { name: lab })
    .click();
}

test("map a job → its gap lands in Study → readiness updates", async ({
  page,
}, info) => {
  // Unique per width and run: the stack's database lives for the whole run.
  const run = `${info.project.name}-${info.repeatEachIndex}`;
  const role = `Platform Engineer ${run}`;
  const kubernetes = `Kubernetes ${run}`;
  const terraform = `Terraform ${run}`;

  await logIn(page);

  // Claude maps a pasted posting (career_add_job): two required skills, both
  // gaps on an empty profile and backlog.
  const { job } = await asClaude(page, "/api/career/jobs", {
    company: "Acme",
    role,
    language: "en",
    posting: "Acme needs a platform engineer.",
    requirements: [
      { text: kubernetes, type: "required", skill: kubernetes },
      { text: terraform, type: "required", skill: terraform },
      { text: "5+ years", type: "not_mapped" },
    ],
    fit: { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 },
  });

  // The owner finds it in Career → Jobs.
  await openLab(page, /Career Lab/);
  await expect(page).toHaveURL(/\/career$/);
  const listed = page.getByRole("link", { name: new RegExp(role) });
  await expect(listed).toContainText("0/2");
  await listed.click();
  await expect(page).toHaveURL(new RegExp(`/career/jobs/${job.id}$`));
  const meter = (verified: number, gaps: number) =>
    page.getByRole("img", {
      name: `${verified} verified, 0 declared, ${gaps} ${gaps === 1 ? "gap" : "gaps"} out of 2 required skills`,
    });
  await expect(meter(0, 2)).toBeVisible();

  // Sends the Kubernetes gap to Study (career_send_gaps → ensureTopics).
  const kube = page.getByRole("listitem").filter({ hasText: kubernetes });
  await kube.getByRole("button", { name: "Add to Study backlog" }).click();
  const sheet = page.getByRole("dialog", {
    name: `Add ${kubernetes} to Study`,
  });
  await sheet.getByLabel("Area").selectOption("DO");
  await sheet.getByRole("button", { name: "Add to Study backlog" }).click();
  await expect(sheet).toBeHidden();
  const where = kube.getByText(/Already in your backlog as DO-\d+/);
  await expect(where).toBeVisible();
  const code = /DO-\d+/.exec(await where.innerText())?.[0] ?? "";
  await expect(meter(0, 2)).toBeVisible(); // in the backlog isn't ready yet

  // It's in the Study backlog, not started, under DevOps and Cloud.
  await kube.getByRole("link", { name: `${code} ${kubernetes}` }).click();
  await expect(page).toHaveURL(/\/study$/);
  const row = page
    .getByRole("region", { name: "DevOps and Cloud" })
    .getByRole("button", { name: new RegExp(`${code}.*${kubernetes}`) });
  await expect(
    row.getByText("Not started").locator("visible=true"),
  ).toBeVisible();

  // Claude records the exam (SQL: study_record_exam checks its files on
  // GitHub), then grades it 8.5 (study_record_grade, the real route).
  const base = `Study Lab/devops/k8s-${run}/k8s-${run}__fast-track__exam-1`;
  sql(
    `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at)
       SELECT 'exam-${run}', id, 'fast_track', 1, '${base}.md', '${base}.pdf', '${new Date().toISOString()}'
       FROM learn_topic WHERE code = '${code}'`,
  );
  await asClaude(page, "/api/study/grades", {
    topicId: code,
    level: "fast_track",
    attempt: 1,
    grade: 85,
  });

  // Study shows it Done; the job now counts it Verified, read through the
  // contract (never stored): 1 of 2 ready.
  await page.reload();
  await expect(row.getByText("Done").locator("visible=true")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/career/jobs/${job.id}$`));
  await expect(meter(1, 1)).toBeVisible();
  await expect(kube).toContainText(`Passed ${code} ${kubernetes} · 8.5`);
  await expect(
    page.getByRole("listitem").filter({ hasText: terraform }),
  ).toContainText("Not in your profile or backlog");

  // And the Jobs list counts it: 1 of 2 required ready.
  await page.goBack();
  await expect(page).toHaveURL(/\/career$/);
  await expect(listed).toContainText("1/2");
});
