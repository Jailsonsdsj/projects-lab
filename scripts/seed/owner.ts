// Prints the INSERT for the seed owner (run by scripts/seed.sh). The hash comes
// from the shared KDF, so the dev passphrase below works at login and no seed
// file spells the iteration count.
import {
  bytesToBase64,
  deriveAuthKey,
  hashAuthKey,
  KDF_ITERATIONS,
  SALT_BYTES,
} from "../../packages/shared/src/index.ts";

/** Local development only. Never used for a deployed owner (that's `pnpm provision`). */
export const DEV_PASSPHRASE = "projects-lab-dev";

// A fixed salt (all zero bytes) keeps every seed run identical.
const salt = bytesToBase64(new Uint8Array(SALT_BYTES));
const hash = await hashAuthKey(
  await deriveAuthKey(DEV_PASSPHRASE, salt, KDF_ITERATIONS),
);

console.log(
  "INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at, last_exported_at, session_version)\n" +
    `VALUES ('seed-user', '${hash}', '${salt}', ${KDF_ITERATIONS}, 'Europe/Lisbon', '2026-01-01T00:00:00.000Z', NULL, 0);`,
);
