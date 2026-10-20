// Career Lab: mounts at /api/career (profile, photo, jobs, documents, job
// search and Home's card).
// Reaches Study Lab only through the StudyContract factory it's given at
// mount time, built per request with that request's D1.
import { Hono } from "hono";
import type { ApiLab, LabEnv } from "../../core/lab";
import { documentRoutes } from "./documents-routes";
import type { Study } from "./jobs";
import { jobRoutes } from "./jobs-routes";
import { photoRoutes } from "./photo";
import { profileRoutes } from "./routes";
import { searchRoutes } from "./search-routes";
import { careerTools } from "./tools";

export function careerLab(deps: { study: Study }): ApiLab {
  const routes = new Hono<LabEnv>();
  routes.route("/", jobRoutes(deps.study));
  routes.route("/", documentRoutes(deps.study));
  routes.route("/", profileRoutes());
  routes.route("/", photoRoutes());
  routes.route("/", searchRoutes());

  return { id: "career", routes, tools: careerTools(deps.study) };
}
