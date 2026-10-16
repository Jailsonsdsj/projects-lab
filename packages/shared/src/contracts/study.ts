// Owned by Study Lab, consumed by Career Lab (docs/architecture.md §4). The
// only way one lab reaches another: the owning lab implements it and the
// composition root (packages/api/src/index.ts) injects it at mount time.

export interface StudyContract {
  /** Adds topics the backlog lacks; returns the topic ID for every skill, new or existing. */
  ensureTopics(
    input: { skillId: string; priority: 1 | 2 | 3; note: string }[],
  ): Promise<{ skillId: string; topicId: string; created: boolean }[]>;
  /** Verified = a Done topic with grade ≥ 70 (tenths). */
  skillStatus(
    skillIds: string[],
  ): Promise<{ skillId: string; verified: boolean; grade: number | null }[]>;
}
