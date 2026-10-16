// Signed uploads (F-18; docs/prd/02-integration.md "Uploads", architecture
// §6.4). core_create_upload records what a file will be and signs a one-time
// URL; the PUT checks everything before a byte reaches R2. The URL is its own
// credential: it authorizes exactly one PUT of the declared file.
import {
  type CreatedUpload,
  type CreateUploadInput,
  UPLOAD_MAX_BYTES,
  UPLOAD_TTL_SECONDS,
  type UploadErrorCode,
} from "@projects-lab/shared";
import { constantTimeEqual, hmacBase64 } from "./auth/crypto";
import { publicOrigin } from "./oauth/origin";

/** Read outside any try: a missing key names its fix. */
export function uploadSigningKey(env: { UPLOAD_SIGNING_KEY?: string }): string {
  const key = env.UPLOAD_SIGNING_KEY;
  if (!key)
    throw new Error(
      "UPLOAD_SIGNING_KEY is not set. Locally: add it to packages/api/.dev.vars. " +
        "In production the owner runs `wrangler secret put UPLOAD_SIGNING_KEY`.",
    );
  return key;
}

/** The R2 bucket uploads go to. */
export function uploadBucket(env: { FILES?: R2Bucket }): R2Bucket {
  if (!env.FILES)
    throw new Error("env.FILES is not bound: check wrangler.jsonc");
  return env.FILES;
}

const base64url = (base64: string) =>
  base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const sign = async (key: string, id: string, exp: number) =>
  base64url(await hmacBase64(key, `upload.${id}.${exp}`));

/** Letters, digits, `.`, `-` and `_`; everything else becomes `_`. */
export const safeFilename = (name: string) =>
  name.replace(/[^\w.-]/g, "_").replace(/^\.+/, "_");

/** Records the upload and returns its one-time URL (10 minutes). */
export async function createUpload(
  db: D1Database,
  env: Env,
  input: CreateUploadInput,
  nowMs: number,
): Promise<CreatedUpload> {
  const key = uploadSigningKey(env);
  const id = crypto.randomUUID();
  const now = Math.floor(nowMs / 1000);
  const exp = now + UPLOAD_TTL_SECONDS;
  const filename = safeFilename(input.filename);
  await db
    .prepare(
      `INSERT INTO upload (id, kind, filename, content_type, bytes, r2_key, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.kind,
      filename,
      input.contentType,
      input.bytes,
      `uploads/${id}/${filename}`,
      new Date(now * 1000).toISOString(),
      new Date(exp * 1000).toISOString(),
    )
    .run();
  const token = `${id}.${exp}.${await sign(key, id, exp)}`;
  return {
    uploadId: id,
    uploadUrl: `${publicOrigin(env)}/api/uploads/${token}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export type UploadResult =
  | { ok: true; uploadId: string }
  | {
      ok: false;
      status: 403 | 409 | 410 | 413 | 415;
      error: UploadErrorCode;
      message: string;
    };

const refuse = (
  status: 403 | 409 | 410 | 413 | 415,
  error: UploadErrorCode,
  message: string,
): UploadResult => ({ ok: false, status, error, message });

/**
 * The PUT. In order: signature, expiry, the upload exists, Content-Type and
 * Content-Length are what was declared, then the one-time claim (a
 * conditional write). Only then does the body stream to R2, through a
 * FixedLengthStream of the declared size. If R2 fails after the claim, the
 * upload is spent (C-13 never un-uses one) and Claude asks for a new one.
 */
export async function acceptUpload(
  env: Env,
  db: D1Database,
  token: string,
  request: Request,
  nowMs: number,
): Promise<UploadResult> {
  const key = uploadSigningKey(env);
  const bucket = uploadBucket(env);

  const [id = "", expText = "", signature = ""] = token.split(".");
  const exp = Number(expText);
  const valid =
    Number.isInteger(exp) &&
    constantTimeEqual(signature, await sign(key, id, exp));
  if (!valid)
    return refuse(403, "upload_invalid", "This upload URL isn't valid.");
  if (Math.floor(nowMs / 1000) >= exp)
    return refuse(
      410,
      "upload_expired",
      "This upload URL expired (10 minutes). Ask for a new one.",
    );

  const upload = await db
    .prepare(
      `SELECT content_type AS contentType, bytes, r2_key AS r2Key, used_at AS usedAt
       FROM upload WHERE id = ?`,
    )
    .bind(id)
    .first<{
      contentType: string;
      bytes: number;
      r2Key: string;
      usedAt: string | null;
    }>();
  if (!upload)
    return refuse(403, "upload_invalid", "This upload URL isn't valid.");

  const type = request.headers.get("Content-Type")?.split(";")[0]?.trim();
  if (type?.toLowerCase() !== upload.contentType)
    return refuse(
      415,
      "upload_wrong_type",
      `Send it with Content-Type: ${upload.contentType}, as declared.`,
    );
  const length = Number(request.headers.get("Content-Length"));
  if (length !== upload.bytes || length > UPLOAD_MAX_BYTES || !request.body)
    return refuse(
      413,
      "upload_too_large",
      `Send exactly the declared ${upload.bytes} bytes.`,
    );

  const claimed = await db
    .prepare("UPDATE upload SET used_at = ? WHERE id = ? AND used_at IS NULL")
    .bind(new Date(nowMs).toISOString(), id)
    .run();
  if (claimed.meta.changes === 0)
    return refuse(409, "upload_used", "This upload already has its file.");

  // Both awaited together, so a failed copy can't go unhandled.
  const sized = new FixedLengthStream(upload.bytes);
  try {
    await Promise.all([
      request.body.pipeTo(sized.writable),
      bucket.put(upload.r2Key, sized.readable, {
        httpMetadata: { contentType: upload.contentType },
      }),
    ]);
  } catch {
    return refuse(
      413,
      "upload_too_large",
      `The body wasn't the declared ${upload.bytes} bytes; nothing was stored. Ask for a new upload.`,
    );
  }
  return { ok: true, uploadId: id };
}
