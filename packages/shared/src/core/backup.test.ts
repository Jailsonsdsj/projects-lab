import { describe, expect, it } from "vitest";
import {
  BACKUP_VERSION,
  type BackupData,
  backupDue,
  restoreStatements,
} from "./backup";

const backup = (tables: BackupData["tables"]): BackupData => ({
  app: "projects-lab",
  version: BACKUP_VERSION,
  exportedAt: "t",
  migrations: [],
  tables,
  files: [],
});

describe("backupDue", () => {
  const now = "2026-10-31T00:00:00.000Z";
  it("is due with no backup, or after 30 days", () => {
    expect(backupDue(null, now)).toBe(true);
    expect(backupDue("2026-09-30T23:59:59.000Z", now)).toBe(true);
    expect(backupDue("2026-10-01T00:00:00.000Z", now)).toBe(false);
    expect(backupDue("2026-10-30T00:00:00.000Z", now)).toBe(false);
  });
});

describe("restoreStatements", () => {
  it("loads exams ungraded in attempt order, then grades them", () => {
    const sql = restoreStatements(
      backup({
        learn_exam: [
          {
            id: "e2",
            topic_id: "t1",
            level: "essential",
            attempt: 2,
            grade: 85,
            graded_at: "g2",
          },
          {
            id: "e1",
            topic_id: "t1",
            level: "essential",
            attempt: 1,
            grade: 60,
            graded_at: "g1",
          },
          {
            id: "e3",
            topic_id: "t1",
            level: "fast_track",
            attempt: 1,
            grade: null,
            graded_at: null,
          },
        ],
      }),
    );
    expect(sql).toEqual([
      expect.stringMatching(/^INSERT INTO learn_exam .*'e1'.*NULL, NULL\)$/),
      "UPDATE learn_exam SET grade = 60, graded_at = 'g1' WHERE id = 'e1'",
      expect.stringMatching(/^INSERT INTO learn_exam .*'e2'/),
      "UPDATE learn_exam SET grade = 85, graded_at = 'g2' WHERE id = 'e2'",
      expect.stringMatching(/^INSERT INTO learn_exam .*'e3'/),
    ]);
  });

  it("loads a removed fact live and marks it removed last (a selection may cite it)", () => {
    const sql = restoreStatements(
      backup({
        career_fact: [{ id: "f1", text: "x", deleted_at: "d1" }],
        career_job_item: [{ job_id: "j1", item_kind: "fact", item_id: "f1" }],
      }),
    );
    expect(sql).toEqual([
      "INSERT INTO career_fact (id, text, deleted_at) VALUES ('f1', 'x', NULL)",
      "INSERT INTO career_job_item (job_id, item_kind, item_id) VALUES ('j1', 'fact', 'f1')",
      "UPDATE career_fact SET deleted_at = 'd1' WHERE id = 'f1'",
    ]);
  });

  it("updates the seeded areas in place, and quotes text safely", () => {
    const [skill, area] = restoreStatements(
      backup({
        skill: [{ id: "s1", name: "O'Reilly", created_at: "t" }],
        learn_area: [
          { id: "area-cs", prefix: "CS", name: "CS", position: 1, next_seq: 4 },
        ],
      }),
    );
    expect(area).toBe(
      "INSERT INTO learn_area (id, prefix, name, position, next_seq) VALUES ('area-cs', 'CS', 'CS', 1, 4) ON CONFLICT (id) DO UPDATE SET name = excluded.name, position = excluded.position, next_seq = excluded.next_seq",
    );
    expect(skill).toBe(
      "INSERT INTO skill (id, name, created_at) VALUES ('s1', 'O''Reilly', 't')",
    );
  });

  it("follows the table order whatever order the file lists them in", () => {
    const sql = restoreStatements(
      backup({
        career_drill: [{ id: "d" }],
        user: [{ id: "u" }],
        skill: [{ id: "s" }],
      }),
    );
    expect(sql.map((s) => s.split(" ")[2])).toEqual([
      "user",
      "skill",
      "career_drill",
    ]);
  });
});
