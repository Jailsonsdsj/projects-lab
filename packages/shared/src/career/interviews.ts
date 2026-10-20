// Interview practice (docs/prd/24-career-interviews.md): the drill log Claude
// writes after a session in a chat.

export const DRILL_MODES = ["behavioral", "technical", "negotiation"] as const;
export type DrillMode = (typeof DRILL_MODES)[number];

/** A drill log entry keeps the two weakest answers. */
export const DRILL_WEAKEST_MAX = 2;
