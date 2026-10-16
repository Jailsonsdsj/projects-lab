// The shared skill registry (docs/prd/99-data-model.md, C-1 and C-8).
import { z } from "zod";

/** core_find_skill: a name or an alias, matched ignoring case. */
export const findSkillInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
});
export type FindSkillInput = z.infer<typeof findSkillInputSchema>;

export interface Skill {
  id: string;
  name: string;
  aliases: string[];
}
