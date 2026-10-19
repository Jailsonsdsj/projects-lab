import type { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  /** The figure, in mono ("8.5"). */
  value: ReactNode;
  /** After the value, e.g. "/ 10" or "of 8". */
  unit?: ReactNode;
  /** A line under the value. */
  note?: ReactNode;
  /** Under it all, e.g. a ProgressBar. */
  children?: ReactNode;
}

/** One figure with its label (`.stat`): Grades' average, courses done. */
export function StatCard({
  label,
  value,
  unit,
  note,
  children,
}: StatCardProps) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">
        {value}
        {unit !== undefined && <span className="stat__unit">{unit}</span>}
      </span>
      {note !== undefined && <span className="stat__note">{note}</span>}
      {children}
    </div>
  );
}
