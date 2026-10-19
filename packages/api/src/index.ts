// The composition root: the one place that knows every lab. It builds them,
// injects one lab's contract into another, and mounts them (architecture §4),
// then wraps everything in the OAuth provider (§6.2).

import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { OAUTH_SCOPE } from "@projects-lab/shared";
import { Hono } from "hono";
import { authRoutes } from "./core/auth/routes";
import { connectionsRoutes } from "./core/connections-routes";
import { database } from "./core/db";
import { type LabEnv, mountLabs } from "./core/lab";
import { authorizeRoutes } from "./core/oauth/authorize";
import { publicOrigin } from "./core/oauth/origin";
import { pruneOldRows } from "./core/prune";
import { careerLab } from "./labs/career";
import { studyLab } from "./labs/study";
import { mcpApiHandler } from "./mcp/server";
import { coreTools } from "./mcp/tools/core";

/** /api (session JWT) and the OAuth pages: everything but /mcp. */
export const app = new Hono<LabEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/auth", authRoutes());
app.route("/api/connections", connectionsRoutes());
app.route("/oauth", authorizeRoutes());

const study = studyLab();
const career = careerLab({ study: study.contract });
/** Every lab's MCP tools, for the MCP endpoint (F-15). */
export const labTools = mountLabs(app, [study, career]);

app.notFound((c) => c.json({ error: "not_found" }, 404));

// Misconfiguration (a missing secret or binding) lands here with a message that
// names the fix; it goes to the logs, never to the client.
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

/**
 * Two credentials, never interchangeable: /mcp takes only the provider's
 * OAuth access tokens (anything else is a 401 from the provider), and /api
 * takes only the session JWT (requireAuth can't verify an OAuth token).
 * Built on the first request, from PUBLIC_ORIGIN, once per isolate.
 */
function oauthProvider(env: Env): OAuthProvider<Env> {
  const origin = publicOrigin(env);
  return new OAuthProvider<Env>({
    apiRoute: "/mcp",
    apiHandler: mcpApiHandler([...coreTools, ...labTools]),
    defaultHandler: app,
    authorizeEndpoint: "/oauth/authorize",
    tokenEndpoint: "/oauth/token",
    // Claude's clients register by metadata document (CIMD, preferred by MCP)
    // or dynamically (DCR); both are on until SP-01 shows which ones they use.
    clientRegistrationEndpoint: "/oauth/register",
    clientIdMetadataDocumentEnabled: true,
    scopesSupported: [OAUTH_SCOPE],
    requiredScopes: [OAUTH_SCOPE],
    resourceMetadata: {
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
    },
  });
}

let provider: OAuthProvider<Env> | undefined;

export default {
  fetch(request, env, ctx) {
    provider ??= oauthProvider(env);
    return provider.fetch(request, env, ctx);
  },
  /** The daily Cron Trigger (wrangler.jsonc `triggers`): prune old rows. A
   *  failure throws, so it shows in the Worker's logs. */
  async scheduled(controller, env) {
    const pruned = await pruneOldRows(database(env), controller.scheduledTime);
    console.log("pruned", pruned);
  },
} satisfies ExportedHandler<Env>;
