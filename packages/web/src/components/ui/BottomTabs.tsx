import { Icon } from "./Icon";
import { linkClick, type NavItem, type Navigate } from "./nav";

export interface BottomTabsProps {
  /** Names the navigation, e.g. "Study Lab". */
  label: string;
  items: readonly NavItem[];
  onNavigate?: Navigate;
}

/** Phone navigation (`.btabs`): the current lab's tabs. */
export function BottomTabs({ label, items, onNavigate }: BottomTabsProps) {
  return (
    <nav className="btabs" aria-label={label}>
      {items.map((item) => (
        <a
          key={item.href}
          className="btab"
          href={item.href}
          aria-current={item.current ? "page" : undefined}
          onClick={linkClick(item.href, onNavigate)}
        >
          <span className="btab__pill">
            <Icon name={item.icon} />
          </span>
          {item.label}
        </a>
      ))}
    </nav>
  );
}
