import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createBrowserRouter, createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json } from "../../../test/api";
import bigO from "../../../test/fixtures/big-o-notation__fast-track.md?raw";
import { createRoutes } from "../../app";

// Diagrams are Prose's concern (prose-mermaid.test.tsx): no real Mermaid here,
// which jsdom can't draw anyway; the code block stays.
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: () => Promise.reject(new Error("no Mermaid in jsdom")),
  },
}));

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
  images: { "growth.png": "e".repeat(40) },
};

/** The two reads the reader makes: the course's SHA, then its content. */
function api(
  meta: () => Response = () => json({ course: COURSE }),
  markdown: string = bigO,
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/study/courses/course-bigo") return meta();
    if (path === `/api/study/content/${SHA}/big-o-notation__fast-track.md`)
      return new Response(markdown, {
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

beforeEach(() => {
  // jsdom has no scrolling; the reader scrolls to the top on each page.
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

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
    // The sidebar button is tablet and wider only.
    expect(
      screen.queryByRole("button", { name: /lesson outline$/ }),
    ).toBeNull();
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

  it("puts the outline left of the text; the sidebar button hides it for a full-width read, remembered", async () => {
    tablet();
    api();
    const user = userEvent.setup();
    const { unmount } = render(
      <RouterProvider
        router={createMemoryRouter(createRoutes(), {
          initialEntries: ["/study/courses/course-bigo?p=1"],
        })}
      />,
    );
    const aside = await screen.findByRole("complementary", {
      name: "Lesson outline",
    });
    const main = document.querySelector(".reader__main") as HTMLElement;
    // Left: the column comes first in the reading row.
    expect(
      aside.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const hide = screen.getByRole("button", { name: "Hide lesson outline" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(hide).toHaveAttribute("aria-controls", aside.id);

    await user.click(hide);
    expect(
      screen.queryByRole("complementary", { name: "Lesson outline" }),
    ).toBeNull();
    const show = screen.getByRole("button", { name: "Show lesson outline" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".reader")).toHaveClass("reader--wide");

    // The next course opens the same way on this device.
    unmount();
    openReader("/study/courses/course-bigo?p=2");
    await screen.findByRole("button", { name: "Show lesson outline" });
    expect(
      screen.queryByRole("complementary", { name: "Lesson outline" }),
    ).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Show lesson outline" }),
    );
    expect(
      await screen.findByRole("complementary", { name: "Lesson outline" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".reader")).not.toHaveClass("reader--wide");
  });

  it("shows an error when the read fails, and the reader's own words offline", async () => {
    api(() => json({ error: "internal" }, { status: 500 }));
    openReader();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Load failed"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText(
        "Open this course once online to read it offline.",
      ),
    ).toBeInTheDocument();
  });

  it("goes back to Courses past every page turned, not one page", async () => {
    api(() => json({ course: COURSE }));
    const user = userEvent.setup();
    // A browser router: the reader steps back through real history.
    window.history.replaceState(null, "", "/study/courses");
    const router = createBrowserRouter(createRoutes());
    render(<RouterProvider router={router} />);
    await router.navigate("/study/courses/course-bigo");
    await screen.findByRole("heading", { level: 1, name: "Big-O Notation" });
    for (const name of [
      "Lesson 1 · What Big-O measures and why",
      "Lesson 2 · The common complexity classes",
    ]) {
      await user.click(screen.getByRole("button", { name }));
      await screen.findByRole("heading", { level: 2, name });
    }
    await user.click(screen.getByRole("button", { name: "Back to courses" }));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/study/courses"),
    );
    expect(router.state.location.search).toBe("");
    router.dispose();
  });

  it("names the path when the course file left study-materials", async () => {
    const message =
      "This course file is no longer in study-materials: Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track.md";
    api(() => json({ error: "not_found", message }, { status: 404 }));
    const router = openReader();
    expect(await screen.findByText(message)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Courses" }));
    expect(router.state.location.pathname).toBe("/study/courses");
  });

  it("checks the lesson's quick check against its own answer key", async () => {
    api();
    const user = userEvent.setup();
    openReader("/study/courses/course-bigo?p=2");
    const group = await screen.findByRole("radiogroup", {
      name: "Which complexity class describes binary search on a sorted array?",
    });
    await user.click(within(group).getByLabelText(/O\(n\)$/));
    expect(screen.getByText("Not quite: the answer is B.")).toBeInTheDocument();
    expect(
      screen.getByText(/Binary search halves the search space/),
    ).toBeInTheDocument();
    const fire = screen.getByRole("radiogroup", {
      name: /A single for loop over an array is always/,
    });
    await user.click(within(fire).getByLabelText("False"));
    expect(fire).toHaveClass("is-correct");
  });

  it("keeps each lesson's answers out of the page until asked for", async () => {
    api();
    const user = userEvent.setup();
    openReader("/study/courses/course-bigo?p=2");
    await screen.findByRole("heading", {
      level: 2,
      name: "Lesson 2 · The common complexity classes",
    });
    const answer = "Binary search halves the search space";
    expect(screen.queryByText(answer, { exact: false })).toBeNull();
    const show = screen.getByRole("button", { name: "Show answer key" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    await user.click(show);
    expect(screen.getByText(answer, { exact: false })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide answer key" }),
    ).toHaveAttribute("aria-expanded", "true");
    // Lesson 1's key isn't on lesson 2's page, and the next page starts hidden.
    expect(screen.queryByText("As n grows large", { exact: false })).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Lesson 3 · Analyzing your own code",
      }),
    );
    expect(
      await screen.findByRole("button", { name: "Show answer key" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("drops constant multipliers", { exact: false }),
    ).toBeNull();
  });

  it("loads _img/ images through the content proxy; an unknown one shows its alt", async () => {
    api(
      undefined,
      "# T\n\n## Lesson 1 · Images\n\n![Growth curves](_img/growth.png)\n\n![Missing chart](./_img/nope.png)\n\n![Remote](https://upload.wikimedia.org/x.png)",
    );
    openReader("/study/courses/course-bigo?p=1");
    const known = await screen.findByRole("img", { name: "Growth curves" });
    expect(known).toHaveAttribute(
      "src",
      `/api/study/content/${"e".repeat(40)}/growth.png`,
    );
    expect(screen.queryByRole("img", { name: "Missing chart" })).toBeNull();
    expect(screen.getByText("[Missing chart]")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Remote" })).toHaveAttribute(
      "src",
      "https://upload.wikimedia.org/x.png",
    );
  });
});
