import { createElement } from "react";
import { cx } from "./cx";
import { ICONS, type IconName } from "./icons";

export type IconSize = "xs" | "sm" | "md" | "lg";

export interface IconProps {
  name: IconName;
  size?: IconSize;
  /** Accessible name. Without one the icon is decorative and hidden from assistive tech. */
  label?: string;
  className?: string;
}

/** A bundle icon drawn with the `.icon` classes (stroke and size come from tokens). */
export function Icon({ name, size = "md", label, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("icon", size !== "md" && `icon--${size}`, className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {ICONS[name].map(([tag, attrs], i) =>
        // Shapes are static and ordered, so the index is a stable key.
        createElement(tag, { key: i, ...attrs }),
      )}
    </svg>
  );
}
