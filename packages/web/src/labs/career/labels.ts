// How Career's enums read on screen.
import type {
  ApplicationStatus,
  FitDecision,
} from "@projects-lab/shared/career";
import type { BadgeTone } from "../../components/ui";

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  evaluated: "Evaluated",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  closed_silent: "Closed, no answer",
};

export const DECISION: Record<FitDecision, { label: string; tone: BadgeTone }> =
  {
    apply: { label: "Apply", tone: "success" },
    maybe: { label: "Maybe", tone: "warning" },
    skip: { label: "Skip", tone: "neutral" },
  };
