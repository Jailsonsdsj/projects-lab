import { API_CACHE } from "@projects-lab/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "../../test/api";
import { createRoutes } from "../app";
import { endSession, sessionToken } from "./session";

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

function openSettings() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/settings"],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("Log out", () => {
  it("asks first; Cancel keeps the session", async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({});
    const router = openSettings();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    const dialog = screen.getByRole("dialog", {
      name: "Log out of Projects Lab?",
    });
    expect(dialog).toHaveTextContent(
      "You'll need your passphrase to sign back in.",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(sessionToken()).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("ends the session on the server and on this device, then shows login", async () => {
    const user = userEvent.setup();
    const token = sessionToken();
    const fetchMock = mockApi({
      "POST /api/auth/logout": () => new Response(null, { status: 204 }),
    });
    const router = openSettings();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    await screen.findByRole("heading", { name: "Projects Lab" });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${token}`);
    expect(sessionToken()).toBeNull();
    expect(deleteCache).toHaveBeenCalledWith(API_CACHE);
    expect(screen.queryByRole("alert")).toBeNull(); // not "session expired"
  });

  it("still signs this device out when the request fails (offline)", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    const router = openSettings();
    await user.click(screen.getByRole("button", { name: "Log out" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(sessionToken()).toBeNull();
    expect(deleteCache).toHaveBeenCalledWith(API_CACHE);
  });
});

describe("ending a session", () => {
  it("deletes the cached reads before the token, so /login never shows over them", async () => {
    let finish: (value: boolean) => void = () => {};
    deleteCache.mockImplementation(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    const ending = endSession("signed-out");
    // The cache is still being deleted: the token (and so the gate) waits.
    await Promise.resolve();
    expect(deleteCache).toHaveBeenCalledWith(API_CACHE);
    expect(sessionToken()).not.toBeNull();
    finish(true);
    await ending;
    expect(sessionToken()).toBeNull();
  });
});
