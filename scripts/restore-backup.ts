// pnpm tsx scripts/restore-backup.ts <projects-lab-backup.json> [out-dir]
// H-02: a backup downloaded from Settings → the SQL and files that put it back
// into an empty database and bucket with the same migrations (a fresh
// environment, or local D1 to check it). It prints the commands; running them
// with --remote is the owner's. The output holds personal data: scripts/out/
// is git-ignored.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  backupFileSchema,
  restoreStatements,
} from "../packages/shared/src/core/backup";

const [source, outDir = "scripts/out/restore"] = process.argv.slice(2);
if (!source) {
  console.error("usage: tsx scripts/restore-backup.ts <backup.json> [out-dir]");
  process.exit(2);
}

const backup = backupFileSchema.parse(JSON.parse(readFileSync(source, "utf8")));
const here = readdirSync("packages/api/migrations")
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.replace(/\.sql$/, ""))
  .sort();
const missing = backup.migrations.filter(
  (m) => !here.includes(m.replace(/\.sql$/, "")),
);
const extra = here.filter(
  (m) => !backup.migrations.some((b) => b.replace(/\.sql$/, "") === m),
);
if (missing.length) {
  console.error(
    `The backup has migrations this repo doesn't: ${missing.join(", ")}. Restore with the code it came from.`,
  );
  process.exit(1);
}
if (extra.length)
  console.warn(
    `Newer migrations here than in the backup (${extra.join(", ")}): apply them all first; the restore fills the tables they made.`,
  );

const statements = restoreStatements(backup);
mkdirSync(path.join(outDir, "files"), { recursive: true });
const sqlPath = path.join(outDir, "restore.sql");
writeFileSync(
  sqlPath,
  `-- H-02 restore of a backup exported ${backup.exportedAt}. Into an empty database with the same migrations.\n${statements.join(";\n")};\n`,
);
const puts = backup.files.map((file) => {
  const local = path.join(outDir, "files", file.key.replace(/\//g, "__"));
  const bytes = Buffer.from(file.base64, "base64");
  if (bytes.length !== file.size)
    throw new Error(
      `${file.key}: ${bytes.length} bytes, the backup says ${file.size}`,
    );
  writeFileSync(local, bytes);
  return { file, local };
});

/** As the commands below see it: run from packages/api. */
const fromApi = (file: string) =>
  path.relative("packages/api", path.resolve(file));

const rows = Object.values(backup.tables).reduce(
  (n, t) => n + (t as unknown[]).length,
  0,
);
console.log(
  `wrote ${sqlPath}: ${statements.length} statements, ${rows} rows; ${puts.length} file(s) in ${outDir}/files`,
);
console.log(
  "\nCheck it locally (a throwaway local D1, migrations applied first):",
);
console.log(
  `  cd packages/api && npx wrangler d1 execute projects-lab --local --file ${fromApi(sqlPath)}`,
);
for (const { file, local } of puts)
  console.log(
    `  cd packages/api && npx wrangler r2 object put projects-lab-images/${file.key} --file ${fromApi(local)} --content-type ${file.contentType} --local`,
  );
console.log("\nInto production (the owner's step; an empty database):");
console.log(
  `  cd packages/api && npx wrangler d1 execute projects-lab --remote --file ${fromApi(sqlPath)}`,
);
for (const { file, local } of puts)
  console.log(
    `  cd packages/api && npx wrangler r2 object put projects-lab-images/${file.key} --file ${fromApi(local)} --content-type ${file.contentType} --remote`,
  );
