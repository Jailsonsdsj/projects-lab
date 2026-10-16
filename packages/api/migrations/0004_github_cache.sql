CREATE TABLE `github_cache` (
	`path` text PRIMARY KEY NOT NULL,
	`etag` text NOT NULL,
	`body_json` text NOT NULL,
	`fetched_at` text NOT NULL
);
