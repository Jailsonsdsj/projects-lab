-- ST-14a: deleting an exam (docs/prd/99-data-model.md S-23 to S-26). The row
-- stays, so attempts keep counting (S-14); deleted_at hides it from every read
-- and files_removed_at records the nightly removal of its files. A
-- RAISE(ABORT) here means the calling code is wrong; never drop a trigger.

-- S-23: an exam is created live. A restore writes the stamps afterwards, in
-- order: grade, then deleted_at, then files_removed_at.
CREATE TRIGGER `learn_exam_created_live`
BEFORE INSERT ON `learn_exam`
WHEN NEW.`deleted_at` IS NOT NULL OR NEW.`files_removed_at` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_deleted: an exam is created live');
END;
--> statement-breakpoint

-- S-24: a deleted exam isn't graded.
CREATE TRIGGER `learn_exam_deleted_not_graded`
BEFORE UPDATE OF `grade`, `graded_at` ON `learn_exam`
WHEN OLD.`deleted_at` IS NOT NULL
  AND (NEW.`grade` IS NOT OLD.`grade` OR NEW.`graded_at` IS NOT OLD.`graded_at`)
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_deleted: a deleted exam is not graded');
END;
--> statement-breakpoint

-- S-25: files are removed only from a deleted exam, and that's recorded once.
CREATE TRIGGER `learn_exam_files_removed_once`
BEFORE UPDATE OF `files_removed_at` ON `learn_exam`
WHEN (NEW.`files_removed_at` IS NOT NULL AND NEW.`deleted_at` IS NULL)
  OR (OLD.`files_removed_at` IS NOT NULL AND NEW.`files_removed_at` IS NOT OLD.`files_removed_at`)
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_files_removed: only from a deleted exam, once');
END;
--> statement-breakpoint

-- S-26: once its files are removed, an exam stays deleted.
CREATE TRIGGER `learn_exam_removed_stays_deleted`
BEFORE UPDATE OF `deleted_at` ON `learn_exam`
WHEN OLD.`files_removed_at` IS NOT NULL AND NEW.`deleted_at` IS NOT OLD.`deleted_at`
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_deleted: its files are removed, so it stays deleted');
END;
