import type { JobKit, JobSummary } from "@projects-lab/shared/career";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const job = (id: string, company: string, role: string): JobSummary => ({
  id,
  company,
  role,
  status: "evaluated",
  statusAt: "t",
  fit: null,
  readiness: { required: { ready: 0, total: 0 }, nice: { ready: 0, total: 0 } },
  nextUp: [],
  silent: false,
  updatedAt: "t",
});
const JOBS = [
  job("acme", "Acme", "AI Engineer"),
  job("globex", "Globex", "Frontend Engineer"),
];
const KITS: Record<string, JobKit> = {
  acme: {
    jobId: "acme",
    intro: "I build evals that ship.",
    salary: { min: 40, max: 60, currency: "USD", period: "hour" },
    answers: [{ question: "Why us?", answer: "Your eval problem." }],
    selection: {
      variant: "ai",
      items: [
        { kind: "fact", id: "f1", label: "Built the eval harness" },
        { kind: "experience", id: "x1", label: "Engineer · Acme" },
      ],
    },
  },
  globex: {
    jobId: "globex",
    intro: "",
    salary: null,
    answers: [],
    selection: null,
  },
};

function api(over: Record<string, (init?: RequestInit) => Response> = {}) {
  return mockApi({
    "GET /api/career/jobs": () => json({ jobs: JOBS }),
    "GET /api/career/jobs/acme/kit": () => json({ kit: KITS.acme }),
    "GET /api/career/jobs/globex/kit": () => json({ kit: KITS.globex }),
    ...over,
  });
}
function open(path = "/career/documents") {
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

describe("Documents", () => {
  it("shows the first job's kit and what its last document used", async () => {
    api();
    open();
    const kit = await screen.findByRole("region", { name: "Application kit" });
    expect(kit).toHaveTextContent("I build evals that ship.");
    expect(kit).toHaveTextContent("USD 40–60 / hour");
    expect(kit).toHaveTextContent("Why us?Your eval problem.");
    const used = screen.getByRole("region", {
      name: "Last document used · ai",
    });
    expect(used).toHaveTextContent("Built the eval harnessFact");
    expect(used).toHaveTextContent("Engineer · AcmeExperience");
  });

  it("copies a prompt that names the job and the brief", async () => {
    api();
    open();
    const resume = await screen.findByRole("button", {
      name: "Copy resume prompt",
    });
    await act(async () => fireEvent.click(resume));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringMatching(
        /AI Engineer at Acme: call career_document_brief with jobId acme and kind resume/,
      ),
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: "Copy cover letter prompt" }),
      ),
    );
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
      expect.stringContaining("kind cover_letter"),
    );
  });

  it("switches jobs from the picker, kept in the URL", async () => {
    const fetch = api();
    const router = open();
    const picker = await screen.findByLabelText("Job");
    const before = fetch.mock.calls.length;
    await userEvent.selectOptions(picker, "globex");
    expect(router.state.location.search).toBe("?job=globex");
    expect(
      screen.getByText("No document made for this job yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Application kit" }),
    ).toHaveTextContent("Not set");
    expect(fetch.mock.calls.length).toBe(before);
  });

  it("edits the kit: whole amounts, min not above max, answers added", async () => {
    let body: unknown = null;
    let reads = 0;
    api({
      "GET /api/career/jobs/globex/kit": () => {
        reads++;
        return json({ kit: KITS.globex });
      },
      "PUT /api/career/jobs/globex/kit": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ kit: KITS.globex });
      },
    });
    open("/career/documents?job=globex");
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit kit" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Kit for Globex" });
    await userEvent.type(within(sheet).getByLabelText(/Minimum/), "9000");
    await userEvent.type(within(sheet).getByLabelText(/Maximum/), "7000");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(
      within(sheet).getByText("The minimum is above the maximum."),
    ).toBeInTheDocument();
    expect(body).toBeNull();

    await userEvent.clear(within(sheet).getByLabelText(/Maximum/));
    await userEvent.type(within(sheet).getByLabelText(/Maximum/), "12000");
    await userEvent.selectOptions(within(sheet).getByLabelText("Per"), "month");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Add a form answer" }),
    );
    // An empty answer row isn't sent.
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(within(sheet).getByText("The form's question.")).toBeInTheDocument();
    expect(body).toBeNull();
    const answer = within(sheet).getByRole("group", { name: "Form answer 1" });
    await userEvent.type(
      within(answer).getByLabelText("Question"),
      "Why Globex?",
    );
    await userEvent.type(
      within(answer).getByLabelText("Answer"),
      "Your frontend platform.",
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(body).toEqual({
      intro: "",
      salary: { min: 9000, max: 12000, currency: "USD", period: "month" },
      answers: [{ question: "Why Globex?", answer: "Your frontend platform." }],
    });
    // The kit is read again after the save.
    await vi.waitFor(() => expect(reads).toBe(2));
  });

  it("clears the salary range when both amounts are emptied", async () => {
    let body: { salary?: unknown } | null = null;
    api({
      "PUT /api/career/jobs/acme/kit": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ kit: KITS.acme });
      },
    });
    open();
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit kit" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Kit for Acme" });
    await userEvent.clear(within(sheet).getByLabelText(/Minimum/));
    await userEvent.clear(within(sheet).getByLabelText(/Maximum/));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect((body as unknown as { salary: unknown }).salary).toBeNull();
  });

  it("says documents need a job first", async () => {
    mockApi({ "GET /api/career/jobs": () => json({ jobs: [] }) });
    open();
    expect(
      await screen.findByText("No jobs to write for yet"),
    ).toBeInTheDocument();
  });
});
