import type { LabDefinition } from "../../core/lab-registry";
import { ComingScreen } from "../../core/screens";

// Until the lab's API exists its summary is honestly "no data yet": null.
const home = {
  load: async () => null,
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
  tabs: [
    {
      label: "Backlog",
      icon: "list",
      path: "/study",
      screen: <ComingScreen title="Backlog" icon="list" arrives={later} />,
    },
    {
      label: "Courses",
      icon: "book",
      path: "/study/courses",
      screen: <ComingScreen title="Courses" icon="book" arrives={later} />,
    },
    {
      label: "Grades",
      icon: "award",
      path: "/study/grades",
      screen: <ComingScreen title="Grades" icon="award" arrives={later} />,
    },
  ],
};
