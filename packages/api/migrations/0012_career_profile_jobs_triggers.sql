-- Career Lab invariants that need triggers, profile and jobs (docs/prd/99-data-model.md
-- § Career Lab, K-1 to K-14). Each guards a nullable column, a pairing or a history,
-- which a CHECK can't. A RAISE(ABORT) here means the calling code is wrong; never
-- drop a trigger. A NULL in a NOT NULL column is left to the column, so that error
-- names it: every WHEN below is false, not NULL, for those rows.

-- K-3: the photo's key and type are set together, the type one of JPEG, PNG,
-- WebP and the key its profile/photo.<ext> (shared/career photoKey).
CREATE TRIGGER `career_person_photo_insert`
BEFORE INSERT ON `career_person`
WHEN (NEW.`photo_key` IS NULL) <> (NEW.`photo_type` IS NULL)
  OR (NEW.`photo_type` IS NOT NULL AND NEW.`photo_key` IS NOT CASE NEW.`photo_type`
      WHEN 'image/jpeg' THEN 'profile/photo.jpg'
      WHEN 'image/png' THEN 'profile/photo.png'
      WHEN 'image/webp' THEN 'profile/photo.webp' END)
BEGIN
  SELECT RAISE(ABORT, 'career_person_photo: key and type set together, JPEG, PNG or WebP at profile/photo.<ext>');
END;
--> statement-breakpoint

CREATE TRIGGER `career_person_photo_update`
BEFORE UPDATE OF `photo_key`, `photo_type` ON `career_person`
WHEN (NEW.`photo_key` IS NULL) <> (NEW.`photo_type` IS NULL)
  OR (NEW.`photo_type` IS NOT NULL AND NEW.`photo_key` IS NOT CASE NEW.`photo_type`
      WHEN 'image/jpeg' THEN 'profile/photo.jpg'
      WHEN 'image/png' THEN 'profile/photo.png'
      WHEN 'image/webp' THEN 'profile/photo.webp' END)
BEGIN
  SELECT RAISE(ABORT, 'career_person_photo: key and type set together, JPEG, PNG or WebP at profile/photo.<ext>');
END;
--> statement-breakpoint

-- K-4: an end, when set, is YYYY or YYYY-MM and not before the start. Months
-- count only when both dates have one (shared/career endNotBeforeStart).
CREATE TRIGGER `career_education_end_insert`
BEFORE INSERT ON `career_education`
WHEN NEW.`end_on` IS NOT NULL AND NEW.`start_on` IS NOT NULL AND NOT (
  (NEW.`end_on` GLOB '[0-9][0-9][0-9][0-9]'
    OR (NEW.`end_on` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.`end_on`, 6, 2) BETWEEN '01' AND '12'))
  AND CASE WHEN length(NEW.`start_on`) = 7 AND length(NEW.`end_on`) = 7
    THEN NEW.`end_on` >= NEW.`start_on`
    ELSE substr(NEW.`end_on`, 1, 4) >= substr(NEW.`start_on`, 1, 4) END)
BEGIN
  SELECT RAISE(ABORT, 'career_dates: an end is YYYY or YYYY-MM, not before the start');
END;
--> statement-breakpoint

CREATE TRIGGER `career_education_end_update`
BEFORE UPDATE OF `start_on`, `end_on` ON `career_education`
WHEN NEW.`end_on` IS NOT NULL AND NEW.`start_on` IS NOT NULL AND NOT (
  (NEW.`end_on` GLOB '[0-9][0-9][0-9][0-9]'
    OR (NEW.`end_on` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.`end_on`, 6, 2) BETWEEN '01' AND '12'))
  AND CASE WHEN length(NEW.`start_on`) = 7 AND length(NEW.`end_on`) = 7
    THEN NEW.`end_on` >= NEW.`start_on`
    ELSE substr(NEW.`end_on`, 1, 4) >= substr(NEW.`start_on`, 1, 4) END)
BEGIN
  SELECT RAISE(ABORT, 'career_dates: an end is YYYY or YYYY-MM, not before the start');
END;
--> statement-breakpoint

