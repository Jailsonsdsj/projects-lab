// /api/backup (H-02, docs/prd/90-services.md § Backup): the owner's backup,
// read with a session only (an OAuth token can't reach it; no tool exports).
// The Worker sends the rows and the list of files; the browser fetches each
// file and saves one JSON (no file work here: 10 ms CPU). `done` records when,
// on the server: last_exported_at is never kept in the browser.
import {
  BACKUP_TABLES,
  BACKUP_VERSION,
  type BackupData,
  type BackupRow,
} from "@projects-lab/shared";
import { Hono } from "hono";
import { type AuthVariables, requireAuth } from "./auth/require-auth";
import { database } from "./db";
import { idempotent } from "./idempotency";

/** Outside any try: a missing binding names its fix. */
function bucket(env: Env): R2Bucket {
  if (!env.FILES)
    throw new Error(
      "R2 binding FILES is missing in this environment: add r2_buckets FILES to wrangler.jsonc (preview gets its own in G-03)",
    );
  return env.FILES;
}

async function migrations(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT name FROM d1_migrations ORDER BY id")
    .all<{ name: string }>();
  return results.map((r) => r.name);
}

export async function backupData(
  db: D1Database,
  files: R2Bucket,
  now: Date,
): Promise<BackupData> {
  const read = await db.batch(
    BACKUP_TABLES.map((table) =>
      db.prepare(`SELECT * FROM ${table} ORDER BY rowid`),
    ),
  );
  const objects: BackupData["files"] = [];
  let cursor: string | undefined;
  do {
    const page = await files.list({ cursor, include: ["httpMetadata"] });
    for (const object of page.objects)
      objects.push({
        key: object.key,
        contentType:
          object.httpMetadata?.contentType ?? "application/octet-stream",
        size: object.size,
      });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return {
    app: "projects-lab",
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    migrations: await migrations(db),
    tables: Object.fromEntries(
      BACKUP_TABLES.map((table, i) => [
        table,
        (read[i]?.results ?? []) as BackupRow[],
      ]),
    ) as BackupData["tables"],
    files: objects,
  };
}

export function backupRoutes() {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

  app.get("/", requireAuth, async (c) => {
    const row = await database(c.env)
      .prepare(
        "SELECT last_exported_at AS lastExportedAt FROM user WHERE id = ?",
      )
      .bind(c.get("userId"))
      .first<{ lastExportedAt: string | null }>();
    return c.json({ lastExportedAt: row?.lastExportedAt ?? null });
  });

  app.get("/data", requireAuth, async (c) => {
    const files = bucket(c.env);
    return c.json(await backupData(database(c.env), files, new Date()));
  });

  // R2 keys have slashes ("profile/photo.jpg"): everything after /files/.
  app.get("/files/*", requireAuth, async (c) => {
    const files = bucket(c.env);
    const key = decodeURIComponent(c.req.path.replace(/^.*?\/files\//, ""));
    const object = key ? await files.get(key) : null;
    if (!object)
      return c.json({ error: "not_found", message: `No file ${key}` }, 404);
    return c.body(object.body, 200, {
      "Content-Type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, no-store",
    });
  });

  // After the browser saved the file: when, on the server.
  app.post(
    "/done",
    requireAuth,
    idempotent("POST /api/backup/done"),
    async (c) => {
      const now = new Date().toISOString();
      await database(c.env)
        .prepare("UPDATE user SET last_exported_at = ? WHERE id = ?")
        .bind(now, c.get("userId"))
        .run();
      return c.json({ lastExportedAt: now });
    },
  );

  return app;
}
