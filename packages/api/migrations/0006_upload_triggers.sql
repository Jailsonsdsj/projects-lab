-- C-13 (docs/prd/99-data-model.md): upload.used_at, once set, never changes.
-- A used upload has its file in R2; un-using it would let a second PUT
-- overwrite that file. Setting it the first time (NULL -> a time) is the
-- accepted PUT itself, so only a change away from a non-NULL value aborts.
CREATE TRIGGER `upload_used_at_once`
BEFORE UPDATE OF `used_at` ON `upload`
WHEN OLD.`used_at` IS NOT NULL
  AND (NEW.`used_at` IS NULL OR NEW.`used_at` <> OLD.`used_at`)
BEGIN
  SELECT RAISE(ABORT, 'upload_used_at_once: an upload is used once');
END;