CREATE TRIGGER `career_experience_end_insert`
BEFORE INSERT ON `career_experience`
WHEN NEW.`end_on` IS NOT NULL AND NEW.`start_on` IS NOT NULL AND NOT (
  (NEW.`end_on` GLOB '[0-9][0-9][0-9][0-9]'
    OR (NEW.`end_on` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.`end_on`, 6, 2) BETWEEN '01' AND '12'))
  AND CASE WHEN length(NEW.`start_on`) = 7 AND length(NEW.`end_on`) = 7
    THEN NEW.`end_on` >= NEW.`start_on`
    ELSE substr(NEW.`end_on`, 1, 4) >= substr(NEW.`start_on`, 1, 4) END)
BEGIN
  SELECT RAISE(ABORT, 'career_dates: an end is YYYY or YYYY-MM, not before the start');
END;
--> statement-breakpoint

CREATE TRIGGER `career_experience_end_update`
BEFORE UPDATE OF `start_on`, `end_on` ON `career_experience`
WHEN NEW.`end_on` IS NOT NULL AND NEW.`start_on` IS NOT NULL AND NOT (
  (NEW.`end_on` GLOB '[0-9][0-9][0-9][0-9]'
    OR (NEW.`end_on` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(NEW.`end_on`, 6, 2) BETWEEN '01' AND '12'))
  AND CASE WHEN length(NEW.`start_on`) = 7 AND length(NEW.`end_on`) = 7
    THEN NEW.`end_on` >= NEW.`start_on`
    ELSE substr(NEW.`end_on`, 1, 4) >= substr(NEW.`start_on`, 1, 4) END)
BEGIN
  SELECT RAISE(ABORT, 'career_dates: an end is YYYY or YYYY-MM, not before the start');
END;
--> statement-breakpoint

-- K-5: a fact belongs to an experience, an education, or neither; never both.
CREATE TRIGGER `career_fact_one_parent_insert`
BEFORE INSERT ON `career_fact`
WHEN NEW.`experience_id` IS NOT NULL AND NEW.`education_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'career_fact_one_parent: an experience or an education, not both');
END;
--> statement-breakpoint

CREATE TRIGGER `career_fact_one_parent_update`
BEFORE UPDATE OF `experience_id`, `education_id` ON `career_fact`
WHEN NEW.`experience_id` IS NOT NULL AND NEW.`education_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'career_fact_one_parent: an experience or an education, not both');
END;
--> statement-breakpoint

