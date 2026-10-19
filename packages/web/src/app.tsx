// The composition root: the one place that knows every lab. Core receives the
// list through LabsProvider and never imports a lab itself.
import { Outlet, type RouteObject } from "react-router";
import { ToastProvider } from "./components/ui";
import { AuthorizeScreen } from "./core/AuthorizeScreen";
import { FocusFrame } from "./core/FocusFrame";
import { LoginScreen } from "./core/LoginScreen";
import { type LabDefinition, LabsProvider } from "./core/lab-registry";
import { RequireSession } from "./core/RequireSession";
import { RouteError } from "./core/RouteError";
import { Shell } from "./core/Shell";
import { NotFoundScreen, platformLab } from "./core/screens";
import { UpdatePrompt } from "./core/UpdatePrompt";
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
    // Outside the shell and the session gate.
    {
      path: "/login",
      element: <LoginScreen />,
      errorElement: <RouteError bare />,
    },
    // Claude's sign-in: the Worker serves this URL with the consent details.
    {
      path: "/oauth/authorize",
      element: <AuthorizeScreen />,
      errorElement: <RouteError bare />,
    },
    {
      element: (
        <ToastProvider>
          <LabsProvider labs={labs}>
            <RequireSession>
              <Outlet />
            </RequireSession>
            <UpdatePrompt />
          </LabsProvider>
        </ToastProvider>
      ),
      // The shell itself failed: an error page without it.
      errorElement: <RouteError bare />,
      children: [
        {
          element: <Shell />,
          children: [
            {
              // A screen failed: the error stands in for it and the shell stays.
              // One boundary for every screen, so a new tab can't miss it.
              errorElement: <RouteError />,
              children: [
                ...labs.flatMap((lab) =>
                  lab.tabs.map((tab) => ({
                    path: tab.path,
                    element: tab.screen,
                  })),
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
        // Full-screen routes (the course reader): no rail, no bottom tabs.
        {
          element: <FocusFrame />,
          children: [
            {
              errorElement: <RouteError bare />,
              children: labs.flatMap((lab) =>
                (lab.focus ?? []).map((route) => ({
                  path: route.path,
                  element: route.screen,
                })),
              ),
            },
          ],
        },
      ],
    },
  ];
}

export const routes = createRoutes();
