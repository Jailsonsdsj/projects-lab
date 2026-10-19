-- Core sample data for local development (docs/prd/99-data-model.md).
-- Fixed ids and timestamps: running the seed twice must leave the same state.
-- No mutation or auth_attempt rows; both are short-lived by design.

-- The owner comes from owner.ts (dev passphrase: projects-lab-dev).

INSERT INTO skill (id, name, aliases_json, created_at, deleted_at) VALUES
  ('seed-skill-postgresql', 'PostgreSQL', '["Postgres", "PG"]', '2026-01-01T00:00:00.000Z', NULL),
  ('seed-skill-typescript', 'TypeScript', '["TS"]', '2026-01-01T00:00:00.000Z', NULL),
  ('seed-skill-go', 'Go', '["Golang"]', '2026-01-01T00:00:00.000Z', NULL),
  ('seed-skill-react', 'React', '["React.js", "ReactJS"]', '2026-01-01T00:00:00.000Z', NULL),
  ('seed-skill-cloudflare-workers', 'Cloudflare Workers', '["Workers"]', '2026-01-01T00:00:00.000Z', NULL),
  ('seed-skill-jquery', 'jQuery', '[]', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');

INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES
  ('seed-call-1', 'study_record_grade', 'Claude', 1, '2026-01-02T09:00:00.000Z'),
  ('seed-call-2', 'study_add_topic', 'Claude', 1, '2026-01-02T09:05:00.000Z'),
  ('seed-call-3', 'career_add_job', 'Claude', 0, '2026-01-02T09:10:00.000Z');
