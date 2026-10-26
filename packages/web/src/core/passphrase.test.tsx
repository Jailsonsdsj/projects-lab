import { generateSalt, IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionCalls, json, mockApi, NO_BACKUP } from "../../test/api";
import { fakeToken } from "../../test/session";
import { createRoutes } from "../app";
import { sessionToken } from "./session";

// The current key is derived with the mocked salt's low cost; the new one with
// the real KDF_ITERATIONS, as in the app.
const SALT = { salt: generateSalt(), iterations: 1000 };
const CURRENT = "the old passphrase";
const NEXT = "lantern river copper";

beforeEach(() => {
  vi.stubGlobal("caches", { delete: vi.fn(async () => true) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

function openSettings() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/settings"],
  });
  render(<RouterProvider router={router} />);
  return router;
}

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  {
    current = CURRENT,
    next = NEXT,
    confirm,
  }: { current?: string; next?: string; confirm?: string } = {},
) {
  confirm ??= next;
  // The fields open from the card's title.
  const title = await screen.findByRole("button", {
    name: "Change passphrase",
  });
  if (title.getAttribute("aria-expanded") === "false") await user.click(title);
  if (current)
    await user.type(screen.getByLabelText("Current passphrase"), current);
  if (next) await user.type(screen.getByLabelText("New passphrase"), next);
  if (confirm)
    await user.type(screen.getByLabelText("Confirm new passphrase"), confirm);
  await user.click(screen.getByRole("button", { name: "Save passphrase" }));
}

const sent = (call: unknown[] | undefined) => {
  const init = call?.[1] as RequestInit | undefined;
  return { headers: new Headers(init?.headers), body: String(init?.body) };
};

describe("Change passphrase", () => {
  it("keeps its fields closed until the title is tapped; closing clears them", async () => {
    const user = userEvent.setup();
    mockApi({ "GET /api/backup": () => json(NO_BACKUP) });
    openSettings();
    const title = await screen.findByRole("button", {
      name: "Change passphrase",
    });
    const fields = document.getElementById(
      title.getAttribute("aria-controls") ?? "",
    );
    // Closed: out of reach of taps, Tab and screen readers.
    expect(title).toHaveAttribute("aria-expanded", "false");
    expect(fields).toHaveAttribute("inert");
    expect(fields).toHaveAttribute("aria-hidden", "true");
    expect(fields).not.toHaveClass("is-open");
    expect(
      screen.queryByRole("button", { name: "Save passphrase" }),
    ).toBeNull();

    await user.click(title);
    expect(title).toHaveAttribute("aria-expanded", "true");
    expect(fields).not.toHaveAttribute("inert");
    expect(fields).toHaveClass("slide", "is-open");
    await user.type(screen.getByLabelText("Current passphrase"), CURRENT);
    await user.click(screen.getByRole("button", { name: "Save passphrase" }));
    expect(screen.getByLabelText("New passphrase")).toHaveAccessibleDescription(
      /at least/,
    );

    // Cancel closes and forgets what was typed, errors included.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(title).toHaveAttribute("aria-expanded", "false");
    expect(fields).toHaveAttribute("inert");
    await user.click(title);
    expect(screen.getByLabelText("Current passphrase")).toHaveValue("");
    expect(
      screen.getByLabelText("New passphrase"),
    ).not.toHaveAccessibleDescription(/at least/);

    // So does the title.
    await user.type(screen.getByLabelText("New passphrase"), NEXT);
    await user.click(title);
    await user.click(title);
    expect(screen.getByLabelText("New passphrase")).toHaveValue("");
  });

  it("derives both keys here, sends neither passphrase, and swaps this device's session", async () => {
    const user = userEvent.setup();
    const oldToken = sessionToken();
    const newToken = fakeToken();
    const fetchMock = mockApi({
      "GET /api/backup": () => json(NO_BACKUP),
      "GET /api/auth/salt": () => json(SALT),
      "POST /api/auth/passphrase": () => json({ token: newToken }),
    });
    openSettings();
    await fill(user);

    expect(
      await screen.findByText(
        "Passphrase changed. Use it next time you sign in.",
      ),
    ).toBeInTheDocument();
    expect(sessionToken()).toBe(newToken);
    expect(screen.getByLabelText("Current passphrase")).toHaveValue("");
    // Done: the card closes again.
    expect(
      screen.getByRole("button", { name: "Change passphrase" }),
    ).toHaveAttribute("aria-expanded", "false");

    const post = sent(actionCalls(fetchMock)[1]);
    expect(post.headers.get("Authorization")).toBe(`Bearer ${oldToken}`);
    expect(post.headers.get(IDEMPOTENCY_KEY_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
    expect(post.body).not.toContain(CURRENT);
    expect(post.body).not.toContain(NEXT);
    expect(JSON.parse(post.body)).toMatchObject({
      currentAuthKey: expect.any(String),
      newAuthKey: expect.any(String),
      newSalt: expect.any(String),
    });
  });

  it("says a wrong current passphrase is wrong, and keeps the owner signed in", async () => {
    const user = userEvent.setup();
    const token = sessionToken();
    mockApi({
      "GET /api/auth/salt": () => json(SALT),
      "POST /api/auth/passphrase": () =>
        json({ error: "invalid_passphrase" }, { status: 401 }),
    });
    const router = openSettings();
    await fill(user);
    const field = screen.getByLabelText("Current passphrase");
    await waitFor(() =>
      expect(field).toHaveAccessibleDescription("Wrong passphrase"),
    );
    expect(sessionToken()).toBe(token);
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("retries with the same key after no answer, so a change that went through replays", async () => {
    const user = userEvent.setup();
    const keys: (string | null)[] = [];
    let attempt = 0;
    mockApi({
      "GET /api/auth/salt": () => json(SALT),
      "POST /api/auth/passphrase": (init) => {
        keys.push(new Headers(init?.headers).get(IDEMPOTENCY_KEY_HEADER));
        attempt += 1;
        if (attempt === 1) throw new TypeError("Failed to fetch");
        return json({ token: fakeToken() });
      },
    });
    openSettings();
    await fill(user);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "You're offline.",
    );
    await user.click(screen.getByRole("button", { name: "Save passphrase" }));
    await screen.findByText(
      "Passphrase changed. Use it next time you sign in.",
    );
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it("checks length and confirmation before sending anything", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ "GET /api/backup": () => json(NO_BACKUP) });
    openSettings();
    await fill(user, { next: "too short", confirm: "too short" });
    expect(screen.getByLabelText("New passphrase")).toHaveAccessibleDescription(
      expect.stringContaining("Use at least 12 characters."),
    );

    await user.clear(screen.getByLabelText("New passphrase"));
    await user.type(screen.getByLabelText("New passphrase"), NEXT);
    await user.click(screen.getByRole("button", { name: "Save passphrase" }));
    expect(
      screen.getByLabelText("Confirm new passphrase"),
    ).toHaveAccessibleDescription("The passphrases don't match.");
    expect(actionCalls(fetchMock)).toEqual([]);
  });

  it("still ends the session on a 401 that isn't about the passphrase", async () => {
    const user = userEvent.setup();
    mockApi({
      "GET /api/auth/salt": () => json(SALT),
      "POST /api/auth/passphrase": () =>
        json({ error: "unauthorized" }, { status: 401 }),
    });
    const router = openSettings();
    await fill(user);
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(sessionToken()).toBeNull();
  });
});
