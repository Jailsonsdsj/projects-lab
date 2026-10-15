// The composition root: the one place that knows every lab. Core receives the
// list through LabsProvider and never imports a lab itself.
import type { RouteObject } from "react-router";
import { ToastProvider } from "./components/ui";
import { type LabDefinition, LabsProvider } from "./core/lab-registry";
import { Shell } from "./core/Shell";
import { platformLab } from "./core/screens";
import { careerLab } from "./labs/career";
import { studyLab } from "./labs/study";

/** Platform first, then labs in Home's order (00-platform: Study, then Career). */
export const LABS: readonly LabDefinition[] = [
  platformLab,
  studyLab,
  careerLab,
];

export const routes: RouteObject[] = [
  {
    element: (
      <ToastProvider>
        <LabsProvider labs={LABS}>
          <Shell />
        </LabsProvider>
      </ToastProvider>
    ),
    children: LABS.flatMap((lab) =>
      lab.tabs.map((tab) => ({ path: tab.path, element: tab.screen })),
    ),
  },
];
