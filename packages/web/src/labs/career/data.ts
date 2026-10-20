// Career reads for the web, each parsed with @projects-lab/shared/career's
// response schemas (the API's tests parse its real output with the same ones).
import {
  type JobDetail,
  type JobKit,
  type JobSummary,
  jobKitResponseSchema,
  jobResponseSchema,
  jobsResponseSchema,
  type ProfileResponse,
  profileResponseSchema,
  type StandardAnswer,
  standardAnswersResponseSchema,
  studyAreasResponseSchema,
} from "@projects-lab/shared/career";
import { apiFetch } from "../../core/api";

async function read<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  signal: AbortSignal,
): Promise<T> {
  const response = await apiFetch(path, { signal });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return schema.parse(await response.json());
}

export const fetchProfile = (signal: AbortSignal) =>
  read("/api/career/profile", profileResponseSchema, signal);

export const fetchStandardAnswers = async (signal: AbortSignal) =>
  (
    await read(
      "/api/career/standard-answers",
      standardAnswersResponseSchema,
      signal,
    )
  ).answers;

export const fetchJobs = async (signal: AbortSignal) =>
  (await read("/api/career/jobs", jobsResponseSchema, signal)).jobs;

export const fetchKit = async (jobId: string, signal: AbortSignal) =>
  (
    await read(
      `/api/career/jobs/${encodeURIComponent(jobId)}/kit`,
      jobKitResponseSchema,
      signal,
    )
  ).kit;

export const fetchJob = async (jobId: string, signal: AbortSignal) =>
  (
    await read(
      `/api/career/jobs/${encodeURIComponent(jobId)}`,
      jobResponseSchema,
      signal,
    )
  ).job;

/** The Study backlog's areas, through Career's API (the Study contract). */
export const fetchStudyAreas = async (signal: AbortSignal) =>
  (await read("/api/career/study-areas", studyAreasResponseSchema, signal))
    .areas;

export type { JobDetail };

/** Everything the Profile tab shows and copies, read at once: switching the
 *  "Answers for" job never needs the network, so copying works offline. */
export interface ProfileData {
  profile: ProfileResponse;
  answers: StandardAnswer[];
  jobs: JobSummary[];
  kits: Record<string, JobKit>;
}

export async function fetchProfileData(
  signal: AbortSignal,
): Promise<ProfileData> {
  const [profile, answers, jobs] = await Promise.all([
    fetchProfile(signal),
    fetchStandardAnswers(signal),
    fetchJobs(signal),
  ]);
  const kits = await Promise.all(jobs.map((job) => fetchKit(job.id, signal)));
  return {
    profile,
    answers,
    jobs,
    kits: Object.fromEntries(kits.map((kit) => [kit.jobId, kit])),
  };
}

/** Nothing to show yet: no person details, links, records or answers. */
export function isEmptyProfile({ profile, answers }: ProfileData): boolean {
  return (
    profile.person.updatedAt === null &&
    profile.links.length === 0 &&
    profile.experiences.length === 0 &&
    profile.education.length === 0 &&
    profile.facts.length === 0 &&
    profile.skills.length === 0 &&
    answers.length === 0
  );
}
