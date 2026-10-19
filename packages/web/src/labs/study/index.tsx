import { labSummaryResponseSchema } from "@projects-lab/shared";
import { apiFetch } from "../../core/api";
import type { LabDefinition } from "../../core/lab-registry";
import { ComingScreen } from "../../core/screens";
import { BacklogScreen } from "./BacklogScreen";
import { CourseReader } from "./CourseReader";
import { CoursesScreen } from "./CoursesScreen";
import { ExamViewer } from "./ExamViewer";

// Home's Study card (00-platform): in progress, not started, average grade and
// "Continue". null while the backlog is empty, which Home shows as empty.
const home = {
  load: async (signal: AbortSignal) => {
    const response = await apiFetch("/api/study/summary", { signal });
    if (!response.ok)
      throw new Error(`GET /api/study/summary: ${response.status}`);
    return labSummaryResponseSchema.parse(await response.json());
  },
  emptyText:
    "No courses yet. Ask Claude to plan a topic and it lands in your backlog.",
};

const later = "Study Lab's screens arrive in its own phase.";

export const studyLab: LabDefinition = {
  id: "study",
  name: "Study Lab",
  shortName: "Study",
  description: "Backlog, courses, grades",
  icon: "book",
  home,
  focus: [
    { path: "/study/courses/:courseId", screen: <CourseReader /> },
    { path: "/study/exams/:examId", screen: <ExamViewer /> },
  ],
  tabs: [
    {
      label: "Backlog",
      icon: "list",
      path: "/study",
      screen: <BacklogScreen />,
    },
    {
      label: "Courses",
      icon: "book",
      path: "/study/courses",
      screen: <CoursesScreen />,
    },
    {
      label: "Grades",
      icon: "award",
      path: "/study/grades",
      screen: <ComingScreen title="Grades" icon="award" arrives={later} />,
    },
  ],
};
