// Readiness (docs/prd/21-career-jobs-and-skills.md, R2-15, architecture §5).
// Computed at read time from Study's skillStatus and the profile; never stored.

export const REQUIREMENT_TYPES = ["required", "nice", "not_mapped"] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const READINESS = ["verified", "declared", "gap"] as const;
export type Readiness = (typeof READINESS)[number];

/** "Next up" lists at most this many gaps. */
export const NEXT_UP_MAX = 3;

/** Verified (Study proved it) beats Declared (the profile claims it); else Gap. */
export function skillReadiness(
  skillId: string,
  verified: ReadonlySet<string>,
  declared: ReadonlySet<string>,
): Readiness {
  if (verified.has(skillId)) return "verified";
  if (declared.has(skillId)) return "declared";
  return "gap";
}

export interface RequirementRef {
  id: string;
  type: RequirementType;
  /** Null exactly when not mapped (K-9). */
  skillId: string | null;
  position: number;
}

export interface Tally {
  /** Distinct skills Verified or Declared. */
  ready: number;
  /** Distinct skills. */
  total: number;
}

export interface JobReadiness<T extends RequirementRef> {
  /** The meter: required skills only. 0 of 0 when the job has none. */
  required: Tally;
  /** Shown apart; never part of the meter. */
  nice: Tally;
  /** Every mapped requirement with its status, in posting order. */
  requirements: (T & { readiness: Readiness })[];
  /** Up to three gaps: required first, then nice, each in posting order. */
  nextUp: (T & { readiness: Readiness })[];
  /** What a course can't teach, kept so nothing is silently dropped. */
  notMapped: T[];
}

function tally(
  skills: readonly string[],
  verified: ReadonlySet<string>,
  declared: ReadonlySet<string>,
): Tally {
  const distinct = [...new Set(skills)];
  return {
    ready: distinct.filter(
      (skill) => skillReadiness(skill, verified, declared) !== "gap",
    ).length,
    total: distinct.length,
  };
}

export function jobReadiness<T extends RequirementRef>(
  requirements: readonly T[],
  verified: ReadonlySet<string>,
  declared: ReadonlySet<string>,
): JobReadiness<T> {
  const ordered = [...requirements].sort((a, b) => a.position - b.position);
  const mapped = ordered
    .filter((requirement) => requirement.type !== "not_mapped")
    .map((requirement) => ({
      ...requirement,
      readiness: skillReadiness(
        requirement.skillId as string,
        verified,
        declared,
      ),
    }));
  const skillsOf = (type: RequirementType) =>
    mapped
      .filter((requirement) => requirement.type === type)
      .map((requirement) => requirement.skillId as string);

  // A skill named twice is one gap: the first mention, required before nice.
  const seen = new Set<string>();
  const nextUp = [
    ...mapped.filter((requirement) => requirement.type === "required"),
    ...mapped.filter((requirement) => requirement.type === "nice"),
  ].filter((requirement) => {
    const skill = requirement.skillId as string;
    if (requirement.readiness !== "gap" || seen.has(skill)) return false;
    seen.add(skill);
    return true;
  });

  return {
    required: tally(skillsOf("required"), verified, declared),
    nice: tally(skillsOf("nice"), verified, declared),
    requirements: mapped,
    nextUp: nextUp.slice(0, NEXT_UP_MAX),
    notMapped: ordered.filter(
      (requirement) => requirement.type === "not_mapped",
    ),
  };
}
