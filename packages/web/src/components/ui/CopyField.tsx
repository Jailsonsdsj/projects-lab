import { useEffect, useState } from "react";
import { Button } from "./Button";
import { cssDurationMs } from "./css-duration";
import { cx } from "./cx";

export interface CopyFieldProps {
  /** What the value is ("Email"): the label and the button's name. */
  label: string;
  value: string;
  /** A long value (an answer) sits under its label, full width. */
  long?: boolean;
  /** A URL or an ID: monospace. */
  mono?: boolean;
  /** The clipboard refused (no permission, not a secure page). */
  onCopyFailed?: () => void;
  className?: string;
}

/**
 * One value the owner copies into an application form (the bundle's "Profile
 * copy panel"): label, value, Copy. Copying shows Copied for
 * `--duration-copied-hold`, then Copy again, and says "<label> copied" to a
 * screen reader. Nothing is fetched: the value is already on screen.
 */
export function CopyField({
  label,
  value,
  long,
  mono,
  onCopyFailed,
  className,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const lower = label.toLowerCase();

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(
      () => setCopied(false),
      cssDurationMs("--duration-copied-hold") ?? 0,
    );
    return () => clearTimeout(timer);
  }, [copied]);

  const button = (
    <Button
      variant="soft"
      icon={copied ? "check" : "copy"}
      className={cx("copy__btn", copied && "btn--copied")}
      aria-label={`${copied ? "Copied" : "Copy"} ${lower}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          onCopyFailed?.();
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
  const shown = (
    <span className={cx("copy__value", mono && "mono copy__value--mono")}>
      {value}
    </span>
  );

  return (
    <div className={cx("copy", long && "copy--long", className)}>
      <span className="copy__label">{label}</span>
      {long ? button : shown}
      {long ? shown : button}
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied` : ""}
      </span>
    </div>
  );
}
