// Owned by Study Lab, consumed by Career Lab (docs/architecture.md §4). The
// only way one lab reaches another: the owning lab implements it and the
// composition root (packages/api/src/index.ts) injects it at mount time.

export interface StudyContract {
  /**
   * Adds topics the backlog lacks; returns the topic ID ("FE-01") for every
   * skill, new or existing. `area` is a backlog area prefix ("FE"): a topic's
   * code carries it. A removed topic is restored; an existing one is unchanged.
   */
  ensureTopics(
    input: {
      skillId: string;
      area: string;
      priority: 1 | 2 | 3;
      note: string;
    }[],
  ): Promise<{ skillId: string; topicId: string; created: boolean }[]>;
  /** Verified = a Done topic with grade ≥ 70 (tenths). */
  skillStatus(
    skillIds: string[],
  ): Promise<{ skillId: string; verified: boolean; grade: number | null }[]>;
}
