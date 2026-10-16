CREATE TABLE `upload` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes` integer NOT NULL,
	`r2_key` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	CONSTRAINT "upload_bytes_range" CHECK(typeof("upload"."bytes") = 'integer' AND "upload"."bytes" BETWEEN 1 AND 10485760),
	CONSTRAINT "upload_kind_allowed" CHECK("upload"."kind" IN ('resume', 'cover_letter')),
	CONSTRAINT "upload_content_type_allowed" CHECK("upload"."content_type" IN ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
);
