import type {
  JobKit,
  JobSummary,
  ProfileResponse,
} from "@projects-lab/shared/career";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const PROFILE: ProfileResponse = {
  person: {
    fullName: "Sam Rivera",
    headline: "AI engineer",
    location: "Recife",
    timezone: "America/Recife",
    email: "sam.rivera@example.com",
    phone: "",
    summary: "",
    languages: [{ name: "English", level: "C1" }],
    photo: null,
    updatedAt: "2026-10-20T00:00:00.000Z",
  },
  links: [
    {
      id: "l1",
      kind: "linkedin",
      label: "LinkedIn URL",
      url: "https://www.linkedin.com/in/sam-rivera",
      position: 0,
    },
  ],
  experiences: [],
  education: [],
  facts: [],
  skills: [],
};

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
  job("acme", "Acme", "Senior Full-Stack Engineer"),
  job("globex", "Globex", "Frontend Platform Engineer"),
];
const kit = (jobId: string, over: Partial<JobKit> = {}): JobKit => ({
  jobId,
  intro: "",
  salary: null,
  answers: [],
  selection: null,
  ...over,
});
const KITS = {
  acme: kit("acme", {
    intro: "I build evals that ship.",
    salary: { min: 40, max: 60, currency: "USD", period: "hour" },
    answers: [
      { question: "Why this company?", answer: "Acme builds the tools…" },
    ],
  }),
  globex: kit("globex"),
};

function api(over: Record<string, () => Response> = {}) {
  return mockApi({
    "GET /api/career/profile": () => json(PROFILE),
    "GET /api/career/standard-answers": () =>
      json({ answers: [{ label: "Notice period", value: "30 days" }] }),
    "GET /api/career/jobs": () => json({ jobs: JOBS }),
    "GET /api/career/jobs/acme/kit": () => json({ kit: KITS.acme }),
    "GET /api/career/jobs/globex/kit": () => json({ kit: KITS.globex }),
    ...over,
  });
}

function openProfile() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/career/profile"],
  });
  render(<RouterProvider router={router} />);
}

const labels = () =>
  [...document.querySelectorAll(".copy__label")].map((el) => el.textContent);

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

describe("Profile copy panel", () => {
  it("lists the standard fields in order, empty ones left out, then the job's answers", async () => {
    api();
    openProfile();
    await screen.findByRole("button", { name: "Copy name" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Profile" }),
    ).toBeVisible();
    expect(labels()).toEqual([
      "Name",
      "Email",
      "LinkedIn URL",
      "Notice period",
      "Tell me about yourself",
      "Salary range",
      "Why this company?",
    ]);
    expect(screen.getByText("USD 40–60 / hour")).toBeInTheDocument();
    expect(
      screen.getByText("https://www.linkedin.com/in/sam-rivera"),
    ).toHaveClass("mono");
    // No photo: initials.
    expect(screen.getByRole("img", { name: "Sam Rivera" })).toHaveTextContent(
      "SR",
    );
  });

  it("switches jobs without asking the network again", async () => {
    const fetch = api();
    openProfile();
    const picker = await screen.findByLabelText("Answers for");
    const before = fetch.mock.calls.length;
    await userEvent.selectOptions(picker, "globex");
    expect(screen.queryByText("Why this company?")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "No answers for this job yet: ask Claude to prepare them.",
      ),
    ).toBeInTheDocument();
    await userEvent.selectOptions(picker, "acme");
    expect(screen.getByText("Why this company?")).toBeInTheDocument();
    expect(fetch.mock.calls.length).toBe(before);
  });

  it("copies a value, and shows a toast when the clipboard refuses", async () => {
    api();
    openProfile();
    const button = await screen.findByRole("button", { name: "Copy email" });
    await act(async () => fireEvent.click(button));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "sam.rivera@example.com",
    );
    expect(
      screen.getByRole("button", { name: "Copied email" }),
    ).toBeInTheDocument();

    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
      new Error("denied"),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Copy name" })),
    );
    expect(
      await screen.findByText("Couldn't copy: select the text instead."),
    ).toBeInTheDocument();
  });

  it("loads the photo through the session cookie when there is one", async () => {
    api({
      "GET /api/career/profile": () =>
        json({
          ...PROFILE,
          person: { ...PROFILE.person, photo: { type: "image/png" } },
        }),
    });
    openProfile();
    const img = await screen.findByRole("img", { name: "Sam Rivera" });
    expect(img).toHaveAttribute("src", "/api/career/photo");
  });

  it("hides the job picker with no jobs", async () => {
    api({ "GET /api/career/jobs": () => json({ jobs: [] }) });
    openProfile();
    await screen.findByRole("button", { name: "Copy name" });
    expect(screen.queryByLabelText("Answers for")).not.toBeInTheDocument();
  });

  it("says the profile is empty, and tells a failed read apart", async () => {
    api({
      "GET /api/career/profile": () =>
        json({
          ...PROFILE,
          person: { ...PROFILE.person, updatedAt: null },
          links: [],
        }),
      "GET /api/career/standard-answers": () => json({ answers: [] }),
    });
    openProfile();
    expect(
      await screen.findByText("Your profile is empty"),
    ).toBeInTheDocument();
  });

  it("shows an error with Retry when the read fails", async () => {
    api({
      "GET /api/career/profile": () => new Response(null, { status: 500 }),
    });
    openProfile();
    const main = await screen.findByRole("button", { name: "Retry" });
    expect(
      within(main.closest(".empty") as HTMLElement).getByRole("button"),
    ).toBe(main);
    expect(screen.queryByText("Your profile is empty")).not.toBeInTheDocument();
  });
});
