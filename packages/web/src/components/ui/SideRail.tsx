import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { linkClick, type NavItem, type Navigate } from "./nav";

export interface SideRailProps {
  /** Names the navigation, e.g. "Study Lab". */
  label: string;
  /** The kicker above the items, e.g. "Study". */
  section: string;
  /** The LabSwitcher (block variant) at the top. */
  switcher?: ReactNode;
  items: readonly NavItem[];
  /** Pinned to the bottom, e.g. Settings. */
  footItems?: readonly NavItem[];
  /** Icons over short labels, for tablets narrower than the landscape breakpoint. */
  compact?: boolean;
  onNavigate?: Navigate;
}

function RailItem({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate?: Navigate;
}) {
  return (
    <a
      className="rail__item"
      href={item.href}
      aria-current={item.current ? "page" : undefined}
      onClick={linkClick(item.href, onNavigate)}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {item.count !== undefined && (
        <span className="rail__count">{item.count}</span>
      )}
    </a>
  );
}

/** Tablet navigation (`.rail`). */
export function SideRail({
  label,
  section,
  switcher,
  items,
  footItems,
  compact,
  onNavigate,
}: SideRailProps) {
  return (
    <nav className={cx("rail", compact && "rail--compact")} aria-label={label}>
      {switcher}
      {!compact && <div className="rail__section kicker">{section}</div>}
      {items.map((item) => (
        <RailItem key={item.href} item={item} onNavigate={onNavigate} />
      ))}
      {footItems && footItems.length > 0 && (
        <div className="rail__foot">
          {footItems.map((item) => (
            <RailItem key={item.href} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </nav>
  );
}
