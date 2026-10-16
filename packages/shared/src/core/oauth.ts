// Claude's OAuth sign-in (docs/prd/01-identity-and-access.md, architecture
// §6.2): the Worker validates the request and serves the app's page with the
// consent details in it; the page signs the owner in (KDF in the browser) and
// posts the decision back.
import { z } from "zod";

/** The one scope: everything (PRD: "One scope: everything"). */
export const OAUTH_SCOPE = "projects-lab";

/** The id of the <script type="application/json"> holding the AuthorizePage. */
export const OAUTH_CONSENT_ELEMENT_ID = "oauth-consent";

/** What GET /oauth/authorize puts in the page. Client fields are chosen by
 *  whoever registered the client: render them as text, never as HTML. */
export interface AuthorizePage {
  /** Posted back; bound to this browser by a cookie, works once, 10 minutes. */
  handle: string;
  clientName: string;
  /** A metadata-document client's verified domain; absent when self-asserted. */
  clientDomain?: string;
  /** Where the tokens will go: the page must show it. */
  redirectHost: string;
  /** Tokens go to an app on this device: the page should warn. */
  redirectIsLoopback: boolean;
}

/** POST /oauth/authorize. `verify` checks the passphrase (the sign-in step,
 *  answered 204) without using the handle; `allow` checks it again and
 *  completes; `deny` needs no passphrase. Allow and deny answer `{ redirectTo }`. */
export const authorizeDecisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("verify"),
    handle: z.string().min(1),
    authKey: z.string().min(1),
  }),
  z.object({
    decision: z.literal("allow"),
    handle: z.string().min(1),
    authKey: z.string().min(1),
  }),
  z.object({ decision: z.literal("deny"), handle: z.string().min(1) }),
]);
export type AuthorizeDecision = z.infer<typeof authorizeDecisionSchema>;

export const authorizeResponseSchema = z.object({
  redirectTo: z.string().url(),
});

/** The consent page expired, was used, or was opened in another browser. */
export const OAUTH_CONSENT_EXPIRED = "consent_expired";
