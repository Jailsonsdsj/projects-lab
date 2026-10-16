import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

export interface ProgressBarProps {
  /** 0–`max`; clamped. */
  value: number;
  max?: number;
  /** Accessible name, e.g. "Lesson progress". */
  label: string;
  /** Optional visible head: text on the left, the value on the right. */
  caption?: ReactNode;
  valueText?: ReactNode;
  size?: "sm" | "md";
  /** `success` paints the fill with the verified bar colour. */
  tone?: "accent" | "success";
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  caption,
  valueText,
  size = "md",
  tone = "accent",
  className,
}: ProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), max);
  const percent = max > 0 ? (clamped * 100) / max : 0;
  return (
    <div
      className={cx(
        "progress",
        size === "sm" && "progress--sm",
        tone === "success" && "progress--success",
        className,
      )}
    >
      {(caption || valueText) && (
        <div className="progress__head">
          <span>{caption}</span>
          {valueText && <span className="progress__value">{valueText}</span>}
        </div>
      )}
      <div
        className="progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={clamped}
      >
        <div
          className="progress__fill"
          style={{ "--_value": `${percent}%` } as CSSProperties}
        />
      </div>
    </div>
  );
}
