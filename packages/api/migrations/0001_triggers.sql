-- Core invariants that need triggers (docs/prd/99-data-model.md).
-- A RAISE(ABORT) here means the calling code is wrong; never drop a trigger.

-- C-7: a skill is never hard-deleted. Removal is `deleted_at`, so lab rows that
-- reference it keep working and core never needs to know which labs exist.
CREATE TRIGGER `skill_no_hard_delete`
BEFORE DELETE ON `skill`
BEGIN
  SELECT RAISE(ABORT, 'skill_no_hard_delete: set deleted_at instead');
END;
--> statement-breakpoint

-- C-8: among live skills, no alias equals another skill's name or alias, and no
-- name equals another skill's alias (ignoring case). Soft-deleted skills don't
-- count; restoring one is an UPDATE of deleted_at and is checked again.
-- json_valid() lets C-3's CHECK report malformed aliases_json instead of json_each.
CREATE TRIGGER `skill_alias_unique_insert`
BEFORE INSERT ON `skill`
WHEN NEW.`deleted_at` IS NULL
  AND json_valid(NEW.`aliases_json`)
  AND EXISTS (
    SELECT 1 FROM `skill` s
    WHERE s.`deleted_at` IS NULL
      AND s.`id` <> NEW.`id`
      AND (
        EXISTS (
          SELECT 1 FROM json_each(NEW.`aliases_json`) a
          WHERE a.value = s.`name` COLLATE NOCASE
             OR EXISTS (SELECT 1 FROM json_each(s.`aliases_json`) b WHERE b.value = a.value COLLATE NOCASE)
        )
        OR EXISTS (SELECT 1 FROM json_each(s.`aliases_json`) b WHERE b.value = NEW.`name` COLLATE NOCASE)
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'skill_alias_conflict: an alias or name is already used by another skill');
END;
--> statement-breakpoint

CREATE TRIGGER `skill_alias_unique_update`
BEFORE UPDATE OF `name`, `aliases_json`, `deleted_at` ON `skill`
WHEN NEW.`deleted_at` IS NULL
  AND json_valid(NEW.`aliases_json`)
  AND EXISTS (
    SELECT 1 FROM `skill` s
    WHERE s.`deleted_at` IS NULL
      AND s.`id` <> NEW.`id`
      AND (
        EXISTS (
          SELECT 1 FROM json_each(NEW.`aliases_json`) a
          WHERE a.value = s.`name` COLLATE NOCASE
             OR EXISTS (SELECT 1 FROM json_each(s.`aliases_json`) b WHERE b.value = a.value COLLATE NOCASE)
        )
        OR EXISTS (SELECT 1 FROM json_each(s.`aliases_json`) b WHERE b.value = NEW.`name` COLLATE NOCASE)
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'skill_alias_conflict: an alias or name is already used by another skill');
END;
