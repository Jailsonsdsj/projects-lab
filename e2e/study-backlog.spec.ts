import { expect, test } from "./signed-in";

// The study backlog (ST-06a) in WebKit at every width, against a mocked API:
// groups in area order, rows in the API's order, the status filter, the empty
// area, and no horizontal scroll. Service workers are blocked so page.route
// sees every request.
test.use({ serviceWorkers: "block" });

const topic = (
  id: string,
  skill: string,
  over: Record<string, unknown> = {},
) => ({
  id,
  skill,
  skillId: `sk-${id}`,
  area: id.slice(0, 2),
  level: "essential",
  priority: 2,
  status: "not_started",
  grade: null,
  startedOn: null,
  finishedOn: null,
  note: "",
  ...over,
});

const BACKLOG = {
  areas: [
    { prefix: "CS", name: "CS Fundamentals", position: 1 },
    { prefix: "FE", name: "Frontend", position: 2 },
    { prefix: "SE", name: "Security", position: 7 },
  ],
  topics: [
    topic("CS-02", "Graphs", { status: "in_progress", priority: 1 }),
    topic("CS-01", "Big-O notation", { level: "fast_track" }),
    topic("FE-01", "Transactions and isolation levels in a long skill name", {
      priority: 1,
    }),
    topic("FE-02", "React", {
      status: "done",
      grade: 85,
      level: "specialized",
    }),
  ],
};

test("shows the backlog grouped by area and filters it", async ({ page }) => {
  await page.route("**/api/study/backlog", (route) =>
    route.fulfill({ json: BACKLOG }),
  );
  await page.goto("/study");

  const frontend = page.getByRole("region", { name: "Frontend" });
  await expect(frontend.locator(".row__id")).toHaveText(["FE-01", "FE-02"]);
  await expect(
    page.getByRole("region", { name: "CS Fundamentals" }).locator(".row__id"),
  ).toHaveText(["CS-02", "CS-01"]);
  await expect(page.getByRole("region", { name: "Security" })).toContainText(
    "No topics yet",
  );
  await expect(
    page.getByText("4 topics · 1 in progress · avg grade 8.5"),
  ).toBeVisible();
  await expect(frontend.locator(".row__value")).toHaveText(["8.5"]);
  // One copy of each badge is visible at any width (meta line or its column).
  await expect(
    frontend.getByText("Done", { exact: true }).locator("visible=true"),
  ).toHaveCount(1);

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  await page.getByRole("tab", { name: "Done 1" }).click();
  await expect(page.getByRole("region")).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Frontend" }).locator(".row__id"),
  ).toHaveText(["FE-02"]);

  await page.getByRole("tab", { name: "All 4" }).click();
  await page.getByRole("searchbox", { name: "Search backlog" }).fill("graph");
  await expect(page.getByRole("status")).toContainText("1 of 4 matches");
  await expect(page.locator(".row__id")).toHaveText(["CS-02"]);
});

test("tells an empty backlog from a failed read", async ({ page }) => {
  let failing = false;
  await page.route("**/api/study/backlog", (route) =>
    failing
      ? route.fulfill({ status: 500, json: { error: "internal" } })
      : route.fulfill({ json: { areas: BACKLOG.areas, topics: [] } }),
  );
  await page.goto("/study");
  await expect(page.getByText("No topics yet")).toBeVisible();

  failing = true;
  await page.reload();
  await expect(page.getByText("Couldn't load this")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("edits a topic in its sheet and shows the change", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/study/backlog", (route) =>
    route.fulfill({
      json: saved
        ? {
            ...BACKLOG,
            topics: BACKLOG.topics.map((t) =>
              t.id === "CS-01" ? { ...t, ...saved } : t,
            ),
          }
        : BACKLOG,
    }),
  );
  await page.route("**/api/study/topics/CS-01", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { topic: {} } });
  });
  await page.goto("/study");
  await page.getByRole("button", { name: /CS-01.*Big-O notation/ }).click();

  const sheet = page.getByRole("dialog", { name: "CS-01 · Big-O notation" });
  await expect(sheet).toBeVisible();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  await sheet.getByLabel("Status").selectOption("in_progress");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("CS-01 saved")).toBeVisible();
  expect(saved).toEqual({ status: "in_progress" });
  await expect(sheet).toBeHidden();
  const row = page.getByRole("button", { name: /CS-01.*Big-O notation/ });
  await expect(
    row.getByText("In progress").locator("visible=true"),
  ).toHaveCount(1);
});

test("adds a topic from the Add sheet", async ({ page }) => {
  let added = false;
  const graphs = topic("CS-03", "Heaps");
  await page.route("**/api/study/backlog", (route) =>
    route.fulfill({
      json: added
        ? { ...BACKLOG, topics: [...BACKLOG.topics, graphs] }
        : BACKLOG,
    }),
  );
  await page.route("**/api/skills?**", (route) =>
    route.fulfill({ json: { skill: null } }),
  );
  await page.route("**/api/study/topics", async (route) => {
    expect(route.request().headers()["idempotency-key"]).toBeTruthy();
    expect(route.request().postDataJSON()).toEqual({
      topics: [{ skill: "Heaps", area: "CS", priority: 2 }],
    });
    added = true;
    await route.fulfill({
      json: { topics: [{ topic: graphs, created: true, restored: false }] },
    });
  });
  await page.goto("/study");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const sheet = page.getByRole("dialog", { name: "Add a topic" });
  await sheet.getByLabel("Skill").fill("Heaps");
  await expect(sheet.getByText("A new skill.")).toBeVisible();
  await sheet.getByLabel("Area").selectOption("CS");
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  await sheet.getByRole("button", { name: "Add to backlog" }).click();

  await expect(page.getByText("Added CS-03 · Heaps")).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("region", { name: "CS Fundamentals" }).locator(".row__id"),
  ).toContainText(["CS-03"]);
});

test("shows a taken prefix under Prefix in the Add sheet", async ({ page }) => {
  await page.route("**/api/study/backlog", (route) =>
    route.fulfill({ json: BACKLOG }),
  );
  await page.route("**/api/skills?**", (route) =>
    route.fulfill({ json: { skill: null } }),
  );
  await page.goto("/study");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Add a topic" });
  await sheet.getByLabel("Skill").fill("Swift");
  await sheet.getByLabel("Area").selectOption("+new");
  await sheet.getByLabel("Area name").fill("Mobile");
  await sheet.getByLabel("Prefix").fill("fe");
  await expect(
    sheet.getByText("FE is already an area's prefix."),
  ).toBeVisible();
});
