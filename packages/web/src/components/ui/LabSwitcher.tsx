import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { linkClick, type Navigate } from "./nav";
import { Sheet } from "./Sheet";

export interface LabOption {
  /** Becomes the option's data-lab, so its mark paints in that lab's accent. */
  id: string;
  name: string;
  description: string;
  icon: IconName;
  href: string;
}

export interface LabSwitcherProps {
  labs: readonly LabOption[];
  current: string;
  /** `sheet` on phone; `menu` (an anchored popover) on tablet. */
  variant: "sheet" | "menu";
  /** Full-width, for the top of the SideRail. */
  block?: boolean;
  onNavigate?: Navigate;
}

/** The current lab's name with a mark; opens the list of labs. */
export function LabSwitcher({
  labs,
  current,
  variant,
  block,
  onNavigate,
}: LabSwitcherProps) {
  const active = labs.find((lab) => lab.id === current) ?? labs[0];
  const reactId = useId();
  const popoverId = `labs-${reactId.replace(/[^\w-]/g, "")}`;
  const anchor = `--${popoverId}`;
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const onToggle = (event: Event) =>
      setOpen((event as Event & { newState?: string }).newState === "open");
    popover.addEventListener("toggle", onToggle);
    return () => popover.removeEventListener("toggle", onToggle);
  }, []);

  const go: Navigate = (href) => {
    setOpen(false);
    popoverRef.current?.hidePopover();
    onNavigate?.(href);
  };

  const options = labs.map((lab) => {
    const isCurrent = lab.id === active?.id;
    return (
      <a
        key={lab.id}
        className="labopt"
        data-lab={lab.id}
        href={lab.href}
        aria-current={isCurrent ? "true" : undefined}
        onClick={linkClick(lab.href, go)}
      >
        <span className="labsw__mark" aria-hidden="true">
          <Icon name={lab.icon} />
        </span>
        <span>
          <span className="labopt__name">{lab.name}</span>
          <br />
          <span className="labopt__desc">{lab.description}</span>
        </span>
        {isCurrent ? <Icon name="check" className="labopt__check" /> : <span />}
      </a>
    );
  });

  const trigger = {
    className: cx("labsw", block && "labsw--block"),
    "aria-expanded": open,
    children: (
      <>
        <span className="labsw__mark" aria-hidden="true">
          {active && <Icon name={active.icon} />}
        </span>
        <span className="labsw__name">{active?.name}</span>
        <Icon name="chevron-down" className="labsw__chev" />
      </>
    ),
  };

  if (variant === "sheet") {
    return (
      <>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          {...trigger}
        />
        <Sheet open={open} onClose={() => setOpen(false)} title="Switch lab">
          <nav aria-label="Labs">{options}</nav>
        </Sheet>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-controls={popoverId}
        popoverTarget={popoverId}
        style={{ anchorName: anchor } as CSSProperties}
        {...trigger}
      />
      <div
        ref={popoverRef}
        id={popoverId}
        className="menu"
        popover="auto"
        style={{ positionAnchor: anchor } as CSSProperties}
      >
        <nav aria-label="Labs">{options}</nav>
      </div>
    </>
  );
}
