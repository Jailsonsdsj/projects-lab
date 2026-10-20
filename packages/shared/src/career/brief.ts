// career_document_brief (docs/prd/22-career-documents.md): what fits a job
// and the rules and layout every surface writes a document by (§6.4).

export const DOCUMENT_KINDS = ["resume", "cover_letter", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** What a job's saved selection can cite (K-15). */
export const SELECTION_ITEM_KINDS = [
  "fact",
  "experience",
  "education",
  "skill",
] as const;
export type SelectionItemKind = (typeof SELECTION_ITEM_KINDS)[number];

export interface FactRef {
  id: string;
  verified: boolean;
  experienceId: string | null;
  skillIds: readonly string[];
  position: number;
}

export interface ExperienceRef {
  id: string;
  position: number;
}

export type Ranked<T> = T & { matches: number };

export interface RankedFacts<T extends FactRef> {
  /** Every verified fact: most of the job's skills first, then profile order. */
  facts: Ranked<T>[];
  /**
   * Unverified facts that evidence one of the job's skills: Claude asks about
   * exactly these, once, before writing. Unverified facts the job doesn't
   * need aren't mentioned.
   */
  askFirst: Ranked<T>[];
}

const byMatches = <T extends { matches: number; position: number }>(
  a: T,
  b: T,
) => b.matches - a.matches || a.position - b.position;

export function rankFacts<T extends FactRef>(
  facts: readonly T[],
  jobSkills: ReadonlySet<string>,
): RankedFacts<T> {
  const ranked = facts
    .map((fact) => ({
      ...fact,
      matches: new Set(fact.skillIds.filter((skill) => jobSkills.has(skill)))
        .size,
    }))
    .sort(byMatches);
  return {
    facts: ranked.filter((fact) => fact.verified),
    askFirst: ranked.filter((fact) => !fact.verified && fact.matches > 0),
  };
}

/** Experiences by the matches of their verified facts, then profile order. */
export function rankExperiences<T extends ExperienceRef>(
  experiences: readonly T[],
  facts: readonly Ranked<FactRef>[],
): Ranked<T>[] {
  const matches = new Map<string, number>();
  for (const fact of facts)
    if (fact.verified && fact.experienceId !== null)
      matches.set(
        fact.experienceId,
        (matches.get(fact.experienceId) ?? 0) + fact.matches,
      );
  return experiences
    .map((experience) => ({
      ...experience,
      matches: matches.get(experience.id) ?? 0,
    }))
    .sort(byMatches);
}

/** The posting's skills first, each group keeping its own order. */
export function rankSkills<T extends { skillId: string }>(
  skills: readonly T[],
  jobSkills: ReadonlySet<string>,
): T[] {
  return [
    ...skills.filter((skill) => jobSkills.has(skill.skillId)),
    ...skills.filter((skill) => !jobSkills.has(skill.skillId)),
  ];
}

/** Returned by the brief, so no surface needs its own skill (§6.6). From career-os /tailor-resume. */
export const WRITING_RULES = [
  "Every claim traces to a fact in this brief. Select, reorder and reword to the posting's vocabulary where the fact genuinely matches; never add an experience, a skill or a number.",
  "Unverified facts (ask_first) are out unless the owner confirms them in this session. Ask once, at the start, listing exactly those.",
  "Write in the posting's language, never the conversation's.",
  "A resume is one page. Rewrite the summary for the client's actual problem (usually implied by the posting); reorder skills posting-first, adding none.",
  "A cover note is at most 150 words in three paragraphs: why this problem, the one most relevant piece of evidence, availability (hours, time zone, start) stated plainly.",
  "If the posting needs a core skill the owner lacks, say so before writing, not after.",
  "After writing, save what was used with career_save_selection (IDs only, never the file).",
] as const;

export const DOCUMENT_LAYOUT = [
  "One column. The owner's name and links at the top.",
  "Sections in this order: summary, experience (facts as bullets), education, skills, languages.",
  "One font for the whole document: Helvetica in a PDF (a standard PDF font, nothing to embed), Arial in a DOCX. Never let a heading fall back to another font.",
  "Margins of 2 cm on every side.",
  "File name: <Name>__<company>__<kind>.<pdf|docx>. PDF by default; DOCX when the form asks for Word.",
  "Build the file in your own sandbox and hand it to the owner; the app stores no documents.",
] as const;
