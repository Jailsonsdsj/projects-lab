// The profile photo (docs/prd/20-career-profile.md, K-3): the app's only
// upload, with a session only (no tool takes a file). One object in R2 at
// profile/photo.<ext>; the person row keeps its key and type. The checks are
// header and byte comparisons: no image processing (10 ms CPU).
import {
  isPhotoType,
  PHOTO_MAX_BYTES,
  type PhotoType,
  photoKey,
} from "@projects-lab/shared/career";
import { type Context, Hono } from "hono";
import { database } from "../../core/db";
import { idempotent } from "../../core/idempotency";
import type { LabEnv } from "../../core/lab";

/** What each type's file starts with; a renamed file is refused. */
const SIGNATURES: Record<PhotoType, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) =>
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (x, i) => b[i] === x,
    ),
  "image/webp": (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP",
};
const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/** Outside any try: a missing binding names its fix instead of looking like a bad request. */
function bucket(env: Env): R2Bucket {
  if (!env.FILES)
    throw new Error(
      "R2 binding FILES is missing in this environment: add r2_buckets FILES to wrangler.jsonc (preview gets its own in G-03)",
    );
  return env.FILES;
}

const refuse = (c: Context, status: 413 | 415, message: string) =>
  c.json({ error: "bad_request", message }, status);

async function currentPhoto(db: D1Database) {
  return db
    .prepare("SELECT photo_key AS key FROM career_person WHERE id = 'person'")
    .first<{ key: string | null }>();
}

export function photoRoutes() {
  const app = new Hono<LabEnv>();

  app.put("/photo", idempotent("PUT /api/career/photo"), async (c) => {
    const files = bucket(c.env);
    const type =
      (c.req.header("Content-Type") ?? "").split(";")[0]?.trim() ?? "";
    if (!isPhotoType(type))
      return refuse(c, 415, "A photo is JPEG, PNG or WebP");
    const declared = Number(c.req.header("Content-Length"));
    if (declared > PHOTO_MAX_BYTES)
      return refuse(c, 413, "A photo is at most 2 MB");
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength > PHOTO_MAX_BYTES)
      return refuse(c, 413, "A photo is at most 2 MB");
    if (!SIGNATURES[type](bytes))
      return refuse(
        c,
        415,
        `The file isn't a ${type.slice("image/".length).toUpperCase()} image`,
      );

    const db = database(c.env);
    const key = photoKey(type);
    const previous = await currentPhoto(db);
    await files.put(key, bytes, { httpMetadata: { contentType: type } });
    await db
      .prepare(
        `INSERT INTO career_person (id, photo_key, photo_type, updated_at) VALUES ('person', ?1, ?2, ?3)
         ON CONFLICT (id) DO UPDATE SET photo_key = ?1, photo_type = ?2, updated_at = ?3`,
      )
      .bind(key, type, new Date().toISOString())
      .run();
    if (previous?.key && previous.key !== key) await files.delete(previous.key);
    return c.json({ photo: { type } });
  });

  app.get("/photo", async (c) => {
    const files = bucket(c.env);
    const current = await currentPhoto(database(c.env));
    const object = current?.key ? await files.get(current.key) : null;
    if (!object)
      return c.json({ error: "not_found", message: "No photo" }, 404);
    const etag = object.httpEtag;
    const headers = {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, no-cache",
      ETag: etag,
    };
    if (c.req.header("If-None-Match") === etag)
      return c.body(null, 304, headers);
    return c.body(object.body, 200, headers);
  });

  app.delete("/photo", idempotent("DELETE /api/career/photo"), async (c) => {
    const files = bucket(c.env);
    const db = database(c.env);
    const previous = await currentPhoto(db);
    await db
      .prepare(
        "UPDATE career_person SET photo_key = NULL, photo_type = NULL, updated_at = ? WHERE id = 'person'",
      )
      .bind(new Date().toISOString())
      .run();
    if (previous?.key) await files.delete(previous.key);
    return c.body(null, 204);
  });

  return app;
}
