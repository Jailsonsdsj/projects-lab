import { API_CACHE, generateSalt } from "@projects-lab/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApi as api, json } from "../../test/api";
import { fakeToken } from "../../test/session";
import { createRoutes, LABS } from "../app";
import { apiFetch } from "./api";
import type { LabDefinition } from "./lab-registry";
import { ReadView } from "./ReadView";
import { endSession, sessionToken, startSession } from "./session";

// Core never imports a lab, tests included: take paths from the registry.
const studyLab = LABS.find((lab) => lab.id === "study") as LabDefinition;
const studyRoot = studyLab.tabs[0]?.path ?? "";

// A low iteration count keeps the real KDF fast in tests.
const SALT = { salt: generateSalt(), iterations: 1000 };

function renderAt(path: string, screenAt?: { path: string; node: ReactNode }) {
  const labs = screenAt
    ? LABS.map((lab) => ({
        ...lab,
        tabs: lab.tabs.map((tab) =>
          tab.path === screenAt.path ? { ...tab, screen: screenAt.node } : tab,
        ),
      }))
    : LABS;
  const router = createMemoryRouter(createRoutes(labs), {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const signedOut = async () => {
  localStorage.clear();
  await endSession("invalid");
};

let deleteCache: ReturnType<typeof vi.fn>;

beforeEach(() => {
  deleteCache = vi.fn(async () => true);
  vi.stubGlobal("caches", { delete: deleteCache });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

/** A screen that reads /api, as a lab's screens will. */
const reader = (
  <ReadView
    load={() => apiFetch("/api/study/backlog").then((r) => r.json())}
    empty={<p>Nothing here yet</p>}
  >
    {(data: { title: string }) => <p>{data.title}</p>}
  </ReadView>
);

describe("an ended session", () => {
  it("expired while the app was closed: lands on /login with the expiry message", async () => {
    startSession(fakeToken({ expiresInSeconds: -60 }));
    const router = renderAt(studyRoot);
    expect(router.state.location.pathname).toBe("/login");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session expired.",
    );
    await waitFor(() => expect(sessionToken()).toBeNull());
    expect(deleteCache).toHaveBeenCalledWith(API_CACHE);
  });

  it("expired during use: the next 401 lands on /login with the message, never a raw 401", async () => {
    const realNow = Date.now();
    let now = realNow;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    startSession(fakeToken({ expiresInSeconds: 60 }));
    api({
      "GET /api/study/backlog": () => {
        now = realNow + 120_000; // the token's exp has passed
        return json({ error: "unauthorized" }, { status: 401 });
      },
    });
    const router = renderAt(studyRoot, { path: studyRoot, node: reader });

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    // The URL changes a moment before the login screen renders: wait for it.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session expired. Sign in again to pick up where you left off.",
    );
    expect(document.body).not.toHaveTextContent(/401|unauthorized/i);
    expect(sessionToken()).toBeNull();
    expect(deleteCache).toHaveBeenCalledWith(API_CACHE);
  });

  it("ended for another reason (a 401 before exp): /login without the expiry message", async () => {
    api({
      "GET /api/study/backlog": () =>
        json({ error: "unauthorized" }, { status: 401 }),
    });
    const router = renderAt(studyRoot, { path: studyRoot, node: reader });
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    await screen.findByRole("heading", { name: "Projects Lab" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body).not.toHaveTextContent(/401|unauthorized/i);
  });

  it("sends the session as a Bearer token", async () => {
    const token = sessionToken();
    const fetchMock = api({
      "GET /api/study/backlog": () => json({ title: "FE-01" }),
    });
    renderAt(studyRoot, { path: studyRoot, node: reader });
    expect(await screen.findByText("FE-01")).toBeInTheDocument();
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
  });
});

describe("login", () => {
  async function typeAndSubmit(passphrase = "correct horse battery") {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Passphrase"), passphrase);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    return user;
  }

  it("signs in and returns to the screen the owner was going to", async () => {
    await signedOut();
    const token = fakeToken();
    const fetchMock = api({
      "GET /api/auth/salt": () => json(SALT),
      "POST /api/auth/login": () => json({ token }),
    });
    const router = renderAt("/study/grades");
    expect(router.state.location.pathname).toBe("/login");

    await typeAndSubmit("correct horse battery");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/study/grades"),
    );
    expect(sessionToken()).toBe(token);
    // The passphrase never leaves the device; only the derived key does.
    const sent = fetchMock.mock.calls.map(([, init]) => String(init?.body));
    expect(sent.join(" ")).not.toContain("correct horse battery");
    expect(sent.join(" ")).toContain("authKey");
  });

  it("says a wrong passphrase is wrong, keeps what was typed and stays", async () => {
    await signedOut();
    api({
      "GET /api/auth/salt": () => json(SALT),
      "POST /api/auth/login": () =>
        json({ error: "invalid_passphrase" }, { status: 401 }),
    });
    const router = renderAt("/");
    await typeAndSubmit("not it at all");
    const field = screen.getByLabelText("Passphrase");
    await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
    expect(field).toHaveAccessibleDescription("Wrong passphrase");
    expect(field).toHaveValue("not it at all");
    expect(router.state.location.pathname).toBe("/login");
  });

  it("locks the form for the server's window after too many attempts", async () => {
    await signedOut();
    api({
      "GET /api/auth/salt": () => json(SALT),
      "POST /api/auth/login": () =>
        json(
          { error: "too_many_attempts" },
          { status: 429, headers: { "Retry-After": "700" } },
        ),
    });
    renderAt("/");
    await typeAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts, try again in 12 minutes.",
    );
    expect(screen.getByLabelText("Passphrase")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });

  it("shows signing in while the key is derived and sent", async () => {
    await signedOut();
    let answer: (response: Response) => void = () => {};
    api({
      "GET /api/auth/salt": () => json(SALT),
      "POST /api/auth/login": () =>
        new Promise<Response>((resolve) => (answer = resolve)),
    });
    renderAt("/");
    await typeAndSubmit();
    const button = await screen.findByRole("button", { name: "Signing in" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Passphrase")).toBeDisabled();
    answer(json({ token: fakeToken() }));
    await waitFor(() => expect(sessionToken()).not.toBeNull());
  });

  it("names the fix when no owner exists, and says offline when offline", async () => {
    await signedOut();
    api({
      "GET /api/auth/salt": () =>
        json({ error: "not_provisioned" }, { status: 404 }),
    });
    renderAt("/");
    await typeAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No owner yet. Run pnpm provision to create one.",
    );

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're offline. Signing in needs a connection.",
    );
  });

  it("sends a signed-in owner straight on from /login", () => {
    const router = renderAt("/login");
    expect(router.state.location.pathname).toBe("/");
  });
});
