// A session token as the Worker shapes it (header.payload.signature). The app
// never verifies the signature, only reads `exp`, so tests can make their own.
const base64url = (value: object) =>
  btoa(JSON.stringify(value))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const DAY_SECONDS = 24 * 60 * 60;

export function fakeToken({
  expiresInSeconds = DAY_SECONDS,
}: {
  expiresInSeconds?: number;
} = {}): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ sub: "owner", iat: now, exp: now + expiresInSeconds, sv: 0 }),
    "signature",
  ].join(".");
}
