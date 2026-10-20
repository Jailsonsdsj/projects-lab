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

// CA-11b: Openings and the Search criteria form, inside the Jobs tab.
test("lists openings, keeps one, and copies a Track prompt", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void copied.push(text) },
      configurable: true,
    });
  });
  const openings = [
    {
      id: "o1",
      url: "https://jobs.example/o1",
      company: "Evalco",
      role: "AI Engineer with a long title that wraps on a phone",
      lane: "AI engineering",
      posting: "We need evals.",
      postedOn: null,
      rateText: "USD 50/h",
      why: "Evals-heavy, async",
      status: "new",
      jobId: null,
      stale: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: "o2",
      url: "https://jobs.example/o2",
      company: "Oldco",
      role: "ML Engineer",
      lane: "AI evaluation",
      posting: "Old.",
      postedOn: "2026-08-01",
      rateText: "",
      why: "Close to the lane",
      status: "new",
      jobId: null,
      stale: true,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
  ];
  await page.route("**/api/career/openings", (route) =>
    route.fulfill({ json: { openings } }),
  );
  await page.route("**/api/career/openings/o1", async (route) => {
    const status = (route.request().postDataJSON() as { status: string })
      .status;
    Object.assign(openings[0] as object, { status });
    await route.fulfill({ json: { opening: openings[0] } });
  });
  await page.goto("/career?view=openings");

  const group = page.getByRole("region", { name: "Openings" });
  await expect(group.getByRole("button")).toHaveCount(2);
  await expect(
    group
      .getByRole("button", { name: /Oldco/ })
      .getByText("Stale", { exact: true })
      .locator("visible=true"),
  ).toHaveCount(1);

  await group.getByRole("button", { name: /Evalco/ }).click();
  const sheet = page.getByRole("dialog", { name: /Evalco/ });
  await sheet.getByRole("button", { name: "Track" }).click();
  const copied = await page.evaluate(
    () => (window as unknown as { __copied: string[] }).__copied,
  );
  expect(copied[0]).toContain("career_add_job (openingId o1)");
  await sheet.getByRole("button", { name: "Keep" }).click();
  await expect(sheet).toBeHidden();
  await expect(
    group
      .getByRole("button", { name: /Evalco/ })
      .getByText("Kept", { exact: true })
      .locator("visible=true"),
  ).toHaveCount(1);

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test("saves the search criteria", async ({ page }) => {
  let saved: unknown = null;
  await page.route("**/api/career/search-criteria", async (route) => {
    if (route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      return route.fulfill({
        json: {
          criteria: {
            ...(saved as object),
            updatedAt: "2026-10-20T00:00:00.000Z",
          },
        },
      });
    }
    return route.fulfill({ json: { criteria: null } });
  });
  await page.goto("/career");
  await page.getByRole("tab", { name: "Search criteria" }).click();
  await expect(page).toHaveURL(/view=criteria/);
  await page.getByLabel("Lanes").fill("AI engineering\nAI evaluation");
  await page.getByLabel("Max hours a week").fill("20");
  await page.getByLabel("Max posting age (days)").fill("14");
  await page.getByLabel(/Rate floor/).fill("35");
  await page.getByRole("button", { name: "Save criteria" }).click();
  await expect(page.getByText(/Last saved 2026-10-20/)).toBeVisible();
  expect(saved).toMatchObject({
    lanes: ["AI engineering", "AI evaluation"],
    maxHours: 20,
    maxAgeDays: 14,
    rateFloor: { amount: 35, currency: "USD", period: "hour" },
  });
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
