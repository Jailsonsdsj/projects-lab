// The Connections screen's services (docs/prd/01-identity-and-access.md):
// grants come from the OAuth provider; last use from the mcp_call audit, which
// records writes only (PRD 02), so it's the client's last write.
import type {
  GrantSummary,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import type { Connection } from "@projects-lab/shared";

/** A metadata-document client's id is an https URL: its host is verified. */
function originOf(clientId: string, redirectUri?: string): string {
  try {
    const url = new URL(clientId);
    if (url.protocol === "https:") return url.hostname;
  } catch {}
  try {
    return redirectUri ? new URL(redirectUri).hostname : "";
  } catch {
    return "";
  }
}

/** Every grant the owner holds, across the provider's pages. */
async function allGrants(oauth: OAuthHelpers, userId: string) {
  const grants: GrantSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await oauth.listUserGrants(userId, { cursor });
    grants.push(...page.items);
    cursor = page.cursor;
  } while (cursor);
  return grants;
}

export async function listConnections(
  oauth: OAuthHelpers,
  db: D1Database,
  userId: string,
): Promise<Connection[]> {
  const grants = await allGrants(oauth, userId);

  const names = grants.map(
    (grant) =>
      (grant.metadata?.clientName as string | undefined) ?? grant.clientId,
  );
  const lastUse = new Map<string, string>();
  if (names.length > 0) {
    const rows = await db
      .prepare(
        `SELECT client_name AS name, MAX(created_at) AS at FROM mcp_call
         WHERE client_name IN (SELECT value FROM json_each(?))
         GROUP BY client_name`,
      )
      .bind(JSON.stringify([...new Set(names)]))
      .all<{ name: string; at: string }>();
    for (const row of rows.results) lastUse.set(row.name, row.at);
  }

  return grants
    .map((grant, i) => {
      const clientName = names[i] ?? grant.clientId;
      return {
        id: grant.id,
        clientName,
        origin: originOf(grant.clientId, grant.redirectUri),
        grantedAt: new Date(grant.createdAt * 1000).toISOString(),
        lastUsedAt: lastUse.get(clientName) ?? null,
      };
    })
    .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
}

/** Revokes one of the owner's grants: its tokens stop working at once.
 *  False when the owner holds no grant with that id. */
export async function revokeConnection(
  oauth: OAuthHelpers,
  grantId: string,
  userId: string,
): Promise<boolean> {
  const grants = await allGrants(oauth, userId);
  if (!grants.some((grant) => grant.id === grantId)) return false;
  await oauth.revokeGrant(grantId, userId);
  return true;
}
