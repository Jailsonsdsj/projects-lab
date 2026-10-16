import type { CSSProperties } from "react";
import { cx } from "./cx";

export interface SkeletonProps {
  shape?: "text" | "title" | "circle" | "block";
  /** A share of the line, e.g. "75%". Never pixels: sizes come from tokens. */
  width?: `${number}%`;
  /** For `circle` and `block`: a size token, e.g. "var(--size-avatar)". */
  size?: `var(--${string})`;
  className?: string;
}

/**
 * A placeholder shape. Decorative: the region that is loading carries
 * aria-busy. Its pulse is --animate-skeleton, which reduced motion sets to none.
 */
export function Skeleton({
  shape = "text",
  width,
  size,
  className,
}: SkeletonProps) {
  const style: CSSProperties = {};
  if (width) style.width = width;
  if (size) {
    style.height = size;
    if (shape === "circle") style.width = size;
  }
  return (
    <span
      className={cx(
        "skel",
        (shape === "text" || shape === "title" || shape === "circle") &&
          `skel--${shape}`,
        className,
      )}
      style={style}
      aria-hidden="true"
    />
  );
}
