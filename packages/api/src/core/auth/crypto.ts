import { bytesToBase64 } from "@projects-lab/shared";

const encoder = new TextEncoder();

/**
 * Constant-time string comparison. A length mismatch still runs one full
 * comparison (of `a` with itself), so the time doesn't reveal which check failed.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.byteLength !== right.byteLength) {
    crypto.subtle.timingSafeEqual(left, left);
    return false;
  }
  return crypto.subtle.timingSafeEqual(left, right);
}

/** base64(HMAC-SHA256(key, message)). */
export async function hmacBase64(
  key: string,
  message: string,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return bytesToBase64(new Uint8Array(signature));
}
