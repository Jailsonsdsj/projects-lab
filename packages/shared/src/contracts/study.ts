// Owned by Study Lab, consumed by Career Lab (docs/architecture.md §4). The
// only way one lab reaches another: the owning lab implements it and the
// composition root (packages/api/src/index.ts) injects it at mount time.

export interface StudyContract {
  /**
   * Adds topics the backlog lacks; returns the topic ID ("FE-01") for every
   * skill, new or existing. `area` is a backlog area prefix ("FE"): a topic's
   * code carries it. A removed topic is restored; an existing one is unchanged.
   * `note` is cut to Study's note length (120).
   */
  ensureTopics(
    input: {
      skillId: string;
      area: string;
      priority: 1 | 2 | 3;
      note: string;
    }[],
  ): Promise<{ skillId: string; topicId: string; created: boolean }[]>;
  /** Verified = a Done topic with grade ≥ 70 (tenths). With the skill's
   *  topic ("FE-01") and its status when it's in the backlog, so Career can
   *  say "Studying now: FE-01" or "Passed DB-01". */
  skillStatus(skillIds: string[]): Promise<
    {
      skillId: string;
      verified: boolean;
      grade: number | null;
      topicId: string | null;
      topicStatus: "not_started" | "in_progress" | "done" | null;
    }[]
  >;
  /** Every skill Study has verified, with its grade: what Career offers to
   *  declare (A-8). The same rule as skillStatus. */
  verifiedSkills(): Promise<{ skillId: string; grade: number }[]>;
  /** The backlog's areas in their order: where Career's "Add to Study
   *  backlog" can put a gap (ensureTopics takes the prefix). */
  areas(): Promise<{ prefix: string; name: string }[]>;
}
