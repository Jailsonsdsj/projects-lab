-- Study Lab invariants that need triggers (docs/prd/99-data-model.md § Study Lab).
-- A RAISE(ABORT) here means the calling code is wrong; never drop a trigger.

-- S-4: an area is never deleted, and its prefix never changes (topic codes carry it).
CREATE TRIGGER `learn_area_no_delete`
BEFORE DELETE ON `learn_area`
BEGIN
  SELECT RAISE(ABORT, 'learn_area_no_delete: areas are never deleted');
END;
--> statement-breakpoint

CREATE TRIGGER `learn_area_prefix_fixed`
BEFORE UPDATE OF `prefix` ON `learn_area`
WHEN NEW.`prefix` IS NOT OLD.`prefix`
BEGIN
  SELECT RAISE(ABORT, 'learn_area_prefix_fixed: an area prefix never changes');
END;
--> statement-breakpoint

-- S-9: a topic is never hard-deleted (removal is deleted_at, so its code stays
-- taken), and its area and code never change.
CREATE TRIGGER `learn_topic_no_delete`
BEFORE DELETE ON `learn_topic`
BEGIN
  SELECT RAISE(ABORT, 'learn_topic_no_delete: set deleted_at instead');
END;
--> statement-breakpoint

CREATE TRIGGER `learn_topic_fixed`
BEFORE UPDATE OF `area_id`, `code` ON `learn_topic`
WHEN NEW.`area_id` IS NOT OLD.`area_id` OR NEW.`code` IS NOT OLD.`code`
BEGIN
  SELECT RAISE(ABORT, 'learn_topic_fixed: a topic keeps its area and code');
END;
--> statement-breakpoint

-- S-14: a new attempt is one past the topic's highest at that level, like the
-- exam file names. Attempts never skip or repeat. NULL is left to the column's
-- NOT NULL, so that error names the column.
CREATE TRIGGER `learn_exam_attempt_next`
BEFORE INSERT ON `learn_exam`
WHEN NEW.`attempt` IS NOT NULL AND NEW.`attempt` IS NOT COALESCE(
  (SELECT MAX(e.`attempt`) FROM `learn_exam` e
    WHERE e.`topic_id` = NEW.`topic_id` AND e.`level` = NEW.`level`),
  0) + 1
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_attempt_next: an attempt is one past the last at its level');
END;
--> statement-breakpoint

-- S-16: an exam is created ungraded. grade (integer tenths 0..100) and graded_at
-- are set together; once graded, grade can be corrected but never cleared, and
-- graded_at never changes. A trigger, not a CHECK, because grade is nullable.
CREATE TRIGGER `learn_exam_created_ungraded`
BEFORE INSERT ON `learn_exam`
WHEN NEW.`grade` IS NOT NULL OR NEW.`graded_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_grade: an exam is created ungraded');
END;
--> statement-breakpoint

CREATE TRIGGER `learn_exam_grade_once`
BEFORE UPDATE OF `grade`, `graded_at` ON `learn_exam`
WHEN (NEW.`grade` IS NULL) <> (NEW.`graded_at` IS NULL)
  OR (NEW.`grade` IS NOT NULL
      AND (typeof(NEW.`grade`) <> 'integer' OR NEW.`grade` < 0 OR NEW.`grade` > 100))
  OR (OLD.`graded_at` IS NOT NULL AND NEW.`graded_at` IS NOT OLD.`graded_at`)
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_grade: grade and graded_at set together, grade 0..100, graded_at fixed');
END;
