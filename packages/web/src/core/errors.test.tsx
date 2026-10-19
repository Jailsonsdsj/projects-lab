import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { createMemoryRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoutes, LABS } from "../app";
import { failureKind } from "./failure";
import type { LabDefinition } from "./lab-registry";
import { ReadView } from "./ReadView";
import { RouteError } from "./RouteError";

// Core never imports a lab, tests included: take paths from the registry.
const studyLab = LABS.find((lab) => lab.id === "study") as LabDefinition;
const studyRoot = studyLab.tabs[0]?.path ?? "";

const DEFAULT_PAGE = /Unexpected Application Error|Hey developer/;

function Throws({ error }: { error: unknown }): ReactNode {
  throw error;
}

/** The real route tree, with one screen swapped for `screen`. */
function routesWith(path: string, element: ReactNode) {
  return createRoutes(
    LABS.map((lab) => ({
      ...lab,
      tabs: lab.tabs.map((tab) =>
        tab.path === path ? { ...tab, screen: element } : tab,
      ),
    })),
  );
}

function renderAt(routes: RouteObject[], path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const offline = () =>
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

beforeEach(() => {
  // React and React Router report every caught error; the tests assert the UI.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  document.documentElement.removeAttribute("data-lab");
  vi.restoreAllMocks();
});

describe("route errors", () => {
  it("shows a screen that throws as an error inside the shell, and Home still works", async () => {
    const user = userEvent.setup();
    const router = renderAt(
      routesWith(studyRoot, <Throws error={new Error("boom")} />),
      studyRoot,
    );
    expect(screen.getByText("This screen hit a problem")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(DEFAULT_PAGE);
    expect(
      screen.getAllByRole("navigation", { name: studyLab.name }).length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Go to Home" }));
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByText("This screen hit a problem")).toBeNull();
  });

  it("says offline, not broken, when the screen's request never got an answer", () => {
    renderAt(
      routesWith(
        studyRoot,
        <Throws error={new TypeError("Failed to fetch")} />,
      ),
      studyRoot,
    );
    expect(screen.getByText("You're offline")).toBeInTheDocument();
    expect(screen.queryByText("This screen hit a problem")).toBeNull();
    expect(document.querySelector(".shell")).not.toBeNull();
  });

  it("says offline for any failure while the browser is offline", () => {
    offline();
    renderAt(
      routesWith(studyRoot, <Throws error={new Error("anything")} />),
      studyRoot,
    );
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });

  it("shows an error response's status as the code", async () => {
    renderAt(
      [
        {
          path: "/",
          loader: () => {
            throw new Response("", { status: 503 });
          },
          element: <p>never</p>,
          errorElement: <RouteError />,
        },
      ],
      "/",
    );
    expect(await screen.findByText("503")).toBeInTheDocument();
    expect(screen.getByText("This screen hit a problem")).toBeInTheDocument();
  });

  it("shows an unknown address as Not found inside the shell", () => {
    renderAt(createRoutes(), "/no/such/page");
    expect(screen.getByText("Page not found")).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(DEFAULT_PAGE);
    expect(document.querySelector(".shell")).not.toBeNull();
  });

  it("still replaces the default page when the shell itself fails", () => {
    // No platform entry: the shell can't resolve a lab for / and throws.
    renderAt(createRoutes(LABS.filter((lab) => lab.id !== "platform")), "/");
    expect(screen.getByText("This screen hit a problem")).toBeInTheDocument();
    expect(document.querySelector(".shell")).toBeNull();
    expect(document.body).not.toHaveTextContent(DEFAULT_PAGE);
  });

  it("puts every route under an error boundary", () => {
    const unguarded: string[] = [];
    const walk = (routes: RouteObject[], guarded: boolean) => {
      for (const route of routes) {
        const covered = guarded || route.errorElement !== undefined;
        if (!covered) unguarded.push(route.path ?? "(layout)");
        walk(route.children ?? [], covered);
      }
    };
    walk(createRoutes(), false);
    expect(unguarded).toEqual([]);
  });
});

describe("failureKind", () => {
  it("treats a module that failed to load while online as an error (stale deploy: Reload)", () => {
    expect(
      failureKind(
        new TypeError("Failed to fetch dynamically imported module: /x.js"),
      ),
    ).toBe("error");
    expect(failureKind(new TypeError("Load failed"))).toBe("offline");
  });
});

describe("ReadView", () => {
  const view = (load: () => Promise<string | null>) =>
    render(
      <ReadView
        load={load}
        empty={<p>Nothing here yet</p>}
        skeleton={<p>Loading</p>}
      >
        {(data) => <p>Got {data}</p>}
      </ReadView>,
    );

  it("shows an empty answer as empty", async () => {
    view(async () => null);
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("never shows a failed read as empty, and Retry reads again", async () => {
    const user = userEvent.setup();
    const load = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("500"))
      .mockResolvedValueOnce("grades");
    view(load);
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Got grades")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("says offline when the read never reached the server", async () => {
    view(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    expect(screen.queryByText("Nothing here yet")).toBeNull();
  });

  it("reads again in the background when `refresh` changes, keeping what's shown", async () => {
    let answer = "grades";
    let release: () => void = () => {};
    const load = vi.fn(async () => answer);
    const shown = (refresh: number) => (
      <ReadView
        load={load}
        refresh={refresh}
        empty={<p>Nothing here yet</p>}
        skeleton={<p>Loading</p>}
      >
        {(data) => <p>Got {data}</p>}
      </ReadView>
    );
    const { rerender } = render(shown(0));
    expect(await screen.findByText("Got grades")).toBeInTheDocument();

    answer = "new grades";
    load.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve(answer))),
    );
    rerender(shown(1));
    // No skeleton while it reads again: the old data stays until the new arrives.
    expect(screen.queryByText("Loading")).toBeNull();
    expect(screen.getByText("Got grades")).toBeInTheDocument();
    release();
    expect(await screen.findByText("Got new grades")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("ignores a read that finishes after it was abandoned", async () => {
    let finish: (value: string) => void = () => {};
    const { unmount } = view(
      () => new Promise<string>((resolve) => (finish = resolve)),
    );
    unmount();
    finish("late");
    await waitFor(() => expect(screen.queryByText("Got late")).toBeNull());
  });
});
