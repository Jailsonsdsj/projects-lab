import { expect, test } from "./signed-in";

// The Skills tab (CA-10) in WebKit at every width, against a mocked API that
// keeps what's declared: skills by level with their readiness, and an offer
// from Study declared once, then gone. Service workers are blocked so
// page.route sees every request.
test.use({ serviceWorkers: "block" });

test("declares an offered skill once; it moves to its level", async ({
  page,
}) => {
  type Skill = {
    skillId: string;
    name: string;
    level: string;
    years: number | null;
    note: string;
    readiness: string;
    grade: number | null;
  };
  const state: {
    skills: Skill[];
    offers: { skillId: string; name: string; grade: number }[];
  } = {
    skills: [
      {
        skillId: "ts",
        name: "TypeScript",
        level: "strong",
        years: 6,
        note: "",
        readiness: "verified",
        grade: 85,
      },
      {
        skillId: "py",
        name: "Python",
        level: "working",
        years: null,
        note: "",
        readiness: "declared",
        grade: null,
      },
    ],
    offers: [
      {
        skillId: "k8s",
        name: "Kubernetes with a long name to wrap",
        grade: 72,
      },
    ],
  };
  const puts: unknown[] = [];
  await page.route("**/api/career/skills", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as {
        skill: string;
        level: string;
      };
      puts.push(body);
      state.skills.push({
        skillId: "k8s",
        name: body.skill,
        level: body.level,
        years: null,
        note: "",
        readiness: "verified",
        grade: 72,
      });
      state.offers = [];
      return route.fulfill({ json: { skill: {} } });
    }
    return route.fulfill({ json: state });
  });
  await page.goto("/career/skills");

  await expect(page.getByRole("region")).toHaveCount(3);
  const strong = page.getByRole("region", { name: "Strong" });
  await expect(
    strong.getByText("Verified", { exact: true }).locator("visible=true"),
  ).toHaveCount(1);
  const offers = page.getByRole("region", {
    name: "Verified in Study, not declared",
  });
  await offers.getByRole("button", { name: /Kubernetes/ }).click();
  const sheet = page.getByRole("dialog", { name: /Declare Kubernetes/ });
  await sheet.getByLabel("Level").selectOption("familiar");
  await sheet.getByRole("button", { name: "Declare" }).click();
  await expect(sheet).toBeHidden();
  await expect(offers).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Familiar" }).getByText(/Kubernetes/),
  ).toBeVisible();
  expect(puts).toHaveLength(1);

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test("tells no skills from a failed read", async ({ page }) => {
  await page.route("**/api/career/skills", (route) =>
    route.fulfill({ json: { skills: [], offers: [] } }),
  );
  await page.goto("/career/skills");
  await expect(page.getByText("No skills yet")).toBeVisible();
  await page.unroute("**/api/career/skills");
  await page.route("**/api/career/skills", (route) =>
    route.fulfill({ status: 500, json: { error: "internal" } }),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByText("No skills yet")).toHaveCount(0);
});
