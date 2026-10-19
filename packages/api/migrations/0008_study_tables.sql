CREATE TABLE `learn_area` (
	`id` text PRIMARY KEY NOT NULL,
	`prefix` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`next_seq` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "learn_area_prefix_format" CHECK(length("learn_area"."prefix") = 2 AND "learn_area"."prefix" NOT GLOB '*[^A-Z]*'),
	CONSTRAINT "learn_area_name_not_blank" CHECK(length(trim("learn_area"."name")) > 0),
	CONSTRAINT "learn_area_next_seq_min" CHECK(typeof("learn_area"."next_seq") = 'integer' AND "learn_area"."next_seq" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learn_area_prefix_unique` ON `learn_area` (`prefix`);--> statement-breakpoint
CREATE UNIQUE INDEX `learn_area_name_nocase` ON `learn_area` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `learn_course` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`level` text NOT NULL,
	`module` integer DEFAULT 1 NOT NULL,
	`path` text NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `learn_topic`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "learn_course_level_allowed" CHECK("learn_course"."level" IN ('fast_track', 'essential', 'specialized')),
	CONSTRAINT "learn_course_module_range" CHECK(typeof("learn_course"."module") = 'integer' AND "learn_course"."module" BETWEEN 1 AND 4 AND ("learn_course"."level" = 'specialized' OR "learn_course"."module" = 1)),
	CONSTRAINT "learn_course_path_layout" CHECK("learn_course"."path" GLOB 'Study Lab/*.md')
);
--> statement-breakpoint
CREATE INDEX `learn_course_topic` ON `learn_course` (`topic_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `learn_course_path_unique` ON `learn_course` (`path`);--> statement-breakpoint
CREATE TABLE `learn_exam` (
	`id` text PRIMARY KEY NOT NULL,
	`topic_id` text NOT NULL,
	`level` text NOT NULL,
	`attempt` integer NOT NULL,
	`md_path` text NOT NULL,
	`pdf_path` text NOT NULL,
	`created_at` text NOT NULL,
	`grade` integer,
	`graded_at` text,
	FOREIGN KEY (`topic_id`) REFERENCES `learn_topic`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "learn_exam_attempt_min" CHECK(typeof("learn_exam"."attempt") = 'integer' AND "learn_exam"."attempt" >= 1),
	CONSTRAINT "learn_exam_path_layout" CHECK("learn_exam"."md_path" GLOB 'Study Lab/*.md' AND "learn_exam"."pdf_path" GLOB 'Study Lab/*.pdf'),
	CONSTRAINT "learn_exam_level_allowed" CHECK("learn_exam"."level" IN ('fast_track', 'essential', 'specialized'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learn_exam_attempt_unique` ON `learn_exam` (`topic_id`,`level`,`attempt`);--> statement-breakpoint
CREATE UNIQUE INDEX `learn_exam_md_path_unique` ON `learn_exam` (`md_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `learn_exam_pdf_path_unique` ON `learn_exam` (`pdf_path`);--> statement-breakpoint
CREATE TABLE `learn_topic` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`area_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`level` text DEFAULT 'unset' NOT NULL,
	`priority` integer DEFAULT 2 NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`started_on` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`area_id`) REFERENCES `learn_area`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "learn_topic_level_allowed" CHECK("learn_topic"."level" IN ('unset', 'fast_track', 'essential', 'specialized')),
	CONSTRAINT "learn_topic_priority_range" CHECK(typeof("learn_topic"."priority") = 'integer' AND "learn_topic"."priority" BETWEEN 1 AND 3),
	CONSTRAINT "learn_topic_status_allowed" CHECK("learn_topic"."status" IN ('in_progress', 'not_started', 'done')),
	CONSTRAINT "learn_topic_note_length" CHECK(length("learn_topic"."note") <= 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learn_topic_code_unique` ON `learn_topic` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `learn_topic_skill_unique` ON `learn_topic` (`skill_id`);--> statement-breakpoint
CREATE INDEX `learn_topic_area` ON `learn_topic` (`area_id`);