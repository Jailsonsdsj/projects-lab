import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json } from "../../../test/api";
import bigO from "../../../test/fixtures/big-o-notation__fast-track.md?raw";
import { createRoutes } from "../../app";

const SHA = "c".repeat(40);
const COURSE = {
  courseId: "course-bigo",
  topicId: "CS-01",
  skill: "Big-O notation",
  level: "fast_track",
  module: 1,
  path: "Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track.md",
  recordedAt: "2026-10-19T12:00:00.000Z",
  sha: SHA,
  name: "big-o-notation__fast-track.md",
};

/** The two reads the reader makes: the course's SHA, then its content. */
function api(meta: () => Response = () => json({ course: COURSE })) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/study/courses/course-bigo") return meta();
    if (path === `/api/study/content/${SHA}/big-o-notation__fast-track.md`)
      return new Response(bigO, {
        headers: { "Content-Type": "text/markdown" },
      });
    throw new Error(`unexpected request ${path}`);
  });
}

function tablet() {
  // jsdom has no tokens.css: give useMinWidth the breakpoint, as Shell.test does.
  document.documentElement.style.setProperty("--breakpoint-tablet", "768px");
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media) =>
      ({
        matches: media.includes("768px"),
        media,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

function openReader(at = "/study/courses/course-bigo") {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [at] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
  document.documentElement.style.removeProperty("--breakpoint-tablet");
});

describe("Course reader", () => {
  it("opens full screen, without the shell's navigation, on the overview", async () => {
    api();
    openReader();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Big-O Notation" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".shell")).toBeNull();
    expect(document.querySelector(".btabs")).toBeNull();
    expect(document.documentElement.dataset.lab).toBe("study");
    expect(screen.getByText("Course map")).toBeInTheDocument();
    expect(document.querySelector(".reader__meta")).toHaveTextContent(
      "CS-01Fast track",
    );
  });

  it("renders every lesson in turn with Next, and says where it is", async () => {
    api();
    const user = userEvent.setup();
    openReader();
    await screen.findByRole("heading", { level: 1, name: "Big-O Notation" });
    const titles = [
      "Lesson 1 · What Big-O measures and why",
      "Lesson 2 · The common complexity classes",
      "Lesson 3 · Analyzing your own code",
    ];
    for (const [i, title] of titles.entries()) {
      await user.click(screen.getByRole("button", { name: title }));
      expect(
        await screen.findByRole("heading", { level: 2, name: title }),
      ).toBeInTheDocument();
      expect(screen.getByText(`📖 Lesson ${i + 1} of 3`)).toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "Course wrap-up" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "References" }),
    ).toBeInTheDocument();
    // The last page has no Next; the answer key isn't shown yet (ST-07b).
    expect(screen.queryByText("Next")).toBeNull();
    expect(screen.queryByText("Answer key")).toBeNull();
  });

  it("goes back with Previous and deep-links a page with ?p=", async () => {
    api();
    const user = userEvent.setup();
    const router = openReader("/study/courses/course-bigo?p=2");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Lesson 2 · The common complexity classes",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Previous · Lesson 1 · What Big-O measures and why",
      }),
    );
    expect(router.state.location.search).toBe("?p=1");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Lesson 1 · What Big-O measures and why",
      }),
    ).toBeInTheDocument();
  });

  it("opens the outline in a Sheet on phone, and jumps to a lesson", async () => {
    api();
    const user = userEvent.setup();
    openReader();
    await screen.findByRole("heading", { level: 1, name: "Big-O Notation" });
    await user.click(screen.getByRole("button", { name: "Lesson outline" }));
    const sheet = await screen.findByRole("dialog", { name: "Lesson outline" });
    const lessons = within(sheet).getByRole("navigation", { name: "Lessons" });
    expect(within(lessons).getAllByRole("link")).toHaveLength(3);
    await user.click(
      within(lessons).getByRole("link", {
        name: /The common complexity classes/,
      }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Lesson 2 · The common complexity classes",
      }),
    ).toBeInTheDocument();
  });

  it("pins the outline beside the text on tablet; a section link scrolls to its heading", async () => {
    tablet();
    api();
    const user = userEvent.setup();
    openReader("/study/courses/course-bigo?p=1");
    const aside = await screen.findByRole("complementary", {
      name: "Lesson outline",
    });
    expect(screen.queryByRole("button", { name: "Lesson outline" })).toBeNull();
    expect(document.querySelector(".phead__title")).toHaveTextContent(
      "CS-01 · Big-O Notation",
    );

    const toc = within(aside).getByRole("navigation", { name: "In this page" });
    const link = within(toc).getByRole("link", {
      name: "Why we ignore constants",
    });
    const heading = await screen.findByRole("heading", {
      level: 3,
      name: "Why we ignore constants",
    });
    expect(link).toHaveAttribute("href", `#${heading.id}`);
    const scrolled = vi.fn();
    heading.scrollIntoView = scrolled;
    await user.click(link);
    expect(scrolled).toHaveBeenCalled();
    expect(
      within(aside).getByRole("link", { name: /What Big-O measures/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("shows an error for a missing course and offline when the read never got there", async () => {
    api(() =>
      json({ error: "not_found", message: "No such course." }, { status: 404 }),
    );
    openReader();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Load failed"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(".shell")).toBeNull());
  });
});
