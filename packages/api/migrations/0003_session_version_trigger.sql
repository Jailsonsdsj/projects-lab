-- C-9 (docs/prd/99-data-model.md): user.session_version is a non-negative integer.
-- A trigger, not a CHECK: adding a table-level CHECK to an existing table would
-- need drizzle-kit's table rebuild. typeof() also catches text, which a plain
-- `>= 0` lets through (SQLite ranks text above every number). NULL is left to
-- the column's NOT NULL, so that error names the column.
CREATE TRIGGER `user_session_version_insert`
BEFORE INSERT ON `user`
WHEN NEW.`session_version` IS NOT NULL
  AND (typeof(NEW.`session_version`) <> 'integer' OR NEW.`session_version` < 0)
BEGIN
  SELECT RAISE(ABORT, 'user_session_version_min: session_version must be an integer >= 0');
END;
--> statement-breakpoint

CREATE TRIGGER `user_session_version_update`
BEFORE UPDATE OF `session_version` ON `user`
WHEN NEW.`session_version` IS NOT NULL
  AND (typeof(NEW.`session_version`) <> 'integer' OR NEW.`session_version` < 0)
BEGIN
  SELECT RAISE(ABORT, 'user_session_version_min: session_version must be an integer >= 0');
END;
