import type { CSSProperties } from "react";
import { cx } from "./cx";

export interface ReadinessMeterProps {
  /** Distinct required skills Study verified. */
  verified: number;
  /** Declared in the profile, not verified. */
  declared: number;
  /** Neither. */
  gap: number;
  /** "Required skills". */
  title?: string;
  /** The tablet layout: the figure under the title, the legend in a column
   *  with longer labels ("Verified by an exam"). */
  detailed?: boolean;
  className?: string;
}

/**
 * How ready the owner is for a job (the bundle's `.meter`, "Job readiness"):
 * ready out of the required skills, a bar split into verified, declared and
 * gap, and its legend. Nothing to measure (no required skills) says so.
 */
export function ReadinessMeter({
  verified,
  declared,
  gap,
  title = "Required skills",
  detailed,
  className,
}: ReadinessMeterProps) {
  const total = verified + declared + gap;
  const ready = verified + declared;
  const figure =
    total === 0 ? (
      <span className="meter__figure">None mapped</span>
    ) : (
      <span className="meter__figure">
        <strong>{ready}</strong>/{total} ready ·{" "}
        {Math.round((ready / total) * 100)}%
      </span>
    );
  const parts = [
    {
      key: "verified",
      count: verified,
      label: detailed ? "Verified by an exam" : "Verified",
    },
    {
      key: "declared",
      count: declared,
      label: detailed ? "Declared in profile" : "Declared",
    },
    { key: "gap", count: gap, label: "Gap" },
  ] as const;
  return (
    <div className={cx("meter", className)}>
      <div className="meter__head">
        <span className="meter__title">{title}</span>
        {!detailed && figure}
      </div>
      {detailed && figure}
      {total > 0 && (
        <div
          className="meter__bar"
          role="img"
          aria-label={`${verified} verified, ${declared} declared, ${gap} ${gap === 1 ? "gap" : "gaps"} out of ${total} required ${total === 1 ? "skill" : "skills"}`}
        >
          {parts.map(
            (part) =>
              part.count > 0 && (
                <span
                  key={part.key}
                  className={`meter__seg meter__seg--${part.key}`}
                  // Its share of the bar: a custom property, read by flex-grow.
                  style={{ "--_share": String(part.count) } as CSSProperties}
                />
              ),
          )}
        </div>
      )}
      <div className={cx("meter__legend", detailed && "meter__legend--column")}>
        {parts.map((part) => (
          <span key={part.key} className="meter__key">
            <span className={`meter__swatch meter__seg--${part.key}`} />
            {part.label} <b>{part.count}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
