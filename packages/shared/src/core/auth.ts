// Auth wire contracts (docs/prd/01-identity-and-access.md). One schema, two
// consumers: the Worker validates requests, the browser types its fetches.
import { z } from "zod";
import { base64ToBytes } from "./bytes";
import { AUTH_KEY_BYTES, KDF_ITERATIONS, SALT_BYTES } from "./kdf";

/** GET /api/auth/salt */
export const saltResponseSchema = z.object({
  salt: z.string().min(1),
  iterations: z.number().int().positive(),
});
export type SaltResponse = z.infer<typeof saltResponseSchema>;

/** POST /api/auth/login. `authKey` is base64 of the 32-byte KDF output. */
export const loginRequestSchema = z.object({
  authKey: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** The session JWT, also set as the `pl_session` cookie. */
export const loginResponseSchema = z.object({
  token: z.string().min(1),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** base64 that decodes to exactly `bytes` bytes. */
const base64Of = (bytes: number) =>
  z.string().refine((value) => {
    try {
      return base64ToBytes(value).length === bytes;
    } catch {
      return false;
    }
  }, `base64 of ${bytes} bytes`);

/**
 * POST /api/auth/passphrase, sent with an Idempotency-Key. The browser derives
 * both keys; `currentAuthKey` is checked like a login key (anything that isn't
 * the right key is the same 401). The new cost can't be below KDF_ITERATIONS.
 * Answered with a LoginResponse: the fresh session for this device.
 */
export const changePassphraseRequestSchema = z.object({
  currentAuthKey: z.string().min(1),
  newAuthKey: base64Of(AUTH_KEY_BYTES),
  newSalt: base64Of(SALT_BYTES),
  newIterations: z.number().int().min(KDF_ITERATIONS),
});
export type ChangePassphraseRequest = z.infer<
  typeof changePassphraseRequestSchema
>;

export const authErrorCodes = [
  "bad_request",
  "invalid_passphrase",
  "unauthorized",
  "not_provisioned",
  "too_many_attempts",
] as const;

export const authErrorSchema = z.object({
  error: z.enum(authErrorCodes),
});
export type AuthError = z.infer<typeof authErrorSchema>;