-- K-8: a fact is never hard-deleted (a job's selection may cite it); set deleted_at.
CREATE TRIGGER `career_fact_no_delete`
BEFORE DELETE ON `career_fact`
BEGIN
  SELECT RAISE(ABORT, 'career_fact_no_delete: set deleted_at instead');
END;
--> statement-breakpoint

-- K-7: years, when set, is an integer >= 0.
CREATE TRIGGER `career_declared_skill_years_insert`
BEFORE INSERT ON `career_declared_skill`
WHEN NEW.`years` IS NOT NULL AND (typeof(NEW.`years`) <> 'integer' OR NEW.`years` < 0)
BEGIN
  SELECT RAISE(ABORT, 'career_declared_skill_years: an integer >= 0');
END;
--> statement-breakpoint

CREATE TRIGGER `career_declared_skill_years_update`
BEFORE UPDATE OF `years` ON `career_declared_skill`
WHEN NEW.`years` IS NOT NULL AND (typeof(NEW.`years`) <> 'integer' OR NEW.`years` < 0)
BEGIN
  SELECT RAISE(ABORT, 'career_declared_skill_years: an integer >= 0');
END;
--> statement-breakpoint

-- K-9: a requirement has a skill exactly when it's mapped.
CREATE TRIGGER `career_requirement_skill_insert`
BEFORE INSERT ON `career_requirement`
WHEN NEW.`type` IS NOT NULL AND (NEW.`type` = 'not_mapped') <> (NEW.`skill_id` IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'career_requirement_skill: a skill exactly when mapped');
END;
--> statement-breakpoint

CREATE TRIGGER `career_requirement_skill_update`
BEFORE UPDATE OF `type`, `skill_id` ON `career_requirement`
WHEN NEW.`type` IS NOT NULL AND (NEW.`type` = 'not_mapped') <> (NEW.`skill_id` IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'career_requirement_skill: a skill exactly when mapped');
END;
--> statement-breakpoint

-- K-10: the fit is unscored (all NULL) or scored: five integers within 25, 25,
-- 20, 15, 15 (shared/career FIT_MAX), a total that is their sum, and a decision
-- from the list. The 75/55 thresholds stay in shared/career scoreFit, so CA-00
-- can change them without a migration.
CREATE TRIGGER `career_job_fit_insert`
BEFORE INSERT ON `career_job`
WHEN NOT (
  (NEW.`fit_total` IS NULL AND NEW.`fit_constraints` IS NULL AND NEW.`fit_skills` IS NULL
    AND NEW.`fit_growth` IS NULL AND NEW.`fit_pay` IS NULL AND NEW.`fit_signal` IS NULL
    AND NEW.`decision` IS NULL)
  OR (typeof(NEW.`fit_constraints`) = 'integer' AND NEW.`fit_constraints` BETWEEN 0 AND 25
    AND typeof(NEW.`fit_skills`) = 'integer' AND NEW.`fit_skills` BETWEEN 0 AND 25
    AND typeof(NEW.`fit_growth`) = 'integer' AND NEW.`fit_growth` BETWEEN 0 AND 20
    AND typeof(NEW.`fit_pay`) = 'integer' AND NEW.`fit_pay` BETWEEN 0 AND 15
    AND typeof(NEW.`fit_signal`) = 'integer' AND NEW.`fit_signal` BETWEEN 0 AND 15
    AND typeof(NEW.`fit_total`) = 'integer'
    AND NEW.`fit_total` = NEW.`fit_constraints` + NEW.`fit_skills` + NEW.`fit_growth` + NEW.`fit_pay` + NEW.`fit_signal`
    AND NEW.`decision` IS NOT NULL AND NEW.`decision` IN ('apply', 'maybe', 'skip')))
BEGIN
  SELECT RAISE(ABORT, 'career_job_fit: all five scores within their maxima, the total their sum, a decision; or none');
END;
--> statement-breakpoint

CREATE TRIGGER `career_job_fit_update`
BEFORE UPDATE OF `fit_total`, `fit_constraints`, `fit_skills`, `fit_growth`, `fit_pay`, `fit_signal`, `decision` ON `career_job`
WHEN NOT (
  (NEW.`fit_total` IS NULL AND NEW.`fit_constraints` IS NULL AND NEW.`fit_skills` IS NULL
    AND NEW.`fit_growth` IS NULL AND NEW.`fit_pay` IS NULL AND NEW.`fit_signal` IS NULL
    AND NEW.`decision` IS NULL)
  OR (typeof(NEW.`fit_constraints`) = 'integer' AND NEW.`fit_constraints` BETWEEN 0 AND 25
    AND typeof(NEW.`fit_skills`) = 'integer' AND NEW.`fit_skills` BETWEEN 0 AND 25
    AND typeof(NEW.`fit_growth`) = 'integer' AND NEW.`fit_growth` BETWEEN 0 AND 20
    AND typeof(NEW.`fit_pay`) = 'integer' AND NEW.`fit_pay` BETWEEN 0 AND 15
    AND typeof(NEW.`fit_signal`) = 'integer' AND NEW.`fit_signal` BETWEEN 0 AND 15
    AND typeof(NEW.`fit_total`) = 'integer'
    AND NEW.`fit_total` = NEW.`fit_constraints` + NEW.`fit_skills` + NEW.`fit_growth` + NEW.`fit_pay` + NEW.`fit_signal`
    AND NEW.`decision` IS NOT NULL AND NEW.`decision` IN ('apply', 'maybe', 'skip')))
BEGIN
  SELECT RAISE(ABORT, 'career_job_fit: all five scores within their maxima, the total their sum, a decision; or none');
END;
--> statement-breakpoint

-- K-12: a job's history is append-only.
CREATE TRIGGER `career_job_event_no_update`
BEFORE UPDATE ON `career_job_event`
BEGIN
  SELECT RAISE(ABORT, 'career_job_event_append_only: events are never edited');
END;
--> statement-breakpoint

CREATE TRIGGER `career_job_event_no_delete`
BEFORE DELETE ON `career_job_event`
BEGIN
  SELECT RAISE(ABORT, 'career_job_event_append_only: events are never deleted');
END;
--> statement-breakpoint

-- K-14: a job is never hard-deleted; set deleted_at (its Study topics stay).
CREATE TRIGGER `career_job_no_delete`
BEFORE DELETE ON `career_job`
BEGIN
  SELECT RAISE(ABORT, 'career_job_no_delete: set deleted_at instead');
END;
