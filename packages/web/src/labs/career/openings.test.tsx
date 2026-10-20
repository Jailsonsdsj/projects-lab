import type { Opening, SearchCriteria } from "@projects-lab/shared/career";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const opening = (id: string, over: Partial<Opening> = {}): Opening => ({
  id,
  url: `https://jobs.example/${id}`,
  company: `Company ${id}`,
  role: "AI Engineer",
  lane: "AI engineering",
  posting: "We need evals.",
  postedOn: null,
  rateText: "USD 50/h",
  why: "Evals-heavy, async",
  status: "new",
  jobId: null,
  stale: false,
  createdAt: new Date().toISOString(),
  ...over,
});

function open(path: string) {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Jobs views", () => {
  it("keeps the view in the URL", async () => {
    mockApi({
      "GET /api/career/jobs": () => json({ jobs: [] }),
      "GET /api/career/openings": () => json({ openings: [] }),
    });
    const router = open("/career");
    await screen.findByText("No jobs tracked yet");
    await userEvent.click(screen.getByRole("tab", { name: "Openings" }));
    expect(router.state.location.search).toBe("?view=openings");
    expect(await screen.findByText("No openings yet")).toBeInTheDocument();
  });
});

describe("Openings", () => {
  it("lists what the search saved, stale ones marked, and pages with Show more", async () => {
    mockApi({
      "GET /api/career/openings": () =>
        json({
          openings: [
            opening("o1", { postedOn: "2026-10-15" }),
            opening("o2", { stale: true, rateText: "" }),
          ],
          nextCursor: "0|t|o2",
        }),
      "GET /api/career/openings?cursor=0%7Ct%7Co2": () =>
        json({ openings: [opening("o3", { status: "dismissed" })] }),
    });
    open("/career?view=openings");
    const group = await screen.findByRole("region", { name: "Openings" });
    let rows = within(group).getAllByRole("button");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(
      /AI engineering · USD 50\/h · posted \d+ days ago/,
    );
    expect(rows[1]).toHaveTextContent("Rate not posted");
    expect(
      within(rows[1] as HTMLElement).getAllByText("Stale").length,
    ).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Show more" }));
    await vi.waitFor(() =>
      expect(within(group).getAllByRole("button")).toHaveLength(3),
    );
    rows = within(group).getAllByRole("button");
    expect(
      within(rows[2] as HTMLElement).getAllByText("Dismissed").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
  });

  it("keeps an opening, then reads again", async () => {
    let reads = 0;
    let body: unknown = null;
    mockApi({
      "GET /api/career/openings": () => {
        reads++;
        return json({ openings: [opening("o1")] });
      },
      "PATCH /api/career/openings/o1": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ opening: opening("o1", { status: "kept" }) });
      },
    });
    open("/career?view=openings");
    await userEvent.click(
      await screen.findByRole("button", { name: /Company o1/ }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "AI Engineer · Company o1",
    });
    expect(
      within(sheet).getByRole("link", { name: "https://jobs.example/o1" }),
    ).toHaveAttribute("target", "_blank");
    await userEvent.click(within(sheet).getByRole("button", { name: "Keep" }));
    expect(await screen.findByText("Kept")).toBeInTheDocument();
    expect(body).toEqual({ status: "kept" });
    await vi.waitFor(() => expect(reads).toBe(2));
  });

  it("copies a prompt for Claude to track it", async () => {
    mockApi({
      "GET /api/career/openings": () => json({ openings: [opening("o1")] }),
    });
    open("/career?view=openings");
    await userEvent.click(
      await screen.findByRole("button", { name: /Company o1/ }),
    );
    const sheet = await screen.findByRole("dialog");
    await act(async () =>
      fireEvent.click(within(sheet).getByRole("button", { name: "Track" })),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("career_add_job (openingId o1)"),
    );
    expect(
      await screen.findByText("Prompt copied: paste it to Claude to track it"),
    ).toBeInTheDocument();
  });

  it("has no actions for a tracked opening", async () => {
    mockApi({
      "GET /api/career/openings": () =>
        json({ openings: [opening("o1", { status: "tracked", jobId: "j1" })] }),
    });
    open("/career?view=openings");
    await userEvent.click(
      await screen.findByRole("button", { name: /Company o1/ }),
    );
    const sheet = await screen.findByRole("dialog");
    expect(
      within(sheet).getByText("Tracked as a job: it follows that job now."),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole("button", { name: "Keep" }),
    ).not.toBeInTheDocument();
    expect(
      within(sheet).queryByRole("button", { name: "Track" }),
    ).not.toBeInTheDocument();
  });
});

const CRITERIA: SearchCriteria = {
  queries: ['"AI engineer" contract remote'],
  lanes: ["AI engineering", "Front-end (fallback)"],
  shapes: ["contract"],
  maxHours: 20,
  timezoneNote: "UTC−3",
  rateFloor: { amount: 35, currency: "USD", period: "hour" },
  autoReject: ["crypto"],
  maxAgeDays: 14,
  sources: ["RemoteOK"],
  updatedAt: "2026-10-19T10:00:00.000Z",
};

describe("Search criteria", () => {
  it("starts empty, checks before sending, and saves the whole form", async () => {
    let body: unknown = null;
    mockApi({
      "GET /api/career/search-criteria": () => json({ criteria: null }),
      "PUT /api/career/search-criteria": (init) => {
        body = JSON.parse(String(init?.body));
        return json({
          criteria: {
            ...(body as object),
            updatedAt: "2026-10-20T00:00:00.000Z",
          },
        });
      },
    });
    open("/career?view=criteria");
    expect(await screen.findByText(/Not saved yet/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Save criteria" }),
    );
    expect(screen.getByText("At least one lane.")).toBeInTheDocument();
    expect(
      screen.getByText("Whole hours a week, e.g. 20."),
    ).toBeInTheDocument();
    expect(body).toBeNull();

    await userEvent.type(
      screen.getByLabelText("Lanes"),
      "AI engineering{enter}AI evaluation",
    );
    await userEvent.type(screen.getByLabelText("Max hours a week"), "20");
    await userEvent.type(screen.getByLabelText("Max posting age (days)"), "14");
    await userEvent.type(
      screen.getByLabelText(/Auto-reject/),
      "crypto{enter}{enter} gambling ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Save criteria" }),
    );
    expect(
      await screen.findByText("Search criteria saved"),
    ).toBeInTheDocument();
    expect(body).toEqual({
      queries: [],
      lanes: ["AI engineering", "AI evaluation"],
      shapes: [],
      maxHours: 20,
      timezoneNote: "",
      rateFloor: null,
      autoReject: ["crypto", "gambling"],
      maxAgeDays: 14,
      sources: [],
    });
    expect(screen.getByText(/Last saved 2026-10-20/)).toBeInTheDocument();
  });

  it("fills in what's saved, and shows the API's refusal", async () => {
    mockApi({
      "GET /api/career/search-criteria": () => json({ criteria: CRITERIA }),
      "PUT /api/career/search-criteria": () =>
        json(
          { error: "bad_request", message: "lanes: A value twice" },
          { status: 400 },
        ),
    });
    open("/career?view=criteria");
    expect(await screen.findByLabelText("Lanes")).toHaveValue(
      "AI engineering\nFront-end (fallback)",
    );
    expect(screen.getByLabelText(/Rate floor/)).toHaveValue("35");
    await userEvent.click(
      screen.getByRole("button", { name: "Save criteria" }),
    );
    expect(await screen.findByText("lanes: A value twice")).toBeInTheDocument();
  });
});
