// What /api/career's reads return, as Zod schemas: the web parses every
// response with them, and the API's tests parse its real output, so the two
// can't drift. Shapes follow the services in api/src/labs/career.
import { z } from "zod";
import { APPLICATION_STATUSES } from "./applications";
import { FIT_DECISIONS } from "./fit";
import { EXPERIENCE_KINDS, LINK_KINDS, SKILL_LEVELS } from "./profile";
import { READINESS, REQUIREMENT_TYPES } from "./readiness";
import { CURRENCIES, PAY_PERIODS } from "./salary";

const skillRef = z.object({ id: z.string(), name: z.string() });

export const profileFactSchema = z.object({
  id: z.string(),
  text: z.string(),
  verified: z.boolean(),
  position: z.number().int(),
  skills: z.array(skillRef),
});
export type ProfileFact = z.infer<typeof profileFactSchema>;

export const profilePersonSchema = z.object({
  fullName: z.string(),
  headline: z.string(),
  location: z.string(),
  timezone: z.string(),
  email: z.string(),
  phone: z.string(),
  summary: z.string(),
  languages: z.array(z.object({ name: z.string(), level: z.string() })),
  photo: z.object({ type: z.string() }).nullable(),
  updatedAt: z.string().nullable(),
});
export type ProfilePerson = z.infer<typeof profilePersonSchema>;

export const profileLinkSchema = z.object({
  id: z.string(),
  kind: z.enum(LINK_KINDS),
  label: z.string(),
  url: z.string(),
  position: z.number().int(),
});
export type ProfileLink = z.infer<typeof profileLinkSchema>;

export const profileExperienceSchema = z.object({
  id: z.string(),
  organization: z.string(),
  title: z.string(),
  kind: z.enum(EXPERIENCE_KINDS),
  start: z.string(),
  end: z.string().nullable(),
  location: z.string(),
  summary: z.string(),
  position: z.number().int(),
  facts: z.array(profileFactSchema),
});
export type ProfileExperience = z.infer<typeof profileExperienceSchema>;

export const profileEducationSchema = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  start: z.string(),
  end: z.string().nullable(),
  notes: z.string(),
  position: z.number().int(),
  facts: z.array(profileFactSchema),
});
export type ProfileEducation = z.infer<typeof profileEducationSchema>;

export const declaredSkillSchema = z.object({
  skillId: z.string(),
  name: z.string(),
  level: z.enum(SKILL_LEVELS),
  years: z.number().int().nullable(),
  note: z.string(),
});
export type DeclaredSkill = z.infer<typeof declaredSkillSchema>;

/** GET /api/career/profile */
export const profileResponseSchema = z.object({
  person: profilePersonSchema,
  links: z.array(profileLinkSchema),
  experiences: z.array(profileExperienceSchema),
  education: z.array(profileEducationSchema),
  facts: z.array(profileFactSchema),
  skills: z.array(declaredSkillSchema),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

const tally = z.object({ ready: z.number().int(), total: z.number().int() });

export const jobSummarySchema = z.object({
  id: z.string(),
  company: z.string(),
  role: z.string(),
  status: z.enum(APPLICATION_STATUSES),
  statusAt: z.string(),
  fit: z
    .object({ total: z.number().int(), decision: z.enum(FIT_DECISIONS) })
    .nullable(),
  readiness: z.object({ required: tally, nice: tally }),
  nextUp: z.array(
    z.object({
      requirementId: z.string(),
      text: z.string(),
      skill: z.string(),
    }),
  ),
  silent: z.boolean(),
  updatedAt: z.string(),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;

/** GET /api/career/jobs */
export const jobsResponseSchema = z.object({ jobs: z.array(jobSummarySchema) });

export const requirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(REQUIREMENT_TYPES),
  skillId: z.string().nullable(),
  skill: z.string().nullable(),
  position: z.number().int(),
});

/** GET /api/career/jobs/:id */
export const jobResponseSchema = z.object({
  job: jobSummarySchema.omit({ fit: true }).extend({
    seniority: z.string(),
    language: z.string(),
    workShape: z.string(),
    sourceUrl: z.string().nullable(),
    posting: z.string(),
    fit: z
      .object({
        total: z.number().int(),
        decision: z.enum(FIT_DECISIONS),
        scores: z.object({
          constraints: z.number().int(),
          skills: z.number().int(),
          growth: z.number().int(),
          pay: z.number().int(),
          signal: z.number().int(),
        }),
      })
      .nullable(),
    fitNotes: z.string(),
    requirements: z.array(
      requirementSchema.extend({ readiness: z.enum(READINESS) }),
    ),
    notMapped: z.array(requirementSchema),
    events: z.array(
      z.object({
        status: z.enum(APPLICATION_STATUSES),
        at: z.string(),
        note: z.string(),
      }),
    ),
    createdAt: z.string(),
  }),
});
export type JobDetail = z.infer<typeof jobResponseSchema>["job"];

export const jobKitSchema = z.object({
  jobId: z.string(),
  intro: z.string(),
  salary: z
    .object({
      min: z.number().int(),
      max: z.number().int(),
      currency: z.enum(CURRENCIES),
      period: z.enum(PAY_PERIODS),
    })
    .nullable(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })),
  selection: z
    .object({
      variant: z.string(),
      items: z.array(
        z.object({
          kind: z.string(),
          id: z.string(),
          label: z.string().nullable(),
        }),
      ),
    })
    .nullable(),
});
export type JobKit = z.infer<typeof jobKitSchema>;

/** GET /api/career/jobs/:id/kit */
export const jobKitResponseSchema = z.object({ kit: jobKitSchema });

/** GET /api/career/standard-answers */
export const standardAnswersResponseSchema = z.object({
  answers: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type StandardAnswer = z.infer<
  typeof standardAnswersResponseSchema
>["answers"][number];
