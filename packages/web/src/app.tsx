// The composition root: the one place that knows every lab. Core receives the
// list through LabsProvider and never imports a lab itself.
import type { RouteObject } from "react-router";
import { ToastProvider } from "./components/ui";
import { type LabDefinition, LabsProvider } from "./core/lab-registry";
import { RouteError } from "./core/RouteError";
import { Shell } from "./core/Shell";
import { NotFoundScreen, platformLab } from "./core/screens";
import { careerLab } from "./labs/career";
import { studyLab } from "./labs/study";

/** Platform first, then labs in Home's order (00-platform: Study, then Career). */
export const LABS: readonly LabDefinition[] = [
  platformLab,
  studyLab,
  careerLab,
];

export function createRoutes(
  labs: readonly LabDefinition[] = LABS,
): RouteObject[] {
  return [
    {
      element: (
        <ToastProvider>
          <LabsProvider labs={labs}>
            <Shell />
          </LabsProvider>
        </ToastProvider>
      ),
      // The shell itself failed: an error page without it.
      errorElement: <RouteError bare />,
      children: [
        {
          // A screen failed: the error stands in for it and the shell stays.
          // One boundary for every screen, so a new tab can't miss it.
          errorElement: <RouteError />,
          children: [
            ...labs.flatMap((lab) =>
              lab.tabs.map((tab) => ({ path: tab.path, element: tab.screen })),
            ),
            // Every component in every state (D-06). Loaded on first visit; not in navigation.
            {
              path: "/dev/ui",
              lazy: async () => ({
                Component: (await import("./dev/KitchenSink")).KitchenSink,
              }),
            },
            { path: "*", element: <NotFoundScreen /> },
          ],
        },
      ],
    },
  ];
}

export const routes = createRoutes();
