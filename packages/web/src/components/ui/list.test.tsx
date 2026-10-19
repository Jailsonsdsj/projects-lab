import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Badge } from "./Badge";
import { Group, ListRow } from "./ListRow";

describe("ListRow", () => {
  it("is a button that opens something when given onClick, with a chevron", async () => {
    const onClick = vi.fn();
    render(
      <ListRow id="FE-01" title="Next.js" meta="Essential" onClick={onClick} />,
    );
    const row = screen.getByRole("button", {
      name: /FE-01.*Next\.js.*Essential/,
    });
    expect(row.querySelector(".row__chev")).not.toBeNull();
    await userEvent.click(row);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is a link with an href, marked current when it is", () => {
    render(<ListRow id="FE-01" title="Next.js" href="/study/x" current />);
    const link = screen.getByRole("link", { name: /Next\.js/ });
    expect(link).toHaveAttribute("href", "/study/x");
    expect(link).toHaveAttribute("aria-current", "true");
  });

  it("is static with nothing to open: no button, no link, no chevron", () => {
    const { container } = render(<ListRow title="No topics yet" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    const row = container.querySelector(".row");
    expect(row).toHaveClass("row--static", "row--no-id");
    expect(row?.querySelector(".row__chev")).toBeNull();
  });

  it("puts tags in the meta line, and in their own columns from tablet with `table`", () => {
    const { container } = render(
      <ListRow
        table
        id="DB-01"
        title="PostgreSQL"
        meta="Specialized"
        tags={<Badge tone="p2">P2</Badge>}
        value="8.5"
      />,
    );
    const row = container.querySelector(".row");
    expect(row).toHaveClass("trow");
    // One copy per layout; CSS shows one (tablet:hidden / hidden tablet:contents).
    const copies = container.querySelectorAll(".badge--p2");
    expect(copies).toHaveLength(2);
    expect(copies[0]?.parentElement).toHaveClass("tablet:hidden");
    expect(copies[1]?.parentElement).toHaveClass("hidden", "tablet:contents");
    expect(container.querySelector(".row__value")).toHaveTextContent("8.5");
  });

  it("has one tag copy without `table`", () => {
    const { container } = render(
      <ListRow
        id="DB-01"
        title="PostgreSQL"
        tags={<Badge tone="p2">P2</Badge>}
      />,
    );
    expect(container.querySelectorAll(".badge--p2")).toHaveLength(1);
    expect(container.querySelector(".row__trail .row__value")).toBeNull();
  });
});

describe("Group", () => {
  it("is a named section with its title and count", () => {
    render(
      <Group title="Frontend" count={2}>
        <ListRow title="Next.js" />
      </Group>,
    );
    const section = screen.getByRole("region", { name: "Frontend" });
    expect(section.querySelector(".group__title")).toHaveTextContent(
      "Frontend2",
    );
    expect(section.querySelector(".group")).toHaveTextContent("Next.js");
  });
});
