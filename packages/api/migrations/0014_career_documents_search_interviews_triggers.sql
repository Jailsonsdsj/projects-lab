-- Career Lab invariants that need triggers, documents, search and interviews
-- (docs/prd/99-data-model.md § Career Lab, K-15 to K-28). The currency and period
-- lists mirror shared/career; a probe for each value keeps them in step. A
-- RAISE(ABORT) here means the calling code is wrong; never drop a trigger.

-- K-15: a selection item exists, live, in its kind's table (a new selection never
-- cites a removed item; a fact removed later stays, K-8). An unknown kind is left
-- to the CHECK, a NULL to the column.
CREATE TRIGGER `career_job_item_exists_insert`
BEFORE INSERT ON `career_job_item`
WHEN NEW.`item_id` IS NOT NULL AND NOT CASE NEW.`item_kind`
  WHEN 'fact' THEN EXISTS (SELECT 1 FROM `career_fact` WHERE `id` = NEW.`item_id` AND `deleted_at` IS NULL)
  WHEN 'experience' THEN EXISTS (SELECT 1 FROM `career_experience` WHERE `id` = NEW.`item_id` AND `deleted_at` IS NULL)
  WHEN 'education' THEN EXISTS (SELECT 1 FROM `career_education` WHERE `id` = NEW.`item_id` AND `deleted_at` IS NULL)
  WHEN 'skill' THEN EXISTS (SELECT 1 FROM `skill` WHERE `id` = NEW.`item_id` AND `deleted_at` IS NULL)
  ELSE 1 END
BEGIN
  SELECT RAISE(ABORT, 'career_job_item_exists: the item is a live fact, experience, education or skill');
END;
--> statement-breakpoint

CREATE TRIGGER `career_job_item_exists_update`
BEFORE UPDATE OF `item_kind`, `item_id` ON `career_job_item`
WHEN NEW.`item_id` IS NOT NULL AND NOT CASE NEW.`item_kind`
  WHEN 'fact' THEN EXISTS (SELECT 1 FROM `career_fact` WHERE `id` = NEW.`item_id` AND `deleted_at` IS NULL)
  WHEN 'experience' THEN EXISTS (SELECT 1 FROM `career_experience` WHERE `id` = NEW.`item_id` AND `deleted_at` IS NULL)
  WHEN 'education' THEN EXISTS (SELECT 1 FROM `career_education` WHERE `id` = NEW.`item_id` AND `deleted_at` IS NULL)
  WHEN 'skill' THEN EXISTS (SELECT 1 FROM `skill` WHERE `id` = NEW.`item_id` AND `deleted_at` IS NULL)
  ELSE 1 END
BEGIN
  SELECT RAISE(ABORT, 'career_job_item_exists: the item is a live fact, experience, education or skill');
END;
--> statement-breakpoint

-- K-16: a salary range is all unset, or whole units (integers) with min >= 0,
-- min <= max, a currency and a period from shared/career CURRENCIES and PAY_PERIODS.
CREATE TRIGGER `career_job_kit_salary_insert`
BEFORE INSERT ON `career_job_kit`
WHEN NOT (
  (NEW.`salary_min` IS NULL AND NEW.`salary_max` IS NULL AND NEW.`salary_currency` IS NULL AND NEW.`salary_period` IS NULL)
  OR (typeof(NEW.`salary_min`) = 'integer' AND typeof(NEW.`salary_max`) = 'integer'
    AND NEW.`salary_min` >= 0 AND NEW.`salary_min` <= NEW.`salary_max`
    AND NEW.`salary_currency` IS NOT NULL AND NEW.`salary_currency` IN ('BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF')
    AND NEW.`salary_period` IS NOT NULL AND NEW.`salary_period` IN ('hour', 'month', 'year')))
BEGIN
  SELECT RAISE(ABORT, 'career_job_kit_salary: integers, min <= max, a currency and a period; or none');
END;
--> statement-breakpoint

CREATE TRIGGER `career_job_kit_salary_update`
BEFORE UPDATE OF `salary_min`, `salary_max`, `salary_currency`, `salary_period` ON `career_job_kit`
WHEN NOT (
  (NEW.`salary_min` IS NULL AND NEW.`salary_max` IS NULL AND NEW.`salary_currency` IS NULL AND NEW.`salary_period` IS NULL)
  OR (typeof(NEW.`salary_min`) = 'integer' AND typeof(NEW.`salary_max`) = 'integer'
    AND NEW.`salary_min` >= 0 AND NEW.`salary_min` <= NEW.`salary_max`
    AND NEW.`salary_currency` IS NOT NULL AND NEW.`salary_currency` IN ('BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF')
    AND NEW.`salary_period` IS NOT NULL AND NEW.`salary_period` IN ('hour', 'month', 'year')))
