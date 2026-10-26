// ST-13b rebuilt learn_exam (0015, the project's first table rebuild). On a
// database that had exams before it, every exam keeps every field, comes out
// as made in Claude Code, and the table's triggers still hold (0016).
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const db = () => env.RESTORE_DB;
const BASE = "Study Lab/cs-fundamentals/big-o-notation/big-o-notation";

describe("the learn_exam rebuild", () => {
  it("keeps every exam made before it, field for field, as a Claude Code exam", async () => {
    const before = env.TEST_MIGRATIONS.filter((m) => m.name < "0015");
    expect(before.length).toBe(15);
    await applyD1Migrations(db(), before);
    await db().batch([
      db().prepare(
        "INSERT INTO skill (id, name, created_at) VALUES ('s1', 'Big-O notation', 't')",
      ),
      db().prepare(
        "INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('t1', 'CS-01', 'area-cs', 's1', 't', 't')",
      ),
      db().prepare(
        `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES
          ('e1', 't1', 'fast_track', 1, '${BASE}__fast-track__exam-1.md', '${BASE}__fast-track__exam-1.pdf', '2026-10-20T10:00:00.000Z'),
          ('e2', 't1', 'fast_track', 2, '${BASE}__fast-track__exam-2.md', '${BASE}__fast-track__exam-2.pdf', '2026-10-21T10:00:00.000Z')`,
      ),
      db().prepare(
        "UPDATE learn_exam SET grade = 85, graded_at = '2026-10-20T11:00:00.000Z' WHERE id = 'e1'",
      ),
    ]);
    const rows = async () =>
      (
        await db()
          .prepare(
            "SELECT id, topic_id, level, attempt, md_path, pdf_path, created_at, grade, graded_at FROM learn_exam ORDER BY id",
          )
          .all()
      ).results;
    const old = await rows();
    expect(old).toHaveLength(2);

    await applyD1Migrations(db(), env.TEST_MIGRATIONS);
    expect(await rows()).toEqual(old);
    const sources = await db()
      .prepare("SELECT DISTINCT source FROM learn_exam")
      .all<{ source: string }>();
    expect(sources.results).toEqual([{ source: "claude" }]);

    // Its triggers came back with it (and ST-14's were added since: 0019).
    const names = (
      await db()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'learn_exam' ORDER BY name",
        )
        .all<{ name: string }>()
    ).results.map((r) => r.name);
    expect(names).toEqual([
      "learn_exam_attempt_next",
      "learn_exam_created_live",
      "learn_exam_created_ungraded",
      "learn_exam_deleted_not_graded",
      "learn_exam_files_removed_once",
      "learn_exam_grade_once",
      "learn_exam_pdf_layout",
      "learn_exam_pdf_layout_update",
      "learn_exam_removed_stays_deleted",
    ]);
    await expect(
      db()
        .prepare(
          `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('e9', 't1', 'fast_track', 9, '${BASE}__x.md', '${BASE}__x.pdf', 't')`,
        )
        .run(),
    ).rejects.toThrow("learn_exam_attempt_next");
    await expect(
      db()
        .prepare("UPDATE learn_exam SET graded_at = 'later' WHERE id = 'e1'")
        .run(),
    ).rejects.toThrow("learn_exam_grade");
  });
});
