CREATE TABLE `auth_attempt` (
	`ip_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`ip_hash`, `window_start`),
	CONSTRAINT "auth_attempt_count_min" CHECK("auth_attempt"."count" >= 1)
);
--> statement-breakpoint
CREATE TABLE `mcp_call` (
	`id` text PRIMARY KEY NOT NULL,
	`tool` text NOT NULL,
	`client_name` text NOT NULL,
	`ok` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "mcp_call_tool_prefix" CHECK(("mcp_call"."tool" GLOB 'core_?*' OR "mcp_call"."tool" GLOB 'study_?*' OR "mcp_call"."tool" GLOB 'career_?*') AND "mcp_call"."tool" NOT GLOB '*[^a-z_]*'),
	CONSTRAINT "mcp_call_ok_bool" CHECK("mcp_call"."ok" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `mutation` (
	`key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skill` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "skill_name_not_blank" CHECK(length(trim("skill"."name")) > 0),
	CONSTRAINT "skill_aliases_json_array" CHECK(json_valid("skill"."aliases_json") AND json_type("skill"."aliases_json") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_name_nocase` ON `skill` ("name" COLLATE NOCASE);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_key_hash` text NOT NULL,
	`kdf_salt` text NOT NULL,
	`kdf_iterations` integer NOT NULL,
	`timezone` text NOT NULL,
	`created_at` text NOT NULL,
	`last_exported_at` text
);
