CREATE TABLE `career_declared_skill` (
	`skill_id` text PRIMARY KEY NOT NULL,
	`level` text NOT NULL,
	`years` integer,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_declared_skill_level_allowed" CHECK("career_declared_skill"."level" IN ('familiar', 'working', 'strong'))
);
--> statement-breakpoint
CREATE TABLE `career_education` (
	`id` text PRIMARY KEY NOT NULL,
	`institution` text NOT NULL,
	`degree` text NOT NULL,
	`field` text DEFAULT '' NOT NULL,
	`start_on` text NOT NULL,
	`end_on` text,
	`notes` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "career_education_start_format" CHECK(("career_education"."start_on" GLOB '[0-9][0-9][0-9][0-9]' OR ("career_education"."start_on" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("career_education"."start_on", 6, 2) BETWEEN '01' AND '12'))),
	CONSTRAINT "career_education_position_min" CHECK(typeof("career_education"."position") = 'integer' AND "career_education"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE `career_experience` (
	`id` text PRIMARY KEY NOT NULL,
	`organization` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`start_on` text NOT NULL,
	`end_on` text,
	`location` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "career_experience_kind_allowed" CHECK("career_experience"."kind" IN ('job', 'contract', 'research', 'project')),
	CONSTRAINT "career_experience_start_format" CHECK(("career_experience"."start_on" GLOB '[0-9][0-9][0-9][0-9]' OR ("career_experience"."start_on" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("career_experience"."start_on", 6, 2) BETWEEN '01' AND '12'))),
	CONSTRAINT "career_experience_summary_length" CHECK(length("career_experience"."summary") <= 600),
	CONSTRAINT "career_experience_position_min" CHECK(typeof("career_experience"."position") = 'integer' AND "career_experience"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE `career_fact` (
	`id` text PRIMARY KEY NOT NULL,
	`experience_id` text,
	`education_id` text,
	`text` text NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`experience_id`) REFERENCES `career_experience`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`education_id`) REFERENCES `career_education`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_fact_text_length" CHECK(length(trim("career_fact"."text")) > 0 AND length("career_fact"."text") <= 300),
	CONSTRAINT "career_fact_verified_bool" CHECK(typeof("career_fact"."verified") = 'integer' AND "career_fact"."verified" IN (0, 1)),
	CONSTRAINT "career_fact_position_min" CHECK(typeof("career_fact"."position") = 'integer' AND "career_fact"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `career_fact_experience` ON `career_fact` (`experience_id`);--> statement-breakpoint
CREATE INDEX `career_fact_education` ON `career_fact` (`education_id`);--> statement-breakpoint
CREATE TABLE `career_fact_skill` (
	`fact_id` text NOT NULL,
	`skill_id` text NOT NULL,
	PRIMARY KEY(`fact_id`, `skill_id`),
	FOREIGN KEY (`fact_id`) REFERENCES `career_fact`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `career_fact_skill_skill` ON `career_fact_skill` (`skill_id`);--> statement-breakpoint
CREATE TABLE `career_job` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text NOT NULL,
	`role` text NOT NULL,
	`seniority` text DEFAULT '' NOT NULL,
	`language` text NOT NULL,
	`work_shape` text DEFAULT '' NOT NULL,
	`source_url` text,
	`posting` text NOT NULL,
	`fit_total` integer,
	`fit_constraints` integer,
	`fit_skills` integer,
	`fit_growth` integer,
	`fit_pay` integer,
	`fit_signal` integer,
	`decision` text,
	`fit_notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "career_job_posting_length" CHECK(length(trim("career_job"."posting")) > 0 AND length("career_job"."posting") <= 20000),
	CONSTRAINT "career_job_fit_notes_length" CHECK(length("career_job"."fit_notes") <= 2000)
);
--> statement-breakpoint
CREATE TABLE `career_job_event` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	`at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `career_job`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_job_event_status_allowed" CHECK("career_job_event"."status" IN ('evaluated', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn', 'closed_silent')),
	CONSTRAINT "career_job_event_note_length" CHECK(length("career_job_event"."note") <= 500)
);
--> statement-breakpoint
CREATE INDEX `career_job_event_job` ON `career_job_event` (`job_id`,`at`);--> statement-breakpoint
CREATE TABLE `career_link` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`url` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "career_link_kind_allowed" CHECK("career_link"."kind" IN ('linkedin', 'github', 'portfolio', 'scholar', 'other')),
	CONSTRAINT "career_link_url_https" CHECK("career_link"."url" GLOB 'https://?*'),
	CONSTRAINT "career_link_position_min" CHECK(typeof("career_link"."position") = 'integer' AND "career_link"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE `career_person` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`headline` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`timezone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`languages_json` text DEFAULT '[]' NOT NULL,
	`photo_key` text,
	`photo_type` text,
	`updated_at` text NOT NULL,
	CONSTRAINT "career_person_one_row" CHECK("career_person"."id" = 'person'),
	CONSTRAINT "career_person_summary_length" CHECK(length("career_person"."summary") <= 600),
	CONSTRAINT "career_person_languages_array" CHECK(json_valid("career_person"."languages_json") AND json_type("career_person"."languages_json") = 'array')
);
--> statement-breakpoint
CREATE TABLE `career_requirement` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`text` text NOT NULL,
	`type` text NOT NULL,
	`skill_id` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `career_job`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_requirement_type_allowed" CHECK("career_requirement"."type" IN ('required', 'nice', 'not_mapped')),
	CONSTRAINT "career_requirement_text_length" CHECK(length(trim("career_requirement"."text")) > 0 AND length("career_requirement"."text") <= 120),
	CONSTRAINT "career_requirement_position_min" CHECK(typeof("career_requirement"."position") = 'integer' AND "career_requirement"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `career_requirement_job` ON `career_requirement` (`job_id`);--> statement-breakpoint
CREATE INDEX `career_requirement_skill` ON `career_requirement` (`skill_id`);