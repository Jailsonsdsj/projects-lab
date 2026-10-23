-- CA-17a: a resume's ATS check on the job's kit (docs/prd/99-data-model.md
-- K-29, K-30). Triggers, not CHECKs: a CHECK on the existing table would make
-- drizzle-kit rebuild it, and ats_score is nullable. A RAISE(ABORT) here means
-- the calling code is wrong; never drop a trigger.

-- K-29: the score and its time are set together; the score is a whole percent.
CREATE TRIGGER `career_job_kit_ats_score`
BEFORE INSERT ON `career_job_kit`
WHEN (NEW.`ats_score` IS NULL) <> (NEW.`ats_scored_at` IS NULL)
  OR (NEW.`ats_score` IS NOT NULL
      AND (typeof(NEW.`ats_score`) <> 'integer' OR NEW.`ats_score` < 0 OR NEW.`ats_score` > 100))
BEGIN
  SELECT RAISE(ABORT, 'career_job_kit_ats: score and scored_at set together, score a whole 0..100');
END;
--> statement-breakpoint

CREATE TRIGGER `career_job_kit_ats_score_update`
BEFORE UPDATE OF `ats_score`, `ats_scored_at` ON `career_job_kit`
WHEN (NEW.`ats_score` IS NULL) <> (NEW.`ats_scored_at` IS NULL)
  OR (NEW.`ats_score` IS NOT NULL
      AND (typeof(NEW.`ats_score`) <> 'integer' OR NEW.`ats_score` < 0 OR NEW.`ats_score` > 100))
BEGIN
  SELECT RAISE(ABORT, 'career_job_kit_ats: score and scored_at set together, score a whole 0..100');
END;
--> statement-breakpoint

-- K-30: the missing keywords are a JSON array of strings.
CREATE TRIGGER `career_job_kit_ats_missing`
BEFORE INSERT ON `career_job_kit`
WHEN NOT json_valid(NEW.`ats_missing_json`)
  OR json_type(NEW.`ats_missing_json`) <> 'array'
  OR EXISTS (SELECT 1 FROM json_each(NEW.`ats_missing_json`) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'career_job_kit_ats_missing: a JSON array of strings');
END;
--> statement-breakpoint

CREATE TRIGGER `career_job_kit_ats_missing_update`
BEFORE UPDATE OF `ats_missing_json` ON `career_job_kit`
WHEN NOT json_valid(NEW.`ats_missing_json`)
  OR json_type(NEW.`ats_missing_json`) <> 'array'
  OR EXISTS (SELECT 1 FROM json_each(NEW.`ats_missing_json`) WHERE type <> 'text')
BEGIN
  SELECT RAISE(ABORT, 'career_job_kit_ats_missing: a JSON array of strings');
END;
