CREATE TABLE `career_answer` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`drive_file_id` text,
	`story_id` text,
	`job_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `career_story`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `career_job`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_answer_question_length" CHECK(length(trim("career_answer"."question")) > 0 AND length("career_answer"."question") <= 200),
	CONSTRAINT "career_answer_answer_length" CHECK(length(trim("career_answer"."answer")) > 0 AND length("career_answer"."answer") <= 3000)
);
--> statement-breakpoint
CREATE INDEX `career_answer_job` ON `career_answer` (`job_id`);--> statement-breakpoint
CREATE TABLE `career_drill` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`mode` text NOT NULL,
	`topic` text NOT NULL,
	`weakest_json` text DEFAULT '[]' NOT NULL,
	`fix` text NOT NULL,
	CONSTRAINT "career_drill_mode_allowed" CHECK("career_drill"."mode" IN ('behavioral', 'technical', 'negotiation')),
	CONSTRAINT "career_drill_weakest" CHECK(json_valid("career_drill"."weakest_json") AND json_type("career_drill"."weakest_json") = 'array' AND json_array_length("career_drill"."weakest_json") <= 2)
);
--> statement-breakpoint
CREATE INDEX `career_drill_at` ON `career_drill` (`at`);--> statement-breakpoint
CREATE TABLE `career_form_answer` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `career_job`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_form_answer_question_length" CHECK(length(trim("career_form_answer"."question")) > 0 AND length("career_form_answer"."question") <= 200),
	CONSTRAINT "career_form_answer_answer_length" CHECK(length(trim("career_form_answer"."answer")) > 0 AND length("career_form_answer"."answer") <= 2000),
	CONSTRAINT "career_form_answer_position_min" CHECK(typeof("career_form_answer"."position") = 'integer' AND "career_form_answer"."position" >= 0)
);
--> statement-breakpoint
CREATE INDEX `career_form_answer_job` ON `career_form_answer` (`job_id`);--> statement-breakpoint
CREATE TABLE `career_job_item` (
	`job_id` text NOT NULL,
	`item_kind` text NOT NULL,
	`item_id` text NOT NULL,
	`variant` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`job_id`, `item_kind`, `item_id`),
	FOREIGN KEY (`job_id`) REFERENCES `career_job`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_job_item_kind_allowed" CHECK("career_job_item"."item_kind" IN ('fact', 'experience', 'education', 'skill')),
	CONSTRAINT "career_job_item_variant_length" CHECK(length("career_job_item"."variant") BETWEEN 1 AND 30),
	CONSTRAINT "career_job_item_position_min" CHECK(typeof("career_job_item"."position") = 'integer' AND "career_job_item"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE `career_job_kit` (
	`job_id` text PRIMARY KEY NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text,
	`salary_period` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `career_job`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_job_kit_intro_length" CHECK(length("career_job_kit"."intro") <= 1500)
);
--> statement-breakpoint
CREATE TABLE `career_opening` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`company` text NOT NULL,
	`role` text NOT NULL,
	`lane` text NOT NULL,
	`posting` text NOT NULL,
	`posted_on` text,
	`rate_text` text DEFAULT '' NOT NULL,
	`why` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`job_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `career_job`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_opening_url_https" CHECK("career_opening"."url" GLOB 'https://?*'),
	CONSTRAINT "career_opening_status_allowed" CHECK("career_opening"."status" IN ('new', 'kept', 'dismissed', 'tracked')),
	CONSTRAINT "career_opening_posting_length" CHECK(length("career_opening"."posting") <= 4000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_opening_url_unique` ON `career_opening` (`url`);--> statement-breakpoint
CREATE INDEX `career_opening_status` ON `career_opening` (`status`);--> statement-breakpoint
CREATE TABLE `career_search_criteria` (
	`id` text PRIMARY KEY NOT NULL,
	`queries_json` text DEFAULT '[]' NOT NULL,
	`lanes_json` text DEFAULT '[]' NOT NULL,
	`shapes_json` text DEFAULT '[]' NOT NULL,
	`auto_reject_json` text DEFAULT '[]' NOT NULL,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`max_hours` integer NOT NULL,
	`timezone_note` text DEFAULT '' NOT NULL,
	`rate_floor` integer,
	`rate_currency` text,
	`rate_period` text,
	`max_age_days` integer NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "career_search_criteria_one_row" CHECK("career_search_criteria"."id" = 'criteria'),
	CONSTRAINT "career_search_criteria_lists" CHECK(json_valid("career_search_criteria"."queries_json") AND json_type("career_search_criteria"."queries_json") = 'array' AND json_valid("career_search_criteria"."lanes_json") AND json_type("career_search_criteria"."lanes_json") = 'array' AND json_valid("career_search_criteria"."shapes_json") AND json_type("career_search_criteria"."shapes_json") = 'array' AND json_valid("career_search_criteria"."auto_reject_json") AND json_type("career_search_criteria"."auto_reject_json") = 'array' AND json_valid("career_search_criteria"."sources_json") AND json_type("career_search_criteria"."sources_json") = 'array'),
	CONSTRAINT "career_search_criteria_max_hours" CHECK(typeof("career_search_criteria"."max_hours") = 'integer' AND "career_search_criteria"."max_hours" >= 0),
	CONSTRAINT "career_search_criteria_max_age" CHECK(typeof("career_search_criteria"."max_age_days") = 'integer' AND "career_search_criteria"."max_age_days" >= 1)
);
--> statement-breakpoint
CREATE TABLE `career_standard_answer` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`value` text NOT NULL,
	`position` integer NOT NULL,
	CONSTRAINT "career_standard_answer_label_not_blank" CHECK(length(trim("career_standard_answer"."label")) > 0),
	CONSTRAINT "career_standard_answer_value_length" CHECK(length("career_standard_answer"."value") <= 300),
	CONSTRAINT "career_standard_answer_position_min" CHECK(typeof("career_standard_answer"."position") = 'integer' AND "career_standard_answer"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `career_standard_answer_label_nocase` ON `career_standard_answer` ("label" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `career_story` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`situation` text NOT NULL,
	`task` text NOT NULL,
	`action` text NOT NULL,
	`result` text NOT NULL,
	`experience_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`experience_id`) REFERENCES `career_experience`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "career_story_parts_length" CHECK(length("career_story"."situation") <= 600 AND length("career_story"."task") <= 600 AND length("career_story"."action") <= 600 AND length("career_story"."result") <= 600),
	CONSTRAINT "career_story_title_not_blank" CHECK(length(trim("career_story"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE `career_story_fact` (
	`story_id` text NOT NULL,
	`fact_id` text NOT NULL,
	PRIMARY KEY(`story_id`, `fact_id`),
	FOREIGN KEY (`story_id`) REFERENCES `career_story`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fact_id`) REFERENCES `career_fact`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `career_story_fact_fact` ON `career_story_fact` (`fact_id`);--> statement-breakpoint
CREATE TABLE `career_story_skill` (
	`story_id` text NOT NULL,
	`skill_id` text NOT NULL,
	PRIMARY KEY(`story_id`, `skill_id`),
	FOREIGN KEY (`story_id`) REFERENCES `career_story`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `career_story_skill_skill` ON `career_story_skill` (`skill_id`);