import type { LabDefinition } from "../../core/lab-registry";
import { ComingScreen } from "../../core/screens";

// Until the lab's API exists its summary is honestly "no data yet": null.
const home = {
  load: async () => null,
  emptyText: "No jobs tracked yet. Ask Claude to map a posting you like.",
};

const later = "Career Lab's screens arrive in its own phase.";

export const careerLab: LabDefinition = {
  id: "career",
  name: "Career Lab",
  shortName: "Career",
  description: "Profile, skills, job readiness",
  icon: "briefcase",
  home,
  tabs: [
    {
      label: "Jobs",
      icon: "target",
      path: "/career",
      screen: <ComingScreen title="Jobs" icon="target" arrives={later} />,
    },
    {
      label: "Skills",
      icon: "award",
      path: "/career/skills",
      screen: <ComingScreen title="Skills" icon="award" arrives={later} />,
    },
    {
      label: "Profile",
      icon: "user",
      path: "/career/profile",
      screen: <ComingScreen title="Profile" icon="user" arrives={later} />,
    },
    {
      label: "Documents",
      icon: "file",
      path: "/career/documents",
      screen: <ComingScreen title="Documents" icon="file" arrives={later} />,
    },
  ],
};
