import type { ReactNode } from "react";
import { Badge } from "./Badge";

/** Where a requirement stands: Study verified it, the profile declares it, or neither. */
export type Readiness = "verified" | "declared" | "gap";

export interface RequirementRowProps {
  /** The requirement as the posting says it. */
  name: string;
  readiness: Readiness;
  /** Where it stands: "Passed DB-01 · 8.5", "Not in your profile or backlog". */
  meta?: ReactNode;
  /** "Add to Study backlog" for a gap. */
  action?: ReactNode;
  /** The tablet row (`.treq`): name and meta on the left, action and badge on the right. */
  table?: boolean;
}

const LABEL: Record<Readiness, string> = {
  verified: "Verified",
  declared: "Declared",
  gap: "Gap",
};

/** One job requirement and its readiness (the bundle's `.req` / `.treq`), a list item. */
export function RequirementRow({
  name,
  readiness,
  meta,
  action,
  table,
}: RequirementRowProps) {
  const badge = (
    <Badge tone={readiness} size="sm">
      {LABEL[readiness]}
    </Badge>
  );
  if (table)
    return (
      <li className="treq">
        <span className="treq__name">{name}</span>
        {meta && <span className="treq__meta">{meta}</span>}
        <span className="treq__side">
          {action}
          {badge}
        </span>
      </li>
    );
  return (
    <li className="req">
      <span className="req__name">{name}</span>
      {badge}
      {meta && <span className="req__meta">{meta}</span>}
      {action && <span className="req__action">{action}</span>}
    </li>
  );
}
