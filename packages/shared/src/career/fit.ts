// The fit score (docs/prd/21-career-jobs-and-skills.md, career-os /job-fit).
// The five dimensions are Claude's judgment; the total and the decision follow
// from them here, so a total that isn't the sum can't be saved (K-10).

export const FIT_DIMENSIONS = [
  "constraints",
  "skills",
  "growth",
  "pay",
  "signal",
] as const;
export type FitDimension = (typeof FIT_DIMENSIONS)[number];

export const FIT_MAX: Record<FitDimension, number> = {
  constraints: 25,
  skills: 25,
  growth: 20,
  pay: 15,
  signal: 15,
};
/** Compensation when the posting has no rate. */
export const FIT_PAY_UNPOSTED = 7;
export const FIT_APPLY_MIN = 75;
export const FIT_MAYBE_MIN = 55;
/** Below this on constraints it's a skip, whatever the total. */
export const FIT_CONSTRAINTS_FLOOR = 15;

export const FIT_DECISIONS = ["apply", "maybe", "skip"] as const;
export type FitDecision = (typeof FIT_DECISIONS)[number];

export type FitScores = Record<FitDimension, number>;

export function isFitScores(scores: FitScores): boolean {
  return FIT_DIMENSIONS.every((dimension) => {
    const score = scores[dimension];
    return Number.isInteger(score) && score >= 0 && score <= FIT_MAX[dimension];
  });
}

/** 75+ apply · 55–74 maybe (only with spare capacity) · below 55, or constraints below 15, skip. */
export function scoreFit(scores: FitScores): {
  total: number;
  decision: FitDecision;
} {
  if (!isFitScores(scores))
    throw new RangeError(`Not fit scores: ${JSON.stringify(scores)}`);
  const total = FIT_DIMENSIONS.reduce(
    (sum, dimension) => sum + scores[dimension],
    0,
  );
  const decision: FitDecision =
    scores.constraints < FIT_CONSTRAINTS_FLOOR || total < FIT_MAYBE_MIN
      ? "skip"
      : total >= FIT_APPLY_MIN
        ? "apply"
        : "maybe";
  return { total, decision };
}
