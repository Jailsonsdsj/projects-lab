import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReadinessMeter } from "./ReadinessMeter";
import { RequirementRow } from "./RequirementRow";

describe("ReadinessMeter", () => {
  it("shows ready of required, a bar split three ways, and its legend", () => {
    const { container } = render(
      <ReadinessMeter verified={1} declared={4} gap={3} />,
    );
    expect(container.querySelector(".meter__figure")).toHaveTextContent(
      "5/8 ready · 63%",
    );
    expect(
      screen.getByRole("img", {
        name: "1 verified, 4 declared, 3 gaps out of 8 required skills",
      }),
    ).toBeInTheDocument();
    const segments = [
      ...container.querySelectorAll(".meter__seg"),
    ] as HTMLElement[];
    expect(segments.map((s) => s.style.getPropertyValue("--_share"))).toEqual([
      "1",
      "4",
      "3",
    ]);
    expect(
      [...container.querySelectorAll(".meter__key")].map((k) => k.textContent),
    ).toEqual(["Verified 1", "Declared 4", "Gap 3"]);
  });

  it("leaves out empty segments, and says when nothing is mapped", () => {
    const { container, rerender } = render(
      <ReadinessMeter verified={2} declared={0} gap={0} />,
    );
    expect(container.querySelectorAll(".meter__seg")).toHaveLength(1);
    expect(
      screen.getByRole("img", {
        name: /2 verified, 0 declared, 0 gaps out of 2/,
      }),
    ).toBeInTheDocument();
    rerender(<ReadinessMeter verified={0} declared={0} gap={0} />);
    expect(container.querySelector(".meter__figure")).toHaveTextContent(
      "None mapped",
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("puts the figure under the title with long labels when detailed", () => {
    const { container } = render(
      <ReadinessMeter verified={1} declared={1} gap={1} detailed />,
    );
    expect(container.querySelector(".meter__head .meter__figure")).toBeNull();
    expect(container.querySelector(".meter__legend")).toHaveClass(
      "meter__legend--column",
    );
    expect(screen.getByText(/Verified by an exam/)).toBeInTheDocument();
    expect(screen.getByText(/Declared in profile/)).toBeInTheDocument();
  });
});

describe("RequirementRow", () => {
  it("is a list item with its name, badge, meta and action", () => {
    render(
      <ul>
        <RequirementRow
          name="Kubernetes"
          readiness="gap"
          meta="Not in your profile or backlog"
          action={<button type="button">Add</button>}
        />
      </ul>,
    );
    const row = screen.getByRole("listitem");
    expect(row).toHaveClass("req");
    expect(row).toHaveTextContent(
      "KubernetesGapNot in your profile or backlogAdd",
    );
  });

  it("puts the action and badge on the side as a table row", () => {
    const { container } = render(
      <ul>
        <RequirementRow
          table
          name="PostgreSQL"
          readiness="verified"
          meta="Passed DB-01"
        />
      </ul>,
    );
    expect(container.querySelector(".treq .treq__side")).toHaveTextContent(
      "Verified",
    );
  });
});
