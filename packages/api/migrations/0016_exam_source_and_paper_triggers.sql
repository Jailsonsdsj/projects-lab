-- ST-13b: exams made in the app (docs/prd/99-data-model.md S-14, S-16, S-18
-- to S-22). 0015 rebuilt learn_exam, which took its triggers with it: the
-- first three are 0009's, unchanged. A RAISE(ABORT) here means the calling
-- code is wrong; never drop a trigger. NULL in a NOT NULL column is left to
-- that column, so its error names it.

-- S-14 (from 0009): a new attempt is one past the topic's highest at that level.
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

-- S-16 (from 0009): created ungraded; grade and graded_at set together, grade
-- 0..100, graded_at fixed once set.
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
--> statement-breakpoint

-- S-22: an exam without a .pdf was made in the app; a .pdf sits under
-- Study Lab/. Where an exam came from never changes.
CREATE TRIGGER `learn_exam_pdf_layout`
BEFORE INSERT ON `learn_exam`
WHEN (NEW.`pdf_path` IS NULL AND NEW.`source` <> 'app')
  OR (NEW.`pdf_path` IS NOT NULL AND NEW.`pdf_path` NOT GLOB 'Study Lab/*.pdf')
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_pdf: only an app exam has no .pdf; a .pdf is under Study Lab/');
END;
--> statement-breakpoint

CREATE TRIGGER `learn_exam_pdf_layout_update`
BEFORE UPDATE OF `pdf_path`, `source` ON `learn_exam`
WHEN NEW.`source` IS NOT OLD.`source`
  OR (NEW.`pdf_path` IS NULL AND NEW.`source` <> 'app')
  OR (NEW.`pdf_path` IS NOT NULL AND NEW.`pdf_path` NOT GLOB 'Study Lab/*.pdf')
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_pdf: an exam keeps its source; only an app exam has no .pdf');
END;
--> statement-breakpoint

-- S-18: a paper belongs to an exam made in the app.
CREATE TRIGGER `learn_exam_paper_app_only`
BEFORE INSERT ON `learn_exam_paper`
WHEN NEW.`exam_id` IS NOT NULL
  AND (SELECT e.`source` FROM `learn_exam` e WHERE e.`id` = NEW.`exam_id`) IS NOT 'app'
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_paper: only an exam made in the app has a paper');
END;
--> statement-breakpoint

-- S-19: what the model wrote (the questions, the key, the title, the settings)
-- never changes.
CREATE TRIGGER `learn_exam_paper_written_once`
BEFORE UPDATE OF `exam_id`, `title`, `settings_json`, `questions_json`, `key_json`, `created_at`
ON `learn_exam_paper`
WHEN NEW.`exam_id` IS NOT OLD.`exam_id`
  OR NEW.`title` IS NOT OLD.`title`
  OR NEW.`settings_json` IS NOT OLD.`settings_json`
  OR NEW.`questions_json` IS NOT OLD.`questions_json`
  OR NEW.`key_json` IS NOT OLD.`key_json`
  OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_paper: the questions and key never change');
END;
--> statement-breakpoint

-- S-20: the draft freezes once the answers are submitted.
CREATE TRIGGER `learn_exam_paper_draft_frozen`
BEFORE UPDATE OF `draft_json` ON `learn_exam_paper`
WHEN OLD.`submitted_at` IS NOT NULL AND NEW.`draft_json` IS NOT OLD.`draft_json`
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_paper: the answers are submitted');
END;
--> statement-breakpoint

-- S-21: submitted_at and results_json are set together, once; results are JSON.
-- A paper can be written submitted (a restore), never half-submitted.
CREATE TRIGGER `learn_exam_paper_submitted`
BEFORE INSERT ON `learn_exam_paper`
WHEN (NEW.`submitted_at` IS NULL) <> (NEW.`results_json` IS NULL)
  OR (NEW.`results_json` IS NOT NULL AND NOT json_valid(NEW.`results_json`))
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_paper_submitted: submitted_at and results set together, results JSON');
END;
--> statement-breakpoint

CREATE TRIGGER `learn_exam_paper_submitted_once`
BEFORE UPDATE OF `submitted_at`, `results_json` ON `learn_exam_paper`
WHEN (NEW.`submitted_at` IS NULL) <> (NEW.`results_json` IS NULL)
  OR (NEW.`results_json` IS NOT NULL AND NOT json_valid(NEW.`results_json`))
  OR (OLD.`submitted_at` IS NOT NULL
      AND (NEW.`submitted_at` IS NOT OLD.`submitted_at` OR NEW.`results_json` IS NOT OLD.`results_json`))
BEGIN
  SELECT RAISE(ABORT, 'learn_exam_paper_submitted: submitted_at and results set together, once');
END;
