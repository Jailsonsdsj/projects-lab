import type { MouseEvent } from "react";
import type { IconName } from "./icons";

/** A navigation destination. Components render real links; the app decides how
 *  to follow them (client-side routing), so these stay router-free. */
export interface NavItem {
  label: string;
  icon: IconName;
  href: string;
  current?: boolean;
  count?: number;
}

export type Navigate = (href: string) => void;

/** Follows a plain left click client-side; modified clicks keep browser behaviour. */
export function linkClick(href: string, navigate?: Navigate) {
  return (event: MouseEvent<HTMLElement>) => {
    if (!navigate || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    navigate(href);
  };
}
