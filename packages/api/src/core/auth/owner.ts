export type Owner = {
  id: string;
  authKeyHash: string;
  kdfSalt: string;
  kdfIterations: number;
  sessionVersion: number;
};

/** The single owner, read deterministically (oldest first, then by id). */
export async function getOwner(db: D1Database): Promise<Owner | null> {
  return db
    .prepare(
      `SELECT id, auth_key_hash AS authKeyHash, kdf_salt AS kdfSalt,
              kdf_iterations AS kdfIterations, session_version AS sessionVersion
       FROM user ORDER BY created_at, id LIMIT 1`,
    )
    .first<Owner>();
}

/** The current session version for `userId`, or null if there is no such user. */
export async function getSessionVersion(
  db: D1Database,
  userId: string,
): Promise<number | null> {
  const row = await db
    .prepare("SELECT session_version AS sv FROM user WHERE id = ?")
    .bind(userId)
    .first<{ sv: number }>();
  return row?.sv ?? null;
}
