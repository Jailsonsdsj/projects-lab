// pnpm tsx scripts/import-resume.ts <master-resume.md> [compare.md] [out-dir]
// CA-14: the master resume → one SQL file the owner runs once against
// production (`wrangler d1 execute … --remote --file`; that step is the
// owner's), and a report of what wasn't imported, what to confirm, and how a
// second copy (career-os's context/master-resume.md) differs. Every insert is
// guarded, so running the SQL twice changes nothing; it never deletes. The
// output holds personal data: scripts/out/ is git-ignored.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  compareResumes,
  parseMasterResume,
  resumeSql,
} from "../packages/shared/src/career/import";

const [source, compare, outDir = "scripts/out"] = process.argv.slice(2);
if (!source) {
  console.error(
    "usage: tsx scripts/import-resume.ts <master-resume.md> [compare.md] [out-dir]",
  );
  process.exit(2);
}

const now = new Date().toISOString();
const resume = parseMasterResume(readFileSync(source, "utf8"));
const statements = resumeSql(resume, now);
const facts = resume.experiences.flatMap((x) =>
  x.facts.map((f) => ({ ...f, where: `${x.title} · ${x.organization}` })),
);

const sql = [
  "-- CA-14: master resume → Projects Lab profile.",
  `-- Generated ${now} from ${path.basename(source)}. Safe to run twice; deletes nothing.`,
  `-- ${resume.experiences.length} experiences, ${facts.length} facts (${facts.filter((f) => !f.verified).length} unverified), ${resume.education.length} education, ${resume.links.length} links, ${resume.skills.length} declared skills.`,
  `${statements.join(";\n\n")};`,
  "",
].join("\n");

const report = [
  "# Master resume import: report",
  "",
  `Generated ${now} from \`${source}\`.`,
  "",
  "## Imported",
  "",
  `- Person: ${resume.person.fullName}, ${resume.person.location}`,
  `- Links: ${resume.links.map((l) => `${l.label} ${l.url}`).join(", ")}`,
  ...resume.education.map(
    (e) =>
      `- Education: ${e.degree}, ${e.field} · ${e.institution} · ${e.start}–${e.end ?? "in progress"}`,
  ),
  ...resume.experiences.map(
    (x) =>
      `- ${x.kind}: ${x.title} · ${x.organization} · ${x.start}–${x.end ?? "now"}: ${x.facts.length} facts${x.summary ? " (guidance kept in its summary)" : ""}`,
  ),
  `- Declared skills (level "working" for all; set real levels in the Skills tab): ${resume.skills.map((s) => s.name).join(", ")}`,
  "",
  "## Unverified facts: confirm before any document uses them",
  "",
  ...facts
    .filter((f) => !f.verified)
    .map((f) => `- ${f.where}: "${f.text}". To confirm: ${f.toConfirm}`),
  "",
  "## Not imported",
  "",
  ...resume.notImported.map((n) => `- ${n}`),
  "",
  "## Warnings",
  "",
  ...(resume.warnings.length
    ? resume.warnings.map((w) => `- ${w}`)
    : ["- None"]),
];

if (compare) {
  const other = parseMasterResume(readFileSync(compare, "utf8"));
  const diff = compareResumes(resume, other);
  report.push(
    "",
    `## Compared with \`${compare}\``,
    "",
    `- Facts only in the imported file: ${diff.onlyInFirst.length ? "" : "none"}`,
    ...diff.onlyInFirst.map((f) => `  - ${f}`),
    `- Facts only in the other file (merge them by hand if they're true): ${diff.onlyInSecond.length ? "" : "none"}`,
    ...diff.onlyInSecond.map((f) => `  - ${f}`),
    `- Guidance that differs: ${diff.guidanceDiffers.length ? "" : "none"}`,
    ...diff.guidanceDiffers.flatMap((g) => [
      `  - ${g.title}`,
      `    - imported: ${g.first || "(none)"}`,
      `    - other: ${g.second || "(none)"}`,
    ]),
  );
}

mkdirSync(outDir, { recursive: true });
const sqlPath = path.join(outDir, "import-master-resume.sql");
const reportPath = path.join(outDir, "import-master-resume.report.md");
writeFileSync(sqlPath, sql);
writeFileSync(reportPath, `${report.join("\n")}\n`);
console.log(
  `wrote ${sqlPath} (${statements.length} statements) and ${reportPath}`,
);
