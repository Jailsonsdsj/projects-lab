// What every lab shares with the platform (docs/architecture.md §4).
import { z } from "zod";

export const LAB_IDS = ["study", "career"] as const;
export type LabId = (typeof LAB_IDS)[number];

/** GET /api/<lab>/summary: Home's card for that lab. `null` = no data yet,
 *  which Home shows as the lab's empty card, never as an error. */
export const labSummarySchema = z.object({
  stats: z.array(z.object({ value: z.string(), label: z.string() })).max(3),
  foot: z.object({ label: z.string(), value: z.string() }).optional(),
});
export type LabSummary = z.infer<typeof labSummarySchema>;
export const labSummaryResponseSchema = labSummarySchema.nullable();
