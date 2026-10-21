import { backupFileSchema, bytesToBase64 } from "@projects-lab/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../test/api";
import { createRoutes } from "../app";

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const DATA = {
  app: "projects-lab",
  version: 1,
  exportedAt: "2026-10-20T10:00:00.000Z",
  migrations: ["0000_init.sql"],
  tables: { user: [{ id: "owner", timezone: "UTC" }], skill: [] },
  files: [
    { key: "profile/photo.jpg", contentType: "image/jpeg", size: PHOTO.length },
  ],
};

function open(path: string) {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

let saved: Blob | null = null;
beforeEach(() => {
  saved = null;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    saved = blob;
    return "blob:backup";
  });
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Settings → Backup", () => {
  it("downloads one file with the rows and each file's bytes, then records it on the server", async () => {
    // Recorded now, so the card reads "today" whatever day the test runs.
    const done = new Date().toISOString();
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    const fetch = mockApi({
      "GET /api/backup": () => json({ lastExportedAt: null }),
      "GET /api/backup/data": () => json(DATA),
      "GET /api/backup/files/profile/photo.jpg": () => new Response(PHOTO),
      "POST /api/backup/done": () => json({ lastExportedAt: done }),
    });
    open("/settings");
    const card = await screen.findByRole("region", { name: "Backup" });
    expect(await within(card).findByText("Never")).toBeInTheDocument();
    await userEvent.click(
      within(card).getByRole("button", { name: "Download backup" }),
    );
    expect(await screen.findByText("Backup downloaded")).toBeInTheDocument();

    const file = backupFileSchema.parse(
      JSON.parse(await (saved as unknown as Blob).text()),
    );
    expect(file.files).toEqual([
      { ...DATA.files[0], base64: bytesToBase64(PHOTO) },
    ]);
    expect(file.tables.user).toEqual(DATA.tables.user);
    const link = clicked.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe("projects-lab-backup-2026-10-20.json");
    expect(within(card).getByText(/today/)).toBeInTheDocument();
    // The done call carries a key, and the date stays on the server only.
    const doneCall = fetch.mock.calls.find(
      ([url]) => url === "/api/backup/done",
    );
    expect(new Headers(doneCall?.[1]?.headers).get("Idempotency-Key")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      const entry = `${key}=${localStorage.getItem(key)}`;
      expect(entry).not.toMatch(/export|backup/i);
      expect(entry).not.toContain(done);
    }
  });

  it("saves nothing and records nothing when the data can't be read", async () => {
    let doneCalled = false;
    mockApi({
      "GET /api/backup": () => json({ lastExportedAt: null }),
      "GET /api/backup/data": () => new Response(null, { status: 500 }),
      "POST /api/backup/done": () => {
        doneCalled = true;
        return json({});
      },
    });
    open("/settings");
    const card = await screen.findByRole("region", { name: "Backup" });
    await userEvent.click(
      within(card).getByRole("button", { name: "Download backup" }),
    );
    expect(
      await within(card).findByText("Couldn't make the backup."),
    ).toBeInTheDocument();
    expect(saved).toBeNull();
    expect(doneCalled).toBe(false);
  });
});

describe("Home's backup reminder", () => {
  const home = (lastExportedAt: string | null) =>
    mockApi({
      "GET /api/study/summary": () => json(null),
      "GET /api/career/summary": () => json(null),
      "GET /api/backup": () => json({ lastExportedAt }),
    });

  it("reminds when there's never been one, and opens Settings", async () => {
    home(null);
    const router = open("/");
    expect(await screen.findByText("No backup yet.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back up" }));
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("reminds after 30 days, not before", async () => {
    const days = (n: number) =>
      new Date(Date.now() - n * 86_400_000).toISOString();
    home(days(31));
    open("/");
    expect(
      await screen.findByText("No backup in a while."),
    ).toBeInTheDocument();
  });

  it("says nothing with a recent backup", async () => {
    const fetch = home(new Date(Date.now() - 2 * 86_400_000).toISOString());
    open("/");
    await vi.waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url === "/api/backup")).toBe(
        true,
      ),
    );
    await screen.findByRole("heading", { level: 1, name: "Home" });
    expect(screen.queryByText(/No backup/)).not.toBeInTheDocument();
  });
});
