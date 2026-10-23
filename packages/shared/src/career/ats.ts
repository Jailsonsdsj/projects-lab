// The ATS check on a resume (CA-17, docs/prd/22-career-documents.md § ATS).
// The app never sees the resume (R3-1), so the brief carries the keywords and
// this exact formula, and every surface scores its draft the same way before
// handing it over. The ceiling is the best score the owner's own evidence
// allows: below the pass mark, Claude stops and asks before writing.

/** A resume passes at this score or above (whole percent). */
export const ATS_MIN_SCORE = 80;

/** What a saved score may list as missing: keywords, each one line. */
export const ATS_MISSING_MAX = 50;
export const ATS_KEYWORD_MAX_LENGTH = 100;

/** A required requirement weighs twice a nice-to-have one. */
export const ATS_WEIGHTS = { required: 2, nice: 1 } as const;

export interface AtsKeyword {
  /** The requirement as the posting words it. */
  requirement: string;
  type: keyof typeof ATS_WEIGHTS;
  weight: number;
  skillId: string;
  /** The skill's name, then its aliases: any one of them covers it. */
  terms: string[];
}

/**
 * One keyword per mapped requirement (a requirement not mapped to a skill
 * isn't scored): its skill's name and aliases, weighted by its type.
 */
export function atsKeywords(
  requirements: readonly {
    text: string;
    type: string;
    skillId: string | null;
    skill: string | null;
  }[],
  aliases: ReadonlyMap<string, readonly string[]>,
): AtsKeyword[] {
  const keywords: AtsKeyword[] = [];
  for (const r of requirements) {
    if (!r.skillId || !r.skill) continue;
    if (r.type !== "required" && r.type !== "nice") continue;
    const terms = [r.skill, ...(aliases.get(r.skillId) ?? [])];
    keywords.push({
      requirement: r.text,
      type: r.type,
      weight: ATS_WEIGHTS[r.type],
      skillId: r.skillId,
      terms: [...new Set(terms.map((t) => t.trim()).filter(Boolean))],
    });
  }
  return keywords;
}

/** Lower case, accents off: "Pós-graduação" and "pos-graduacao" are one. */
const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether `text` mentions `term` as a whole word, ignoring case and accents:
 * no letter or digit right before or after it, so "Java" isn't found in
 * "JavaScript" and "C++" or "Node.js" still are.
 */
export function atsMentions(text: string, term: string): boolean {
  const needle = fold(term).trim();
  if (!needle) return false;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${literal(needle)}(?![\\p{L}\\p{N}])`,
    "u",
  ).test(fold(text));
}

/** Weight covered over weight in all, in whole percent, rounded down (79.9 fails). */
const percent = (covered: number, total: number) =>
  total === 0 ? 100 : Math.floor((covered * 100) / total);

const weightOf = (keywords: readonly AtsKeyword[]) =>
  keywords.reduce((sum, k) => sum + k.weight, 0);

export interface AtsResult {
  score: number;
  covered: AtsKeyword[];
  missing: AtsKeyword[];
}

/** A text's score: a keyword is covered when any of its terms is mentioned. */
export function atsScore(
  text: string,
  keywords: readonly AtsKeyword[],
): AtsResult {
  const covered = keywords.filter((k) =>
    k.terms.some((term) => atsMentions(text, term)),
  );
  const missing = keywords.filter((k) => !covered.includes(k));
  return {
    score: percent(weightOf(covered), weightOf(keywords)),
    covered,
    missing,
  };
}

/**
 * The best score an honest resume can reach: only the keywords whose skill
 * the owner has evidence for (a verified fact, a declared skill, or a skill
 * Study verified) can be in it.
 */
export function atsCeiling(
  keywords: readonly AtsKeyword[],
  evidenced: ReadonlySet<string>,
): AtsResult {
  const covered = keywords.filter((k) => evidenced.has(k.skillId));
  return {
    score: percent(weightOf(covered), weightOf(keywords)),
    covered,
    missing: keywords.filter((k) => !evidenced.has(k.skillId)),
  };
}

/** How to score, as the brief states it for Claude to apply to its draft. */
export const ATS_SCORING = `A keyword is covered when any of its terms appears in the resume's text as a whole word (no letter or digit right before or after it), ignoring case and accents. Score = the covered keywords' weight / all keywords' weight, as a whole percent rounded down. Required weighs ${ATS_WEIGHTS.required}, nice-to-have ${ATS_WEIGHTS.nice}. Pass: ${ATS_MIN_SCORE}% or more.`;

/** The rules a resume follows for an ATS, returned by the brief with the keywords. */
export const ATS_RULES = [
  `Before writing: if ceiling.score is below ${ATS_MIN_SCORE}, stop. Tell the owner the ceiling and the requirements in ceiling.missing (they need skills the profile has no evidence for), offer to add them to the Study backlog (career_send_gaps), and write only if the owner says to go ahead below ${ATS_MIN_SCORE}%. Never pad: no skill, tool or keyword the facts don't support.`,
  `Score the draft with the formula in scoring before handing it over. Below ${ATS_MIN_SCORE}%, revise with true facts only (the posting's exact term where a fact genuinely shows it, a skill line the owner has) and score again. Never deliver below ${ATS_MIN_SCORE}% unless the owner accepted it before writing.`,
  "Use each keyword in the posting's exact spelling. Give an acronym and its full form once (Continuous Integration (CI)). Put keywords in context, in the summary and the experience bullets, not only in the skills list.",
  "Standard section headings: Summary, Experience, Education, Skills, Languages (in the posting's language).",
  "Real text only: no tables, text boxes, columns, images or icons; nothing that matters in a header or footer; contact details in the body.",
  "One date format throughout (e.g. Oct 2023 – Present). Plain bullets.",
  "A text-based PDF (selectable text, standard font) or a DOCX; never a scan or an image.",
  "Tell the owner the score and the missing keywords, then save them with career_save_selection's ats.",
] as const;
