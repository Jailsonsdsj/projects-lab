// Passphrase stretching (docs/prd/01-identity-and-access.md). The KDF runs on the
// device: the browser at login, scripts when provisioning or seeding. The Worker
// never calls deriveAuthKey; it only hashes the result with hashAuthKey.
import { base64ToBytes, bytesToBase64 } from "./bytes";

/**
 * The KDF cost for a NEW passphrase. This is the only file that spells it.
 * Login always uses the iterations stored on the user row, so raising this
 * later doesn't lock anyone out.
 */
export const KDF_ITERATIONS = 600_000;

/** Salt length in bytes. The salt isn't secret, only unique. */
export const SALT_BYTES = 16;

/** The derived authKey's length in bytes (PBKDF2-SHA256, 256 bits). */
export const AUTH_KEY_BYTES = 32;

/** Shortest passphrase accepted wherever one is chosen. */
export const PASSPHRASE_MIN_LENGTH = 12;

/** A fresh random salt, base64-encoded as `user.kdf_salt` stores it. */
export function generateSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** base64(PBKDF2-SHA256(passphrase, salt, iterations)), 32 bytes. */
export async function deriveAuthKey(
  passphrase: string,
  saltBase64: string,
  iterations: number,
): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(saltBase64) as BufferSource,
      iterations,
    },
    keyMaterial,
    AUTH_KEY_BYTES * 8,
  );
  return bytesToBase64(new Uint8Array(bits));
}

/**
 * base64(SHA-256(authKey bytes)): the value stored in `user.auth_key_hash`.
 * Cheap enough for the Worker; throws if `authKeyBase64` isn't base64.
 */
export async function hashAuthKey(authKeyBase64: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    base64ToBytes(authKeyBase64) as BufferSource,
  );
  return bytesToBase64(new Uint8Array(digest));
}
