ALTER TABLE `career_job_kit` ADD `ats_score` integer;--> statement-breakpoint
ALTER TABLE `career_job_kit` ADD `ats_missing_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `career_job_kit` ADD `ats_scored_at` text;