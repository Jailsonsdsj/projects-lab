// Auth wire contracts (docs/prd/01-identity-and-access.md). One schema, two
// consumers: the Worker validates requests, the browser types its fetches.
import { z } from "zod";

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
