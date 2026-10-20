import { labSummaryResponseSchema } from "@projects-lab/shared";
import { apiFetch } from "../../core/api";
import type { LabDefinition } from "../../core/lab-registry";
import { DocumentsScreen } from "./DocumentsScreen";
import { InterviewsScreen } from "./InterviewsScreen";
import { JobScreen } from "./JobScreen";
import { JobsScreen } from "./JobsScreen";
import { ProfileScreen } from "./ProfileScreen";
import { SkillsScreen } from "./SkillsScreen";

// Home's Career card (00-platform): the best-ready job, its required skills
// ready and gaps, opening its Job screen. null with no jobs.
const home = {
  load: async (signal: AbortSignal) => {
    const response = await apiFetch("/api/career/summary", { signal });
    if (!response.ok)
      throw new Error(`GET /api/career/summary: ${response.status}`);
    return labSummaryResponseSchema.parse(await response.json());
  },
  emptyText: "No jobs tracked yet. Ask Claude to map a posting you like.",
};

export const careerLab: LabDefinition = {
  id: "career",
  name: "Career Lab",
  shortName: "Career",
  description: "Profile, skills, job readiness",
  icon: "briefcase",
  home,
  pages: [
    { path: "/career/jobs/:jobId", screen: <JobScreen />, tab: "/career" },
  ],
  tabs: [
    {
      label: "Jobs",
      icon: "target",
      path: "/career",
      screen: <JobsScreen />,
    },
    {
      label: "Skills",
      icon: "award",
      path: "/career/skills",
      screen: <SkillsScreen />,
    },
    {
      label: "Profile",
      icon: "user",
      path: "/career/profile",
      screen: <ProfileScreen />,
    },
    {
      label: "Documents",
      icon: "file",
      path: "/career/documents",
      screen: <DocumentsScreen />,
    },
    {
      label: "Interviews",
      icon: "lightbulb",
      path: "/career/interviews",
      screen: <InterviewsScreen />,
    },
  ],
};
