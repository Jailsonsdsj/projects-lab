// /oauth/authorize (F-14): Claude's sign-in. The provider validates the request
// and keeps it server-side; this page signs the owner in with the passphrase
// (KDF in the browser, the login's rate limit) and records the decision.
// docs/prd/01-identity-and-access.md, architecture §6.2; the library's
// docs/consent-page.md for which errors to redirect and which to show.

import {
  AuthorizationError,
  CimdFetchError,
} from "@cloudflare/workers-oauth-provider";
import {
  type AuthError,
  type AuthorizePage,
  authorizeDecisionSchema,
  OAUTH_CONSENT_ELEMENT_ID,
  OAUTH_CONSENT_EXPIRED,
  OAUTH_SCOPE,
} from "@projects-lab/shared";
import { Hono } from "hono";
import { getOwner } from "../auth/owner";
import { overRateLimit, verifyAuthKey } from "../auth/routes";
import { signingKey } from "../auth/session";
import { database } from "../db";

/** JSON inside <script>: `<` escaped, so client-chosen text can't close it. */
const scriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c");

/** The provider's cookies, without the Location meant for a redirect. */
function cookiesOnly(headers: Headers): Headers {
  const out = new Headers();
  for (const cookie of headers.getSetCookie()) out.append("Set-Cookie", cookie);
  return out;
}

const plainError = (message: string) =>
  new Response(message, {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

export function authorizeRoutes(clock: () => number = Date.now) {
  const app = new Hono<{ Bindings: Env }>();

  // The app's own page, at this URL, with the consent details in it.
  app.get("/authorize", async (c) => {
    const oauth = c.env.OAUTH_PROVIDER;
    try {
      const request = await oauth.parseAuthRequest(c.req.raw);
      const details = await oauth.describeConsent(request); // before KV writes
      const consent = await oauth.beginConsent(request);
      const page: AuthorizePage = {
        handle: consent.handle,
        clientName: details.clientName,
        clientDomain: details.clientDomain,
        redirectHost: details.redirectHost,
        redirectIsLoopback: details.redirectIsLoopback,
      };

      const shell = await c.env.ASSETS.fetch(new URL("/", c.req.url));
      const headers = new Headers(consent.headers); // cookie + no framing
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Cache-Control", "no-store");
      return new HTMLRewriter()
        .on("head", {
          element(head) {
            head.append(
              `<script type="application/json" id="${OAUTH_CONSENT_ELEMENT_ID}">${scriptJson(page)}</script>`,
              { html: true },
            );
          },
        })
        .transform(new Response(shell.body, { status: 200, headers }));
    } catch (error) {
      // Client and redirect URI validated: the client hears about it.
      if (error instanceof AuthorizationError && error.redirectTo)
        return c.redirect(error.redirectTo, 302);
      // Otherwise never redirect: shown here, as text.
      if (error instanceof AuthorizationError)
        return plainError(
          error.description ?? "This sign-in request isn't valid.",
        );
      if (error instanceof CimdFetchError)
        return plainError("This app could not be verified.");
      throw error;
    }
  });

  app.post("/authorize", async (c) => {
    // Outside any try: a missing key is misconfiguration, not a failed sign-in.
    const key = signingKey(c.env);
    const db = database(c.env);
    const oauth = c.env.OAUTH_PROVIDER;

    const parsed = authorizeDecisionSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success)
      return c.json<AuthError>({ error: "bad_request" }, 400);
    const decision = parsed.data;

    try {
      if (decision.decision === "deny") {
        const denied = await oauth.denyConsent(c.req.raw, decision.handle);
        return c.json(
          { redirectTo: denied.redirectTo },
          { headers: cookiesOnly(denied.headers) },
        );
      }

      // verify and allow: same bucket and order as the login, count first,
      // then check. The handle isn't consumed until allow with the right
      // passphrase, so a typo can be retried on the same page.
      const nowSeconds = Math.floor(clock() / 1000);
      const limited = await overRateLimit(c, db, key, nowSeconds);
      if (limited) return limited;
      const owner = await getOwner(db);
      const ok = await verifyAuthKey(
        decision.authKey,
        owner?.authKeyHash ?? null,
      );
      if (!owner || !ok)
        return c.json<AuthError>({ error: "invalid_passphrase" }, 401);
      // The sign-in step: the passphrase is right; consent comes next.
      if (decision.decision === "verify") return c.body(null, 204);

      const approved = await oauth.approveConsent(c.req.raw, decision.handle, {
        scope: [OAUTH_SCOPE],
      });
      const client = await oauth.lookupClient(approved.request.clientId);
      const { redirectTo } = await oauth.completeAuthorization({
        request: approved.request,
        userId: owner.id,
        // Read by the Connections screen (F-16) and the MCP audit (F-15).
        metadata: {
          clientName: client?.clientName ?? approved.request.clientId,
        },
        scope: [OAUTH_SCOPE],
        props: { userId: owner.id },
      });
      return c.json({ redirectTo }, { headers: cookiesOnly(approved.headers) });
    } catch (error) {
      // Expired, already used, or opened in another browser: start again.
      if (
        error instanceof AuthorizationError ||
        error instanceof CimdFetchError
      )
        return c.json({ error: OAUTH_CONSENT_EXPIRED }, 400);
      throw error;
    }
  });

  return app;
}
