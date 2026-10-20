import { expect, type Page, test } from "./signed-in";

// The Jobs tab and a Job screen (CA-11a) in WebKit at every width, against a
// mocked API that keeps what's written: the list opens the job, the meter and
// requirements read as the bundle's "Job readiness" (one list on phone, Gaps
// and Ready on tablet), and a gap goes to Study in the chosen area. Service
// workers are blocked so page.route sees every request.
test.use({ serviceWorkers: "block" });

const req = (
  id: string,
  text: string,
  readiness: string,
  study: {
    topicId: string;
    status: string;
    grade: number | null;
  } | null = null,
) => ({
  id,
  text,
  type: "required",
  skillId: `sk-${id}`,
  skill: text,
  position: Number(id.slice(1)),
  readiness,
  study,
});

async function mockJobs(page: Page) {
  const job = {
    id: "acme",
    company: "Acme",
    role: "Senior Full-Stack Engineer",
    status: "evaluated",
    statusAt: "t",
    fit: {
      total: 75,
      decision: "apply",
      scores: { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 },
    },
    readiness: {
      required: { ready: 3, total: 5 },
      nice: { ready: 0, total: 0 },
    },
    nextUp: [],
    silent: false,
    updatedAt: "t",
    seniority: "Senior",
    language: "en",
    workShape: "contract",
    sourceUrl: null,
    posting: "Acme needs a senior full-stack engineer.",
    fitNotes: "",
    requirements: [
      req("r1", "PostgreSQL", "verified", {
        topicId: "DB-01",
        status: "done",
        grade: 85,
      }),
      req("r2", "TypeScript", "declared"),
      req("r3", "React and Next.js", "declared", {
        topicId: "FE-01",
        status: "in_progress",
        grade: null,
      }),
      req("r4", "Algorithms and complexity", "gap", {
        topicId: "CS-01",
        status: "not_started",
        grade: null,
      }),
      req("r5", "Kubernetes", "gap"),
    ],
    notMapped: [],
    events: [{ status: "evaluated", at: "t", note: "" }],
    createdAt: "t",
  };
  const sent: unknown[] = [];
  await page.route("**/api/career/jobs", (route) =>
    route.fulfill({ json: { jobs: [job] } }),
  );
  await page.route("**/api/career/jobs/acme", (route) =>
    route.fulfill({ json: { job } }),
  );
  await page.route("**/api/career/study-areas", (route) =>
    route.fulfill({
      json: {
        areas: [
          { prefix: "CS", name: "CS Fundamentals" },
          { prefix: "DO", name: "DevOps" },
        ],
      },
    }),
  );
  await page.route("**/api/career/jobs/acme/gaps", async (route) => {
    sent.push(route.request().postDataJSON());
    const kube = job.requirements.find((r) => r.id === "r5");
    if (kube)
      kube.study = { topicId: "DO-02", status: "not_started", grade: null };
    await route.fulfill({
      json: {
        gaps: [
          {
            requirementId: "r5",
            skill: "Kubernetes",
            topicId: "DO-02",
            created: true,
          },
        ],
      },
    });
  });
  return { sent };
}

test("opens a job from the list and adds a gap to Study", async ({
  page,
}, testInfo) => {
  const { sent } = await mockJobs(page);
  await page.goto("/career");
  await page.getByRole("link", { name: /Senior Full-Stack Engineer/ }).click();
  await expect(page).toHaveURL(/\/career\/jobs\/acme$/);

  await expect(
    page.getByRole("heading", { level: 1, name: "Senior Full-Stack Engineer" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "1 verified, 2 declared, 2 gaps out of 5 required skills",
    }),
  ).toBeVisible();

  const phone = testInfo.project.name === "phone";
  if (phone) {
    await expect(
      page.getByRole("region", { name: "Requirements" }).locator(".req__name"),
    ).toHaveText([
      "Algorithms and complexity",
      "Kubernetes",
      "TypeScript",
      "React and Next.js",
      "PostgreSQL",
    ]);
  } else {
    await expect(
      page.getByRole("region", { name: "Gaps" }).locator(".treq__name"),
    ).toHaveText(["Algorithms and complexity", "Kubernetes"]);
    await expect(
      page.getByRole("region", { name: "Ready" }).locator(".treq__name"),
    ).toHaveText(["PostgreSQL", "TypeScript", "React and Next.js"]);
  }

  const kube = page.getByRole("listitem").filter({ hasText: "Kubernetes" });
  await kube.getByRole("button", { name: "Add to Study backlog" }).click();
  const sheet = page.getByRole("dialog", { name: "Add Kubernetes to Study" });
  await sheet.getByLabel("Area").selectOption("DO");
  await sheet.getByRole("button", { name: "Add to Study backlog" }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page
      .getByText("Added to Study backlog as DO-02 Kubernetes")
      .locator("visible=true"),
  ).toHaveCount(1);
  await expect(kube).toContainText(
    "Already in your backlog as DO-02 Kubernetes",
  );
  await expect(
    kube.getByRole("button", { name: "Add to Study backlog" }),
  ).toHaveCount(0);
  expect(sent).toEqual([
    { gaps: [{ requirementId: "r5", area: "DO", priority: 2 }] },
  ]);

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
