-- The seven Study Lab areas (docs/prd/10-study-backlog.md § Areas), in their
-- display order. Production data, not dev seed: every backlog starts with them.
-- Fixed IDs, so later migrations and the cs-learning-lab import can name them.
INSERT INTO `learn_area` (`id`, `prefix`, `name`, `position`, `next_seq`, `created_at`) VALUES
  ('area-cs', 'CS', 'CS Fundamentals', 1, 1, '2026-10-19T00:00:00.000Z'),
  ('area-fe', 'FE', 'Frontend', 2, 1, '2026-10-19T00:00:00.000Z'),
  ('area-be', 'BE', 'Backend', 3, 1, '2026-10-19T00:00:00.000Z'),
  ('area-db', 'DB', 'Databases and Data', 4, 1, '2026-10-19T00:00:00.000Z'),
  ('area-do', 'DO', 'DevOps and Cloud', 5, 1, '2026-10-19T00:00:00.000Z'),
  ('area-sa', 'SA', 'Software Architecture', 6, 1, '2026-10-19T00:00:00.000Z'),
  ('area-se', 'SE', 'Security', 7, 1, '2026-10-19T00:00:00.000Z');