BEGIN
  SELECT RAISE(ABORT, 'career_job_kit_salary: integers, min <= max, a currency and a period; or none');
END;
--> statement-breakpoint

-- K-21: the rate floor, its currency and period are set together, the floor an integer >= 0.
CREATE TRIGGER `career_search_criteria_rate_insert`
BEFORE INSERT ON `career_search_criteria`
WHEN NOT (
  (NEW.`rate_floor` IS NULL AND NEW.`rate_currency` IS NULL AND NEW.`rate_period` IS NULL)
  OR (typeof(NEW.`rate_floor`) = 'integer' AND NEW.`rate_floor` >= 0
    AND NEW.`rate_currency` IS NOT NULL AND NEW.`rate_currency` IN ('BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF')
    AND NEW.`rate_period` IS NOT NULL AND NEW.`rate_period` IN ('hour', 'month', 'year')))
BEGIN
  SELECT RAISE(ABORT, 'career_search_criteria_rate: floor, currency and period together; or none');
END;
--> statement-breakpoint

CREATE TRIGGER `career_search_criteria_rate_update`
BEFORE UPDATE OF `rate_floor`, `rate_currency`, `rate_period` ON `career_search_criteria`
WHEN NOT (
  (NEW.`rate_floor` IS NULL AND NEW.`rate_currency` IS NULL AND NEW.`rate_period` IS NULL)
  OR (typeof(NEW.`rate_floor`) = 'integer' AND NEW.`rate_floor` >= 0
    AND NEW.`rate_currency` IS NOT NULL AND NEW.`rate_currency` IN ('BRL', 'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF')
    AND NEW.`rate_period` IS NOT NULL AND NEW.`rate_period` IN ('hour', 'month', 'year')))
BEGIN
  SELECT RAISE(ABORT, 'career_search_criteria_rate: floor, currency and period together; or none');
END;
--> statement-breakpoint

-- K-23: an opening has a job exactly when it is tracked.
CREATE TRIGGER `career_opening_tracked_insert`
BEFORE INSERT ON `career_opening`
WHEN NEW.`status` IS NOT NULL AND (NEW.`status` = 'tracked') <> (NEW.`job_id` IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'career_opening_tracked: a job exactly when tracked');
END;
--> statement-breakpoint

CREATE TRIGGER `career_opening_tracked_update`
BEFORE UPDATE OF `status`, `job_id` ON `career_opening`
WHEN NEW.`status` IS NOT NULL AND (NEW.`status` = 'tracked') <> (NEW.`job_id` IS NOT NULL)
BEGIN
  SELECT RAISE(ABORT, 'career_opening_tracked: a job exactly when tracked');
END;
--> statement-breakpoint

-- K-26: a Drive file ID is 10..100 letters, digits, - and _ (shared/career DRIVE_FILE_ID).
CREATE TRIGGER `career_answer_drive_insert`
BEFORE INSERT ON `career_answer`
WHEN NEW.`drive_file_id` IS NOT NULL AND NOT (typeof(NEW.`drive_file_id`) = 'text'
  AND length(NEW.`drive_file_id`) BETWEEN 10 AND 100
  AND NEW.`drive_file_id` NOT GLOB '*[^A-Za-z0-9_-]*')
BEGIN
  SELECT RAISE(ABORT, 'career_answer_drive: a Drive file ID, 10..100 of A-Z a-z 0-9 - _');
END;
--> statement-breakpoint

CREATE TRIGGER `career_answer_drive_update`
BEFORE UPDATE OF `drive_file_id` ON `career_answer`
WHEN NEW.`drive_file_id` IS NOT NULL AND NOT (typeof(NEW.`drive_file_id`) = 'text'
  AND length(NEW.`drive_file_id`) BETWEEN 10 AND 100
  AND NEW.`drive_file_id` NOT GLOB '*[^A-Za-z0-9_-]*')
BEGIN
  SELECT RAISE(ABORT, 'career_answer_drive: a Drive file ID, 10..100 of A-Z a-z 0-9 - _');
END;
