// What the /api/study read routes answer (docs/prd/10-study-backlog.md). The web
// parses responses with these, and an API test parses the real output, so the
// two sides can't drift apart.
import { z } from "zod";
import {
  COURSE_LEVELS,
  PRIORITIES,
  TOPIC_LEVELS,
  TOPIC_STATUSES,
} from "./backlog";

export const areaSchema = z.object({
  prefix: z.string(),
  name: z.string(),
  position: z.number().int(),
});
export type AreaInfo = z.infer<typeof areaSchema>;

export const topicSchema = z.object({
  /** The topic's code, "FE-01". */
  id: z.string(),
  skill: z.string(),
  skillId: z.string(),
  /** The area's prefix. */
  area: z.string(),
  level: z.enum(TOPIC_LEVELS),
  priority: z.literal(PRIORITIES),
  status: z.enum(TOPIC_STATUSES),
  /** Integer tenths from the most recently graded exam; null until one is. */
  grade: z.number().int().nullable(),
  startedOn: z.string().nullable(),
  finishedOn: z.string().nullable(),
  note: z.string(),
});
export type TopicInfo = z.infer<typeof topicSchema>;

/** GET /api/study/backlog: every area in position order, live topics in backlog order. */
export const backlogResponseSchema = z.object({
  areas: z.array(areaSchema),
  topics: z.array(topicSchema),
});
export type BacklogResponse = z.infer<typeof backlogResponseSchema>;

/** POST /api/study/topics: each topic, and whether it was new or restored. */
export const addTopicsResponseSchema = z.object({
  topics: z.array(
    z.object({
      topic: topicSchema,
      created: z.boolean(),
      restored: z.boolean(),
    }),
  ),
});
export type AddTopicsResponse = z.infer<typeof addTopicsResponseSchema>;

/** POST /api/study/areas */
export const addAreaResponseSchema = z.object({ area: areaSchema });

/** GET /api/study/courses/:courseId: the course and its file's blob SHA. */
export const courseReadResponseSchema = z.object({
  course: z.object({
    courseId: z.string(),
    topicId: z.string(),
    skill: z.string(),
    level: z.enum(COURSE_LEVELS),
    module: z.number().int(),
    path: z.string(),
    recordedAt: z.string(),
    sha: z.string(),
    name: z.string(),
    /** `_img/` beside the course: file name → blob SHA. */
    images: z.record(z.string(), z.string()),
  }),
});
export type CourseRead = z.infer<typeof courseReadResponseSchema>["course"];

/** GET /api/study/courses: recorded course files, newest first. */
export const coursesResponseSchema = z.object({
  courses: z.array(
    z.object({
      courseId: z.string(),
      topicId: z.string(),
      level: z.enum(COURSE_LEVELS),
      module: z.number().int(),
      path: z.string(),
      recordedAt: z.string(),
    }),
  ),
});
export type CourseInfo = z.infer<
  typeof coursesResponseSchema
>["courses"][number];
