// Core, Study Lab and Career Lab invariants (docs/prd/99-data-model.md), attempted through
// the D1 binding. scripts/verify-triggers.sh runs the same probes; keep them in sync.
// Storage is shared by the tests in this file, so the seed runs once and every
// write below uses its own ids and names. Rejected writes leave no trace.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";

const run = (sql: string) => db().prepare(sql).run();

beforeAll(async () => {
  await db().batch(
    [
      `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('s1', 'PostgreSQL', '["Postgres", "PG"]', 't')`,
      `INSERT INTO skill (id, name, created_at, deleted_at) VALUES ('s2', 'Go', 't', 't')`,
      `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('s3', 'Golang', '["Go"]', 't')`,
      // Only the C-7 tests touch these, so a missing C-7 can't disturb the others.
      `INSERT INTO skill (id, name, created_at) VALUES ('d1', 'Elixir', 't')`,
      `INSERT INTO skill (id, name, created_at, deleted_at) VALUES ('d2', 'Erlang', 't', 't')`,
      `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at) VALUES ('v1', 'h', 's', 1, 'UTC', 't')`,
      // Study Lab: a topic with a course, a graded essential #1, an open
      // essential #2 and an open fast_track #1.
      `INSERT INTO skill (id, name, created_at) VALUES ('ss1', 'Big-O notation', 't')`,
      `INSERT INTO skill (id, name, created_at) VALUES ('ss2', 'React', 't')`,
      `INSERT INTO skill (id, name, created_at) VALUES ('ss3', 'Docker', 't')`,
      `INSERT INTO skill (id, name, created_at) VALUES ('ss4', 'Kafka', 't')`,
      `UPDATE learn_area SET next_seq = 2 WHERE id = 'area-cs'`,
      `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('t1', 'CS-01', 'area-cs', 'ss1', 't', 't')`,
      `INSERT INTO learn_course (id, topic_id, level, path, recorded_at) VALUES ('c1', 't1', 'fast_track', 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track.md', 't')`,
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('e1', 't1', 'essential', 1, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-1.md', 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-1.pdf', 't')`,
      `UPDATE learn_exam SET grade = 85, graded_at = 'g1' WHERE id = 'e1'`,
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('e2', 't1', 'essential', 2, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-2.md', 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-2.pdf', 't')`,
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('e3', 't1', 'fast_track', 1, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-1.md', 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-1.pdf', 't')`,
      // Exams made in the app (ST-13b), no PDF: ae1's paper submitted, ae3's
      // a draft only, ae2 without a paper.
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES ('ae1', 't1', 'fast_track', 2, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-2.md', NULL, 'app', 't')`,
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES ('ae2', 't1', 'fast_track', 3, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-3.md', NULL, 'app', 't')`,
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES ('ae3', 't1', 'fast_track', 4, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-4.md', NULL, 'app', 't')`,
      `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at, submitted_at, results_json) VALUES ('ae1', 'Big-O', '{}', '[]', '[]', '[]', 't', 't', 's', '[]')`,
      `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at) VALUES ('ae3', 'Big-O', '{}', '[]', '[]', '[]', 't', 't')`,
      // Career Lab (CA-02a): a person, an experience with a fact, an education,
      // a declared skill, a scored and an unscored job with requirements and an event.
      `INSERT INTO skill (id, name, created_at) VALUES ('cs1', 'TypeScript', 't')`,
      `INSERT INTO skill (id, name, created_at) VALUES ('cs2', 'LLM evaluation', 't')`,
      `INSERT INTO career_person (id, updated_at) VALUES ('person', 't')`,
      `INSERT INTO career_experience (id, organization, title, kind, start_on, position, created_at) VALUES ('ce1', 'Acme', 'Engineer', 'contract', '2023-04', 0, 't')`,
      `INSERT INTO career_education (id, institution, degree, start_on, end_on, position, created_at) VALUES ('ced1', 'UFPE', 'BSc', '2015', '2019', 0, 't')`,
      `INSERT INTO career_fact (id, experience_id, text, position, created_at, updated_at) VALUES ('cf1', 'ce1', 'Shipped the eval harness', 0, 't', 't')`,
      `INSERT INTO career_fact_skill (fact_id, skill_id) VALUES ('cf1', 'cs1')`,
      `INSERT INTO career_declared_skill (skill_id, level, years, created_at, updated_at) VALUES ('cs1', 'strong', 3, 't', 't')`,
      `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('cj1', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 75, 20, 20, 15, 10, 10, 'apply', 't', 't')`,
      `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('cj2', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 't', 't')`,
      `INSERT INTO career_requirement (id, job_id, text, type, skill_id, position) VALUES ('cr1', 'cj1', 'TypeScript', 'required', 'cs1', 0)`,
      `INSERT INTO career_requirement (id, job_id, text, type, position) VALUES ('cr2', 'cj1', '5+ years', 'not_mapped', 1)`,
      `INSERT INTO career_job_event (id, job_id, status, at) VALUES ('cev1', 'cj1', 'evaluated', 't1')`,
      // Career Lab (CA-02b): cj1's selection and kit, a form and a standard
      // answer, the criteria, an opening, a story with an answer, a drill.
      `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'fact', 'cf1', 'ai', 0)`,
      `INSERT INTO career_job_kit (job_id, salary_min, salary_max, salary_currency, salary_period, updated_at) VALUES ('cj1', 40, 60, 'USD', 'hour', 't')`,
      `INSERT INTO career_form_answer (id, job_id, question, answer, position) VALUES ('cfa1', 'cj1', 'Why us?', 'Your evals problem', 0)`,
      `INSERT INTO career_standard_answer (id, label, value, position) VALUES ('csa1', 'Notice period', '30 days', 0)`,
      `INSERT INTO career_search_criteria (id, queries_json, lanes_json, max_hours, rate_floor, rate_currency, rate_period, max_age_days, updated_at) VALUES ('criteria', '["ai engineer"]', '["AI engineering"]', 20, 35, 'USD', 'hour', 14, 't')`,
      `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('co1', 'https://jobs.example/1', 'Acme', 'AI Engineer', 'AI engineering', 'Excerpt', 'Evals-heavy', 'new', NULL, 't', 't')`,
      `INSERT INTO career_story (id, title, situation, task, action, result, experience_id, created_at, updated_at) VALUES ('cst1', 'Cut eval time', 's', 't', 'a', 'r', 'ce1', 't', 't')`,
      `INSERT INTO career_story_fact (story_id, fact_id) VALUES ('cst1', 'cf1')`,
      `INSERT INTO career_story_skill (story_id, skill_id) VALUES ('cst1', 'cs1')`,
      `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('can1', 'Tell me about yourself', 'I build evals', 'aaaaaaaaaa', 'cst1', 'cj1', 't', 't')`,
      `INSERT INTO career_drill (id, at, mode, topic, weakest_json, fix) VALUES ('cd1', 't', 'behavioral', 'Acme', '["a","b"]', 'Quantify the result')`,
    ].map((sql) => db().prepare(sql)),
  );
});

describe("permitted writes succeed", () => {
  it.each([
    [
      "user",
      `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at) VALUES ('u1', 'h', 's', 1, 'UTC', 't')`,
    ],
    [
      "mutation",
      `INSERT INTO mutation (key, scope, response_json, created_at) VALUES ('k1', 'POST /api/x', '{}', 't')`,
    ],
    [
      "auth_attempt",
      `INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES ('ip1', 1, 1)`,
    ],
    [
      "skill with default aliases",
      `INSERT INTO skill (id, name, created_at) VALUES ('p1', 'Rust', 't')`,
    ],
    ["skill soft delete", `UPDATE skill SET deleted_at = 't' WHERE id = 'p1'`],
    [
      "alias of a soft-deleted skill's name (C-8 ignores it)",
      `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('p2', 'Rust Lang', '["Rust"]', 't')`,
    ],
    [
      "mcp_call ok",
      `INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m1', 'study_add_topic', 'claude', 1, 't')`,
    ],
    [
      "mcp_call failed write",
      `INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m2', 'career_add_job', 'claude', 0, 't')`,
    ],
    [
      "session_version bump",
      `UPDATE user SET session_version = session_version + 1 WHERE id = 'v1'`,
    ],
    [
      "learn_area new area",
      `INSERT INTO learn_area (id, prefix, name, position, created_at) VALUES ('area-ai', 'AI', 'AI and Machine Learning', 8, 't')`,
    ],
    [
      "learn_area rename",
      `UPDATE learn_area SET name = 'Software Architecture and Design' WHERE id = 'area-sa'`,
    ],
    [
      "learn_area prefix rewritten unchanged",
      `UPDATE learn_area SET prefix = 'CS' WHERE id = 'area-cs'`,
    ],
    [
      "learn_area next_seq claimed",
      `UPDATE learn_area SET next_seq = next_seq + 1 WHERE id = 'area-fe'`,
    ],
    [
      "learn_topic with defaults",
      `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('t2', 'FE-01', 'area-fe', 'ss2', 't', 't')`,
    ],
    [
      "learn_topic edited",
      `UPDATE learn_topic SET level = 'essential', priority = 1, status = 'in_progress', note = 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', started_on = '2026-10-19' WHERE id = 't2'`,
    ],
    [
      "learn_topic soft delete",
      `UPDATE learn_topic SET deleted_at = 't' WHERE id = 't2'`,
    ],
    [
      "learn_topic restore",
      `UPDATE learn_topic SET deleted_at = NULL WHERE id = 't2'`,
    ],
    [
      "learn_course Specialized module 4",
      `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at) VALUES ('c2', 't1', 'specialized', 4, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__specialized_m4.md', 't')`,
    ],
    [
      "learn_exam next attempt",
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('e4', 't1', 'essential', 3, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-3.md', 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-3.pdf', 't')`,
    ],
    [
      "learn_exam first attempt at another level",
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('e5', 't2', 'specialized', 1, 'Study Lab/frontend/react/react__specialized__exam-1.md', 'Study Lab/frontend/react/react__specialized__exam-1.pdf', 't')`,
    ],
    [
      "learn_exam graded",
      `UPDATE learn_exam SET grade = 70, graded_at = 'g4' WHERE id = 'e4'`,
    ],
    [
      "learn_exam grade corrected, graded_at kept",
      `UPDATE learn_exam SET grade = 90 WHERE id = 'e1'`,
    ],
    [
      "K-1 person edited",
      `UPDATE career_person SET full_name = 'Owner', languages_json = '[{"name":"English","level":"C1"}]' WHERE id = 'person'`,
    ],
    [
      "K-2 link",
      `INSERT INTO career_link (id, kind, label, url, position, created_at) VALUES ('cl1', 'github', 'GitHub', 'https://github.com/someone', 0, 't')`,
    ],
    [
      "K-3 photo set",
      `UPDATE career_person SET photo_key = 'profile/photo.jpg', photo_type = 'image/jpeg' WHERE id = 'person'`,
    ],
    [
      "K-3 photo replaced",
      `UPDATE career_person SET photo_key = 'profile/photo.webp', photo_type = 'image/webp' WHERE id = 'person'`,
    ],
    [
      "K-3 photo removed",
      `UPDATE career_person SET photo_key = NULL, photo_type = NULL WHERE id = 'person'`,
    ],
    [
      "K-4 education in progress",
      `INSERT INTO career_education (id, institution, degree, start_on, position, created_at) VALUES ('ced2', 'MIT', 'MSc', '2024-09', 1, 't')`,
    ],
    [
      "K-4 end a year without month after a month",
      `INSERT INTO career_experience (id, organization, title, kind, start_on, end_on, position, created_at) VALUES ('ce2', 'Lab', 'Researcher', 'research', '2020-05', '2020', 1, 't')`,
    ],
    [
      "K-4 end in the start month",
      `UPDATE career_experience SET end_on = '2023-04' WHERE id = 'ce1'`,
    ],
    [
      "K-4 back to current",
      `UPDATE career_experience SET end_on = NULL WHERE id = 'ce1'`,
    ],
    [
      "K-5 fact under education",
      `INSERT INTO career_fact (id, education_id, text, position, created_at, updated_at) VALUES ('cf2', 'ced1', 'Thesis on evals', 0, 't', 't')`,
    ],
    [
      "K-5 fact with no parent, 300 characters",
      `INSERT INTO career_fact (id, text, position, created_at, updated_at) VALUES ('cf3', substr(hex(zeroblob(150)), 1, 300), 0, 't', 't')`,
    ],
    [
      "K-5 fact verified",
      `UPDATE career_fact SET verified = 1 WHERE id = 'cf1'`,
    ],
    [
      "K-8 fact soft-deleted",
      `UPDATE career_fact SET deleted_at = 't' WHERE id = 'cf3'`,
    ],
    [
      "K-7 declared without years",
      `INSERT INTO career_declared_skill (skill_id, level, created_at, updated_at) VALUES ('cs2', 'familiar', 't', 't')`,
    ],
    [
      "K-7 years 0",
      `UPDATE career_declared_skill SET years = 0 WHERE skill_id = 'cs2'`,
    ],
    [
      "K-9 requirement unmapped",
      `UPDATE career_requirement SET type = 'not_mapped', skill_id = NULL WHERE id = 'cr1'`,
    ],
    [
      "K-9 requirement mapped again",
      `UPDATE career_requirement SET type = 'nice', skill_id = 'cs2' WHERE id = 'cr1'`,
    ],
    [
      "K-10 unscored job scored",
      `UPDATE career_job SET fit_total = 54, fit_constraints = 14, fit_skills = 25, fit_growth = 0, fit_pay = 15, fit_signal = 0, decision = 'skip' WHERE id = 'cj2'`,
    ],
    [
      "K-10 score cleared",
      `UPDATE career_job SET fit_total = NULL, fit_constraints = NULL, fit_skills = NULL, fit_growth = NULL, fit_pay = NULL, fit_signal = NULL, decision = NULL WHERE id = 'cj2'`,
    ],
    [
      "K-10 full marks, 20,000-character posting",
      `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('cj3', 'Acme', 'AI Engineer', 'en', substr(hex(zeroblob(10000)), 1, 20000), 100, 25, 25, 20, 15, 15, 'apply', 't', 't')`,
    ],
    [
      "K-11 event applied",
      `INSERT INTO career_job_event (id, job_id, status, at, note) VALUES ('cev2', 'cj1', 'applied', 't2', 'Sent')`,
    ],
    [
      "K-14 job soft-deleted",
      `UPDATE career_job SET deleted_at = 't' WHERE id = 'cj3'`,
    ],
    [
      "K-15 an experience selected",
      `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'experience', 'ce1', 'ai', 1)`,
    ],
    [
      "K-15 an education selected",
      `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'education', 'ced1', 'ai', 2)`,
    ],
    [
      "K-15 a skill selected",
      `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'skill', 'cs1', 'ai', 3)`,
    ],
    [
      "K-15 selection replaced",
      `DELETE FROM career_job_item WHERE job_id = 'cj1' AND item_kind = 'skill'`,
    ],
    [
      "K-16 currency BRL",
      `UPDATE career_job_kit SET salary_currency = 'BRL' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 currency USD",
      `UPDATE career_job_kit SET salary_currency = 'USD' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 currency EUR",
      `UPDATE career_job_kit SET salary_currency = 'EUR' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 currency GBP",
      `UPDATE career_job_kit SET salary_currency = 'GBP' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 currency CAD",
      `UPDATE career_job_kit SET salary_currency = 'CAD' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 currency AUD",
      `UPDATE career_job_kit SET salary_currency = 'AUD' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 currency CHF",
      `UPDATE career_job_kit SET salary_currency = 'CHF' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 period hour",
      `UPDATE career_job_kit SET salary_period = 'hour' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 period month",
      `UPDATE career_job_kit SET salary_period = 'month' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 period year",
      `UPDATE career_job_kit SET salary_period = 'year' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 min = max",
      `UPDATE career_job_kit SET salary_min = 50, salary_max = 50 WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 salary cleared",
      `UPDATE career_job_kit SET salary_min = NULL, salary_max = NULL, salary_currency = NULL, salary_period = NULL WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 salary set again, from 0",
      `UPDATE career_job_kit SET salary_min = 0, salary_max = 60, salary_currency = 'USD', salary_period = 'hour' WHERE job_id = 'cj1'`,
    ],
    [
      "K-16 a kit without a salary",
      `INSERT INTO career_job_kit (job_id, intro, updated_at) VALUES ('cj2', '', 't')`,
    ],
    [
      "K-17 intro 1,500",
      `UPDATE career_job_kit SET intro = substr(hex(zeroblob(750)), 1, 1500) WHERE job_id = 'cj1'`,
    ],
    [
      "K-17 form answer 2,000",
      `UPDATE career_form_answer SET answer = substr(hex(zeroblob(1000)), 1, 2000) WHERE id = 'cfa1'`,
    ],
    [
      "K-18 another label",
      `INSERT INTO career_standard_answer (id, label, value, position) VALUES ('csa2', 'Earliest start', 'Two weeks', 1)`,
    ],
    [
      "K-19 value 300",
      `UPDATE career_standard_answer SET value = substr(hex(zeroblob(150)), 1, 300) WHERE id = 'csa2'`,
    ],
    [
      "K-21 rate floor cleared",
      `UPDATE career_search_criteria SET rate_floor = NULL, rate_currency = NULL, rate_period = NULL WHERE id = 'criteria'`,
    ],
    [
      "K-21 rate floor 0",
      `UPDATE career_search_criteria SET rate_floor = 0, rate_currency = 'BRL', rate_period = 'month' WHERE id = 'criteria'`,
    ],
    [
      "K-21 no hours, one day",
      `UPDATE career_search_criteria SET max_hours = 0, max_age_days = 1 WHERE id = 'criteria'`,
    ],
    [
      "K-22 another opening, 4,000-character excerpt",
      `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('co2', 'https://jobs.example/2', 'Acme', 'AI Engineer', 'AI engineering', substr(hex(zeroblob(2000)), 1, 4000), 'Evals-heavy', 'new', NULL, 't', 't')`,
    ],
    [
      "K-22 opening kept",
      `UPDATE career_opening SET status = 'kept' WHERE id = 'co1'`,
    ],
    [
      "K-22 opening dismissed",
      `UPDATE career_opening SET status = 'dismissed' WHERE id = 'co1'`,
    ],
    [
      "K-23 opening tracked with its job",
      `UPDATE career_opening SET status = 'tracked', job_id = 'cj1' WHERE id = 'co2'`,
    ],
    [
      "K-23 opening saved tracked",
      `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('co3', 'https://jobs.example/3', 'Acme', 'AI Engineer', 'AI engineering', 'Excerpt', 'Evals-heavy', 'tracked', 'cj2', 't', 't')`,
    ],
    [
      "K-24 STAR parts 600",
      `INSERT INTO career_story (id, title, situation, task, action, result, experience_id, created_at, updated_at) VALUES ('cst2', 'Cut eval time', substr(hex(zeroblob(300)), 1, 600), substr(hex(zeroblob(300)), 1, 600), substr(hex(zeroblob(300)), 1, 600), substr(hex(zeroblob(300)), 1, 600), 'ce1', 't', 't')`,
    ],
    [
      "K-25 story rests on an education fact",
      `INSERT INTO career_story_fact (story_id, fact_id) VALUES ('cst1', 'cf2')`,
    ],
    [
      "K-26 Drive ID 100",
      `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('can2', 'Tell me about yourself', 'I build evals', substr(hex(zeroblob(50)), 1, 100), NULL, NULL, 't', 't')`,
    ],
    [
      "K-26 Drive ID with - and _",
      `UPDATE career_answer SET drive_file_id = '1aBcD_eFgHiJ-kLmNo' WHERE id = 'can1'`,
    ],
    [
      "K-26 video removed",
      `UPDATE career_answer SET drive_file_id = NULL WHERE id = 'can2'`,
    ],
    [
      "K-27 general answer, 3,000 characters",
      `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('can3', 'Tell me about yourself', substr(hex(zeroblob(1500)), 1, 3000), NULL, NULL, NULL, 't', 't')`,
    ],
    [
      "K-28 technical drill, no weak answers",
      `INSERT INTO career_drill (id, at, mode, topic, weakest_json, fix) VALUES ('cd2', 't2', 'technical', 'Eval harness', '[]', 'Nothing')`,
    ],
    [
      "K-28 negotiation drill",
      `INSERT INTO career_drill (id, at, mode, topic, weakest_json, fix) VALUES ('cd3', 't3', 'negotiation', 'Acme rate', '["Anchored low"]', 'Open at the top')`,
    ],
    [
      "S-22 an app exam without a PDF",
      `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES ('ae4', 't1', 'fast_track', 5, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-5.md', NULL, 'app', 't')`,
    ],
    [
      "S-18 a paper for an app exam",
      `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at) VALUES ('ae4', 'Big-O', '{}', '[]', '[]', '[]', 't', 't')`,
    ],
    [
      "S-20 a draft saved",
      `UPDATE learn_exam_paper SET draft_json = '[{"type":"OPEN","text":"a"}]', updated_at = 't2' WHERE exam_id = 'ae4'`,
    ],
    [
      "S-21 submitted with results",
      `UPDATE learn_exam_paper SET submitted_at = 's', results_json = '[]' WHERE exam_id = 'ae4'`,
    ],
  ])("%s", async (_, sql) => {
    await expect(run(sql)).resolves.toBeDefined();
  });
});

// [name, error the write must fail with, sql]
const forbidden: [string, string, string][] = [
  [
    "C-1 name differing only in case",
    "UNIQUE constraint failed",
    `INSERT INTO skill (id, name, created_at) VALUES ('x1', 'postgresql', 't')`,
  ],
  [
    "C-2 empty name",
    "skill_name_not_blank",
    `INSERT INTO skill (id, name, created_at) VALUES ('x2', '', 't')`,
  ],
  [
    "C-2 blank name",
    "skill_name_not_blank",
    `INSERT INTO skill (id, name, created_at) VALUES ('x3', '   ', 't')`,
  ],
  [
    "C-3 aliases not an array",
    "skill_aliases_json_array",
    `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x4', 'Zig', '{}', 't')`,
  ],
  [
    "C-3 aliases not JSON",
    "skill_aliases_json_array",
    `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x5', 'Zig', 'nope', 't')`,
  ],
  ...["study_", "Study_add", "core-x", "lab_x", "core_x1", "xcore_x"].map(
    (tool): [string, string, string] => [
      `C-4 tool '${tool}'`,
      "mcp_call_tool_prefix",
      `INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('t-${tool}', '${tool}', 'claude', 1, 't')`,
    ],
  ),
  [
    "C-5 ok = 2",
    "mcp_call_ok_bool",
    `INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES ('m3', 'core_x', 'claude', 2, 't')`,
  ],
  [
    "C-6 count = 0",
    "auth_attempt_count_min",
    `INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES ('ip2', 1, 0)`,
  ],
  [
    "C-7 delete a live skill",
    "skill_no_hard_delete",
    `DELETE FROM skill WHERE id = 'd1'`,
  ],
  [
    "C-7 delete a soft-deleted skill",
    "skill_no_hard_delete",
    `DELETE FROM skill WHERE id = 'd2'`,
  ],
  [
    "C-8 alias = another alias, other case",
    "skill_alias_conflict",
    `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x6', 'MySQL', '["postgres"]', 't')`,
  ],
  [
    "C-8 alias = another name",
    "skill_alias_conflict",
    `INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('x7', 'PG Tools', '["postgresql"]', 't')`,
  ],
  [
    "C-8 name = another alias",
    "skill_alias_conflict",
    `INSERT INTO skill (id, name, created_at) VALUES ('x8', 'pg', 't')`,
  ],
  [
    "C-8 update to a taken alias",
    "skill_alias_conflict",
    `UPDATE skill SET aliases_json = '["Go", "POSTGRES"]' WHERE id = 's3'`,
  ],
  [
    "C-8 restore into a conflict",
    "skill_alias_conflict",
    `UPDATE skill SET deleted_at = NULL WHERE id = 's2'`,
  ],
  [
    "C-9 negative session_version on insert",
    "user_session_version_min",
    `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at, session_version) VALUES ('v2', 'h', 's', 1, 'UTC', 't', -1)`,
  ],
  [
    "C-9 text session_version on insert",
    "user_session_version_min",
    `INSERT INTO user (id, auth_key_hash, kdf_salt, kdf_iterations, timezone, created_at, session_version) VALUES ('v3', 'h', 's', 1, 'UTC', 't', 'session_version')`,
  ],
  [
    "C-9 negative session_version on update",
    "user_session_version_min",
    `UPDATE user SET session_version = -1 WHERE id = 'v1'`,
  ],
  [
    "S-1 lowercase prefix",
    "learn_area_prefix_format",
    `INSERT INTO learn_area (id, prefix, name, position, created_at) VALUES ('xa1', 'cs', 'Lower', 9, 't')`,
  ],
  [
    "S-1 one-letter prefix",
    "learn_area_prefix_format",
    `INSERT INTO learn_area (id, prefix, name, position, created_at) VALUES ('xa2', 'C', 'Short', 9, 't')`,
  ],
  [
    "S-1 three-letter prefix",
    "learn_area_prefix_format",
    `INSERT INTO learn_area (id, prefix, name, position, created_at) VALUES ('xa3', 'CSX', 'Long', 9, 't')`,
  ],
  [
    "S-1 prefix with a digit",
    "learn_area_prefix_format",
    `INSERT INTO learn_area (id, prefix, name, position, created_at) VALUES ('xa4', 'C1', 'Digit', 9, 't')`,
  ],
  [
    "S-1 prefix taken",
    "UNIQUE constraint failed: learn_area.prefix",
    `INSERT INTO learn_area (id, prefix, name, position, created_at) VALUES ('xa5', 'FE', 'Another frontend', 9, 't')`,
  ],
  [
    "S-2 blank name",
    "learn_area_name_not_blank",
    `INSERT INTO learn_area (id, prefix, name, position, created_at) VALUES ('xa6', 'XB', '   ', 9, 't')`,
  ],
  [
    "S-2 name taken, other case",
    "UNIQUE constraint failed",
    `INSERT INTO learn_area (id, prefix, name, position, created_at) VALUES ('xa7', 'XC', 'frontend', 9, 't')`,
  ],
  [
    "S-3 next_seq 0",
    "learn_area_next_seq_min",
    `INSERT INTO learn_area (id, prefix, name, position, created_at, next_seq) VALUES ('xa8', 'XD', 'Zero', 9, 't', 0)`,
  ],
  [
    "S-3 next_seq as text",
    "learn_area_next_seq_min",
    `INSERT INTO learn_area (id, prefix, name, position, created_at, next_seq) VALUES ('xa9', 'XE', 'Text', 9, 't', 'x')`,
  ],
  [
    "S-4 delete an area",
    "learn_area_no_delete",
    `DELETE FROM learn_area WHERE id = 'area-se'`,
  ],
  [
    "S-4 change a prefix",
    "learn_area_prefix_fixed",
    `UPDATE learn_area SET prefix = 'SX' WHERE id = 'area-se'`,
  ],
  [
    "S-5 code taken",
    "UNIQUE constraint failed: learn_topic.code",
    `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('xt1', 'CS-01', 'area-se', 'ss3', 't', 't')`,
  ],
  [
    "S-6 a second topic for a skill",
    "UNIQUE constraint failed: learn_topic.skill_id",
    `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('xt2', 'SE-90', 'area-se', 'ss1', 't', 't')`,
  ],
  [
    "S-6 unknown skill",
    "FOREIGN KEY constraint failed",
    `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at) VALUES ('xt3', 'SE-91', 'area-se', 'no-such-skill', 't', 't')`,
  ],
  [
    "S-7 unknown level",
    "learn_topic_level_allowed",
    `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at, level) VALUES ('xt4', 'SE-92', 'area-se', 'ss3', 't', 't', 'expert')`,
  ],
  [
    "S-7 priority 4",
    "learn_topic_priority_range",
    `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at, priority) VALUES ('xt5', 'SE-93', 'area-se', 'ss3', 't', 't', 4)`,
  ],
  [
    "S-7 priority as non-numeric text",
    "learn_topic_priority_range",
    `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at, priority) VALUES ('xt6', 'SE-94', 'area-se', 'ss3', 't', 't', 'high')`,
  ],
  [
    "S-7 unknown status",
    "learn_topic_status_allowed",
    `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at, status) VALUES ('xt7', 'SE-95', 'area-se', 'ss3', 't', 't', 'paused')`,
  ],
  [
    "S-8 note of 121 characters",
    "learn_topic_note_length",
    `INSERT INTO learn_topic (id, code, area_id, skill_id, created_at, updated_at, note) VALUES ('xt8', 'SE-96', 'area-se', 'ss3', 't', 't', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')`,
  ],
  [
    "S-9 delete a topic",
    "learn_topic_no_delete",
    `DELETE FROM learn_topic WHERE id = 't1'`,
  ],
  [
    "S-9 move a topic to another area",
    "learn_topic_fixed",
    `UPDATE learn_topic SET area_id = 'area-se' WHERE id = 't1'`,
  ],
  [
    "S-9 change a code",
    "learn_topic_fixed",
    `UPDATE learn_topic SET code = 'CS-99' WHERE id = 't1'`,
  ],
  [
    "S-10 course level unset",
    "learn_course_level_allowed",
    `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at) VALUES ('xc1', 't1', 'unset', 1, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__x1.md', 't')`,
  ],
  [
    "S-11 module 2 on an Essential course",
    "learn_course_module_range",
    `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at) VALUES ('xc2', 't1', 'essential', 2, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__x2.md', 't')`,
  ],
  [
    "S-11 module 5",
    "learn_course_module_range",
    `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at) VALUES ('xc3', 't1', 'specialized', 5, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__x3.md', 't')`,
  ],
  [
    "S-11 module 0",
    "learn_course_module_range",
    `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at) VALUES ('xc4', 't1', 'specialized', 0, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__x4.md', 't')`,
  ],
  [
    "S-12 path outside Study Lab",
    "learn_course_path_layout",
    `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at) VALUES ('xc5', 't1', 'essential', 1, 'courses/cs-fundamentals/x.md', 't')`,
  ],
  [
    "S-12 path not Markdown",
    "learn_course_path_layout",
    `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at) VALUES ('xc6', 't1', 'essential', 1, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential.pdf', 't')`,
  ],
  [
    "S-12 path taken",
    "UNIQUE constraint failed: learn_course.path",
    `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at) VALUES ('xc7', 't1', 'fast_track', 1, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track.md', 't')`,
  ],
  [
    "S-13 attempt 0",
    "learn_exam_attempt_min",
    `UPDATE learn_exam SET attempt = 0 WHERE id = 'e2'`,
  ],
  [
    "S-13 attempt repeated at a level",
    "UNIQUE constraint failed",
    `UPDATE learn_exam SET attempt = 1 WHERE id = 'e2'`,
  ],
  [
    "S-14 attempt repeated on insert",
    "learn_exam_attempt_next",
    `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('xe1', 't1', 'essential', 2, 'Study Lab/a/b/b__essential__exam-x1.md', 'Study Lab/a/b/b__essential__exam-x1.pdf', 't')`,
  ],
  [
    "S-14 attempt skipped",
    "learn_exam_attempt_next",
    `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('xe2', 't1', 'fast_track', 3, 'Study Lab/a/b/b__x__exam-x2.md', 'Study Lab/a/b/b__x__exam-x2.pdf', 't')`,
  ],
  [
    "S-15 md path not Markdown",
    "learn_exam_path_layout",
    `UPDATE learn_exam SET md_path = 'Study Lab/a/b/b__essential__exam-2.pdf' WHERE id = 'e2'`,
  ],
  [
    "S-15 pdf path not a PDF",
    "learn_exam_pdf",
    `UPDATE learn_exam SET pdf_path = 'Study Lab/a/b/b__essential__exam-2.md' WHERE id = 'e2'`,
  ],
  [
    "S-15 md path taken",
    "UNIQUE constraint failed: learn_exam.md_path",
    `UPDATE learn_exam SET md_path = 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-1.md' WHERE id = 'e2'`,
  ],
  [
    "S-16 created graded",
    "learn_exam_grade",
    `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at, grade, graded_at) VALUES ('xe3', 't1', 'fast_track', 2, 'Study Lab/a/b/b__x__exam-x3.md', 'Study Lab/a/b/b__x__exam-x3.pdf', 't', 80, 'g')`,
  ],
  [
    "S-16 grade without graded_at",
    "learn_exam_grade",
    `UPDATE learn_exam SET grade = 80 WHERE id = 'e2'`,
  ],
  [
    "S-16 graded_at without grade",
    "learn_exam_grade",
    `UPDATE learn_exam SET graded_at = 'g' WHERE id = 'e2'`,
  ],
  [
    "S-16 grade 101",
    "learn_exam_grade",
    `UPDATE learn_exam SET grade = 101, graded_at = 'g' WHERE id = 'e2'`,
  ],
  [
    "S-16 grade as a float",
    "learn_exam_grade",
    `UPDATE learn_exam SET grade = 8.5, graded_at = 'g' WHERE id = 'e2'`,
  ],
  [
    "S-16 grade as non-numeric text",
    "learn_exam_grade",
    `UPDATE learn_exam SET grade = 'eighty', graded_at = 'g' WHERE id = 'e2'`,
  ],
  [
    "S-16 grade cleared",
    "learn_exam_grade",
    `UPDATE learn_exam SET grade = NULL, graded_at = NULL WHERE id = 'e1'`,
  ],
  [
    "S-16 graded_at moved",
    "learn_exam_grade",
    `UPDATE learn_exam SET graded_at = 'g9' WHERE id = 'e1'`,
  ],
  [
    "S-17 exam level unset",
    "learn_exam_level_allowed",
    `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, created_at) VALUES ('xe4', 't1', 'unset', 1, 'Study Lab/a/b/b__x__exam-x4.md', 'Study Lab/a/b/b__x__exam-x4.pdf', 't')`,
  ],
  [
    "S-22 a Claude exam without a PDF",
    "learn_exam_pdf",
    `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES ('xa1', 't1', 'fast_track', 6, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-6.md', NULL, 'claude', 't')`,
  ],
  [
    "S-22 an unknown source",
    "learn_exam_source_allowed",
    `INSERT INTO learn_exam (id, topic_id, level, attempt, md_path, pdf_path, source, created_at) VALUES ('xa2', 't1', 'fast_track', 6, 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-6.md', 'Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track__exam-6.pdf', 'web', 't')`,
  ],
  [
    "S-22 a source changed",
    "learn_exam_pdf",
    `UPDATE learn_exam SET source = 'app' WHERE id = 'e1'`,
  ],
  [
    "S-22 a Claude exam's PDF cleared",
    "learn_exam_pdf",
    `UPDATE learn_exam SET pdf_path = NULL WHERE id = 'e1'`,
  ],
  [
    "S-22 an app exam's PDF outside Study Lab",
    "learn_exam_pdf",
    `UPDATE learn_exam SET pdf_path = 'exam.pdf' WHERE id = 'ae1'`,
  ],
  [
    "S-18 a paper for a Claude exam",
    "learn_exam_paper: only an exam made in the app",
    `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at) VALUES ('e1', 'Big-O', '{}', '[]', '[]', '[]', 't', 't')`,
  ],
  [
    "S-18 a paper for no exam",
    "learn_exam_paper: only an exam made in the app",
    `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at) VALUES ('nope', 'Big-O', '{}', '[]', '[]', '[]', 't', 't')`,
  ],
  [
    "S-18 a second paper for an exam",
    "UNIQUE constraint failed: learn_exam_paper.exam_id",
    `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at) VALUES ('ae1', 'Big-O', '{}', '[]', '[]', '[]', 't', 't')`,
  ],
  [
    "S-18 settings not JSON",
    "learn_exam_paper_json",
    `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at) VALUES ('ae2', 'Big-O', 'x', '[]', '[]', '[]', 't', 't')`,
  ],
  [
    "S-18 a blank title",
    "learn_exam_paper_title",
    `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at) VALUES ('ae2', '  ', '{}', '[]', '[]', '[]', 't', 't')`,
  ],
  [
    "S-19 the questions changed",
    "the questions and key never change",
    `UPDATE learn_exam_paper SET questions_json = '[1]' WHERE exam_id = 'ae3'`,
  ],
  [
    "S-19 the key changed",
    "the questions and key never change",
    `UPDATE learn_exam_paper SET key_json = '[1]' WHERE exam_id = 'ae3'`,
  ],
  [
    "S-19 the title changed",
    "the questions and key never change",
    `UPDATE learn_exam_paper SET title = 'Other' WHERE exam_id = 'ae3'`,
  ],
  [
    "S-19 the settings changed",
    "the questions and key never change",
    `UPDATE learn_exam_paper SET settings_json = '{"questions":3}' WHERE exam_id = 'ae3'`,
  ],
  [
    "S-21 submitted without results",
    "learn_exam_paper_submitted",
    `UPDATE learn_exam_paper SET submitted_at = 's' WHERE exam_id = 'ae3'`,
  ],
  [
    "S-21 results without submitted",
    "learn_exam_paper_submitted",
    `UPDATE learn_exam_paper SET results_json = '[]' WHERE exam_id = 'ae3'`,
  ],
  [
    "S-21 results not JSON",
    "learn_exam_paper_submitted",
    `UPDATE learn_exam_paper SET submitted_at = 's', results_json = 'nope' WHERE exam_id = 'ae3'`,
  ],
  [
    "S-20 a draft after submit",
    "the answers are submitted",
    `UPDATE learn_exam_paper SET draft_json = '[1]' WHERE exam_id = 'ae1'`,
  ],
  [
    "S-21 submitted again",
    "learn_exam_paper_submitted",
    `UPDATE learn_exam_paper SET submitted_at = 's2' WHERE exam_id = 'ae1'`,
  ],
  [
    "S-21 results changed",
    "learn_exam_paper_submitted",
    `UPDATE learn_exam_paper SET results_json = '[1]' WHERE exam_id = 'ae1'`,
  ],
  [
    "S-21 results cleared",
    "learn_exam_paper_submitted",
    `UPDATE learn_exam_paper SET submitted_at = NULL, results_json = NULL WHERE exam_id = 'ae1'`,
  ],
  [
    "S-21 written half-submitted",
    "learn_exam_paper_submitted",
    `INSERT INTO learn_exam_paper (exam_id, title, settings_json, questions_json, key_json, draft_json, created_at, updated_at, submitted_at) VALUES ('ae2', 'Big-O', '{}', '[]', '[]', '[]', 't', 't', 's')`,
  ],
  [
    "K-1 a second person id",
    "career_person_one_row",
    `INSERT INTO career_person (id, updated_at) VALUES ('other', 't')`,
  ],
  [
    "K-1 the person twice",
    "UNIQUE constraint failed: career_person.id",
    `INSERT INTO career_person (id, updated_at) VALUES ('person', 't')`,
  ],
  [
    "K-1 summary 601",
    "career_person_summary_length",
    `UPDATE career_person SET summary = substr(hex(zeroblob(301)), 1, 601) WHERE id = 'person'`,
  ],
  [
    "K-1 languages not an array",
    "career_person_languages_array",
    `UPDATE career_person SET languages_json = '{}' WHERE id = 'person'`,
  ],
  [
    "K-2 unknown kind",
    "career_link_kind_allowed",
    `INSERT INTO career_link (id, kind, label, url, position, created_at) VALUES ('xl1', 'twitter', 'X', 'https://x.com/a', 0, 't')`,
  ],
  [
    "K-2 http link",
    "career_link_url_https",
    `INSERT INTO career_link (id, kind, label, url, position, created_at) VALUES ('xl2', 'other', 'Site', 'http://a.example', 0, 't')`,
  ],
  [
    "K-2 bare https://",
    "career_link_url_https",
    `INSERT INTO career_link (id, kind, label, url, position, created_at) VALUES ('xl3', 'other', 'Site', 'https://', 0, 't')`,
  ],
  [
    "K-2 negative position",
    "career_link_position_min",
    `INSERT INTO career_link (id, kind, label, url, position, created_at) VALUES ('xl4', 'other', 'Site', 'https://a.example', -1, 't')`,
  ],
  [
    "K-3 key without type",
    "career_person_photo",
    `UPDATE career_person SET photo_key = 'profile/photo.png' WHERE id = 'person'`,
  ],
  [
    "K-3 type without key",
    "career_person_photo",
    `UPDATE career_person SET photo_type = 'image/png' WHERE id = 'person'`,
  ],
  [
    "K-3 GIF",
    "career_person_photo",
    `UPDATE career_person SET photo_key = 'profile/photo.gif', photo_type = 'image/gif' WHERE id = 'person'`,
  ],
  [
    "K-3 key not the type's",
    "career_person_photo",
    `UPDATE career_person SET photo_key = 'profile/photo.png', photo_type = 'image/jpeg' WHERE id = 'person'`,
  ],
  [
    "K-3 key elsewhere",
    "career_person_photo",
    `UPDATE career_person SET photo_key = 'uploads/photo.jpg', photo_type = 'image/jpeg' WHERE id = 'person'`,
  ],
  [
    "K-3 person inserted with a key alone",
    "career_person_photo",
    `INSERT INTO career_person (id, photo_key, updated_at) VALUES ('person', 'profile/photo.jpg', 't')`,
  ],
  [
    "K-3 person inserted with the wrong key",
    "career_person_photo",
    `INSERT INTO career_person (id, photo_key, photo_type, updated_at) VALUES ('person', 'profile/photo.png', 'image/webp', 't')`,
  ],
  [
    "K-4 education end a month early",
    "career_dates",
    `INSERT INTO career_education (id, institution, degree, start_on, end_on, position, created_at) VALUES ('xed4', 'U', 'BSc', '2015-09', '2015-08', 0, 't')`,
  ],
  [
    "K-4 experience end a year early",
    "career_dates",
    `INSERT INTO career_experience (id, organization, title, kind, start_on, end_on, position, created_at) VALUES ('xe5', 'A', 'B', 'job', '2023', '2022-12', 0, 't')`,
  ],
  [
    "position negative (education)",
    "career_education_position_min",
    `INSERT INTO career_education (id, institution, degree, start_on, position, created_at) VALUES ('xed5', 'U', 'BSc', '2015', -1, 't')`,
  ],
  [
    "position as text (experience)",
    "career_experience_position_min",
    `INSERT INTO career_experience (id, organization, title, kind, start_on, position, created_at) VALUES ('xe6', 'A', 'B', 'job', '2023', 'first', 't')`,
  ],
  [
    "position negative (fact)",
    "career_fact_position_min",
    `UPDATE career_fact SET position = -1 WHERE id = 'cf1'`,
  ],
  [
    "position fractional (requirement)",
    "career_requirement_position_min",
    `UPDATE career_requirement SET position = 0.5 WHERE id = 'cr2'`,
  ],
  [
    "K-4 education start month 13",
    "career_education_start_format",
    `INSERT INTO career_education (id, institution, degree, start_on, position, created_at) VALUES ('xed1', 'U', 'BSc', '2020-13', 0, 't')`,
  ],
  [
    "K-4 experience start 04/2023",
    "career_experience_start_format",
    `INSERT INTO career_experience (id, organization, title, kind, start_on, position, created_at) VALUES ('xe1', 'A', 'B', 'job', '04/2023', 0, 't')`,
  ],
  [
    "K-4 experience start with a day",
    "career_experience_start_format",
    `INSERT INTO career_experience (id, organization, title, kind, start_on, position, created_at) VALUES ('xe2', 'A', 'B', 'job', '2023-04-01', 0, 't')`,
  ],
  [
    "K-4 experience end a month early",
    "career_dates",
    `INSERT INTO career_experience (id, organization, title, kind, start_on, end_on, position, created_at) VALUES ('xe3', 'A', 'B', 'job', '2023-04', '2023-03', 0, 't')`,
  ],
  [
    "K-4 education end a year early",
    "career_dates",
    `INSERT INTO career_education (id, institution, degree, start_on, end_on, position, created_at) VALUES ('xed2', 'U', 'BSc', '2015-09', '2014', 0, 't')`,
  ],
  [
    "K-4 end month 00",
    "career_dates",
    `INSERT INTO career_education (id, institution, degree, start_on, end_on, position, created_at) VALUES ('xed3', 'U', 'BSc', '2015', '2016-00', 0, 't')`,
  ],
  [
    "K-4 end updated before the start",
    "career_dates",
    `UPDATE career_experience SET end_on = '2022' WHERE id = 'ce1'`,
  ],
  [
    "K-4 start updated past the end",
    "career_dates",
    `UPDATE career_education SET start_on = '2020' WHERE id = 'ced1'`,
  ],
  [
    "K-4 unknown kind",
    "career_experience_kind_allowed",
    `INSERT INTO career_experience (id, organization, title, kind, start_on, position, created_at) VALUES ('xe4', 'A', 'B', 'volunteer', '2023', 0, 't')`,
  ],
  [
    "K-4 summary 601",
    "career_experience_summary_length",
    `UPDATE career_experience SET summary = substr(hex(zeroblob(301)), 1, 601) WHERE id = 'ce1'`,
  ],
  [
    "K-5 empty fact",
    "career_fact_text_length",
    `INSERT INTO career_fact (id, text, position, created_at, updated_at) VALUES ('xf1', '', 0, 't', 't')`,
  ],
  [
    "K-5 blank fact",
    "career_fact_text_length",
    `INSERT INTO career_fact (id, text, position, created_at, updated_at) VALUES ('xf2', '   ', 0, 't', 't')`,
  ],
  [
    "K-5 fact 301",
    "career_fact_text_length",
    `INSERT INTO career_fact (id, text, position, created_at, updated_at) VALUES ('xf3', substr(hex(zeroblob(151)), 1, 301), 0, 't', 't')`,
  ],
  [
    "K-5 verified 2",
    "career_fact_verified_bool",
    `UPDATE career_fact SET verified = 2 WHERE id = 'cf1'`,
  ],
  [
    "K-5 verified as text",
    "career_fact_verified_bool",
    `UPDATE career_fact SET verified = 'yes' WHERE id = 'cf1'`,
  ],
  [
    "K-5 fact under both",
    "career_fact_one_parent",
    `INSERT INTO career_fact (id, experience_id, education_id, text, position, created_at, updated_at) VALUES ('xf4', 'ce1', 'ced1', 'Both', 0, 't', 't')`,
  ],
  [
    "K-5 fact moved under both",
    "career_fact_one_parent",
    `UPDATE career_fact SET education_id = 'ced1' WHERE id = 'cf1'`,
  ],
  [
    "K-5 unknown experience",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_fact (id, experience_id, text, position, created_at, updated_at) VALUES ('xf5', 'nope', 'Orphan', 0, 't', 't')`,
  ],
  [
    "K-5 fact skill not in the registry",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_fact_skill (fact_id, skill_id) VALUES ('cf1', 'nope')`,
  ],
  [
    "K-5 fact skill twice",
    "UNIQUE constraint failed: career_fact_skill.fact_id, career_fact_skill.skill_id",
    `INSERT INTO career_fact_skill (fact_id, skill_id) VALUES ('cf1', 'cs1')`,
  ],
  [
    "K-6 a skill declared twice",
    "UNIQUE constraint failed: career_declared_skill.skill_id",
    `INSERT INTO career_declared_skill (skill_id, level, created_at, updated_at) VALUES ('cs1', 'working', 't', 't')`,
  ],
  [
    "K-6 declared skill not in the registry",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_declared_skill (skill_id, level, created_at, updated_at) VALUES ('nope', 'working', 't', 't')`,
  ],
  [
    "K-7 unknown level",
    "career_declared_skill_level_allowed",
    `UPDATE career_declared_skill SET level = 'expert' WHERE skill_id = 'cs1'`,
  ],
  [
    "K-7 negative years",
    "career_declared_skill_years",
    `UPDATE career_declared_skill SET years = -1 WHERE skill_id = 'cs1'`,
  ],
  [
    "K-7 fractional years",
    "career_declared_skill_years",
    `UPDATE career_declared_skill SET years = 2.5 WHERE skill_id = 'cs1'`,
  ],
  [
    "K-7 years as text on insert",
    "career_declared_skill_years",
    `INSERT INTO career_declared_skill (skill_id, level, years, created_at, updated_at) VALUES ('ss4', 'working', 'many', 't', 't')`,
  ],
  [
    "K-8 fact deleted",
    "career_fact_no_delete",
    `DELETE FROM career_fact WHERE id = 'cf2'`,
  ],
  [
    "K-8 soft-deleted fact deleted",
    "career_fact_no_delete",
    `DELETE FROM career_fact WHERE id = 'cf3'`,
  ],
  [
    "K-9 unknown type",
    "career_requirement_type_allowed",
    `INSERT INTO career_requirement (id, job_id, text, type, skill_id, position) VALUES ('xr1', 'cj1', 'Go', 'optional', 'cs1', 2)`,
  ],
  [
    "K-9 required without a skill",
    "career_requirement_skill",
    `INSERT INTO career_requirement (id, job_id, text, type, position) VALUES ('xr2', 'cj1', 'Go', 'required', 2)`,
  ],
  [
    "K-9 not mapped with a skill",
    "career_requirement_skill",
    `INSERT INTO career_requirement (id, job_id, text, type, skill_id, position) VALUES ('xr3', 'cj1', 'Visa', 'not_mapped', 'cs1', 2)`,
  ],
  [
    "K-9 skill removed from a mapped one",
    "career_requirement_skill",
    `UPDATE career_requirement SET skill_id = NULL WHERE id = 'cr1'`,
  ],
  [
    "K-9 mapped type without a skill",
    "career_requirement_skill",
    `UPDATE career_requirement SET type = 'required' WHERE id = 'cr2'`,
  ],
  [
    "K-9 requirement 121",
    "career_requirement_text_length",
    `INSERT INTO career_requirement (id, job_id, text, type, position) VALUES ('xr4', 'cj1', substr(hex(zeroblob(61)), 1, 121), 'not_mapped', 2)`,
  ],
  [
    "K-10 total not the sum",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj1', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 80, 20, 20, 15, 10, 10, 'apply', 't', 't')`,
  ],
  [
    "K-10 constraints 26",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj2', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 76, 26, 20, 10, 10, 10, 'apply', 't', 't')`,
  ],
  [
    "K-10 skills 26",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj3', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 76, 20, 26, 10, 10, 10, 'apply', 't', 't')`,
  ],
  [
    "K-10 growth 21",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj4', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 76, 20, 20, 21, 5, 10, 'apply', 't', 't')`,
  ],
  [
    "K-10 pay 16",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj5', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 76, 20, 20, 10, 16, 10, 'apply', 't', 't')`,
  ],
  [
    "K-10 signal 16",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj6', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 76, 20, 20, 10, 10, 16, 'apply', 't', 't')`,
  ],
  [
    "K-10 negative score",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj7', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 50, 20, 20, 10, 10, -10, 'skip', 't', 't')`,
  ],
  [
    "K-10 fractional score",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj8', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 75.5, 20, 20, 15, 10.5, 10, 'apply', 't', 't')`,
  ],
  [
    "K-10 unknown decision",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj9', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 75, 20, 20, 15, 10, 10, 'yes', 't', 't')`,
  ],
  [
    "K-10 scores without a decision",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj10', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 75, 20, 20, 15, 10, 10, NULL, 't', 't')`,
  ],
  [
    "K-10 a total alone",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj11', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', 75, NULL, NULL, NULL, NULL, NULL, 'apply', 't', 't')`,
  ],
  [
    "K-10 a decision alone",
    "career_job_fit",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj12', 'Acme', 'AI Engineer', 'en', 'We need an AI engineer', NULL, NULL, NULL, NULL, NULL, NULL, 'skip', 't', 't')`,
  ],
  [
    "K-10 one score changed, total kept",
    "career_job_fit",
    `UPDATE career_job SET fit_pay = 5 WHERE id = 'cj1'`,
  ],
  [
    "K-10 one score cleared",
    "career_job_fit",
    `UPDATE career_job SET fit_signal = NULL WHERE id = 'cj1'`,
  ],
  [
    "K-10 empty posting",
    "career_job_posting_length",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj13', 'Acme', 'AI Engineer', 'en', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 't', 't')`,
  ],
  [
    "K-10 posting 20,001",
    "career_job_posting_length",
    `INSERT INTO career_job (id, company, role, language, posting, fit_total, fit_constraints, fit_skills, fit_growth, fit_pay, fit_signal, decision, created_at, updated_at) VALUES ('xj14', 'Acme', 'AI Engineer', 'en', substr(hex(zeroblob(10001)), 1, 20001), NULL, NULL, NULL, NULL, NULL, NULL, NULL, 't', 't')`,
  ],
  [
    "K-10 fit notes 2,001",
    "career_job_fit_notes_length",
    `UPDATE career_job SET fit_notes = substr(hex(zeroblob(1001)), 1, 2001) WHERE id = 'cj1'`,
  ],
  [
    "K-11 unknown status",
    "career_job_event_status_allowed",
    `INSERT INTO career_job_event (id, job_id, status, at) VALUES ('xev1', 'cj1', 'ghosted', 't3')`,
  ],
  [
    "K-11 note 501",
    "career_job_event_note_length",
    `INSERT INTO career_job_event (id, job_id, status, at, note) VALUES ('xev2', 'cj1', 'applied', 't3', substr(hex(zeroblob(251)), 1, 501))`,
  ],
  [
    "K-11 event of an unknown job",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_job_event (id, job_id, status, at) VALUES ('xev3', 'nope', 'applied', 't3')`,
  ],
  [
    "K-12 event edited",
    "career_job_event_append_only",
    `UPDATE career_job_event SET status = 'offer' WHERE id = 'cev1'`,
  ],
  [
    "K-12 event note edited",
    "career_job_event_append_only",
    `UPDATE career_job_event SET note = 'later' WHERE id = 'cev1'`,
  ],
  [
    "K-12 event deleted",
    "career_job_event_append_only",
    `DELETE FROM career_job_event WHERE id = 'cev1'`,
  ],
  [
    "K-13 requirement skill not in the registry",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_requirement (id, job_id, text, type, skill_id, position) VALUES ('xr5', 'cj1', 'Go', 'required', 'nope', 2)`,
  ],
  [
    "K-13 requirement of an unknown job",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_requirement (id, job_id, text, type, position) VALUES ('xr6', 'nope', 'Visa', 'not_mapped', 0)`,
  ],
  [
    "K-14 job deleted",
    "career_job_no_delete",
    `DELETE FROM career_job WHERE id = 'cj2'`,
  ],
  [
    "K-14 soft-deleted job deleted",
    "career_job_no_delete",
    `DELETE FROM career_job WHERE id = 'cj3'`,
  ],
  [
    "K-15 unknown kind",
    "career_job_item_kind_allowed",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'file', 'cf1', 'ai', 4)`,
  ],
  [
    "K-15 unknown fact",
    "career_job_item_exists",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'fact', 'nope', 'ai', 4)`,
  ],
  [
    "K-15 a removed fact",
    "career_job_item_exists",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'fact', 'cf3', 'ai', 4)`,
  ],
  [
    "K-15 a fact as an experience",
    "career_job_item_exists",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'experience', 'cf1', 'ai', 4)`,
  ],
  [
    "K-15 unknown education",
    "career_job_item_exists",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'education', 'ce1', 'ai', 4)`,
  ],
  [
    "K-15 a soft-deleted skill",
    "career_job_item_exists",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'skill', 's2', 'ai', 4)`,
  ],
  [
    "K-15 item changed to an unknown one",
    "career_job_item_exists",
    `UPDATE career_job_item SET item_id = 'nope' WHERE job_id = 'cj1' AND item_kind = 'fact'`,
  ],
  [
    "K-15 the same item twice",
    "UNIQUE constraint failed: career_job_item.job_id, career_job_item.item_kind, career_job_item.item_id",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj1', 'fact', 'cf1', 'frontend', 4)`,
  ],
  [
    "K-15 empty variant",
    "career_job_item_variant_length",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj2', 'fact', 'cf1', '', 0)`,
  ],
  [
    "K-15 variant 31",
    "career_job_item_variant_length",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj2', 'fact', 'cf1', substr(hex(zeroblob(16)), 1, 31), 0)`,
  ],
  [
    "K-15 negative position",
    "career_job_item_position_min",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('cj2', 'fact', 'cf1', 'ai', -1)`,
  ],
  [
    "K-15 unknown job",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_job_item (job_id, item_kind, item_id, variant, position) VALUES ('nope', 'fact', 'cf1', 'ai', 0)`,
  ],
  [
    "K-16 min above max",
    "career_job_kit_salary",
    `UPDATE career_job_kit SET salary_min = 61 WHERE job_id = 'cj1'`,
  ],
  [
    "K-16 fractional min",
    "career_job_kit_salary",
    `UPDATE career_job_kit SET salary_min = 40.5 WHERE job_id = 'cj1'`,
  ],
  [
    "K-16 negative min",
    "career_job_kit_salary",
    `UPDATE career_job_kit SET salary_min = -1 WHERE job_id = 'cj1'`,
  ],
  [
    "K-16 unknown currency",
    "career_job_kit_salary",
    `UPDATE career_job_kit SET salary_currency = 'XYZ' WHERE job_id = 'cj1'`,
  ],
  [
    "K-16 lower-case currency",
    "career_job_kit_salary",
    `UPDATE career_job_kit SET salary_currency = 'usd' WHERE job_id = 'cj1'`,
  ],
  [
    "K-16 weekly",
    "career_job_kit_salary",
    `UPDATE career_job_kit SET salary_period = 'week' WHERE job_id = 'cj1'`,
  ],
  [
    "K-16 currency cleared alone",
    "career_job_kit_salary",
    `UPDATE career_job_kit SET salary_currency = NULL WHERE job_id = 'cj1'`,
  ],
  [
    "K-16 a min alone on insert",
    "career_job_kit_salary",
    `INSERT INTO career_job_kit (job_id, salary_min, updated_at) VALUES ('cj3', 40, 't')`,
  ],
  [
    "K-16 min above max on insert",
    "career_job_kit_salary",
    `INSERT INTO career_job_kit (job_id, salary_min, salary_max, salary_currency, salary_period, updated_at) VALUES ('cj3', 70, 60, 'USD', 'hour', 't')`,
  ],
  [
    "K-16 no period on insert",
    "career_job_kit_salary",
    `INSERT INTO career_job_kit (job_id, salary_min, salary_max, salary_currency, salary_period, updated_at) VALUES ('cj3', 40, 60, 'USD', NULL, 't')`,
  ],
  [
    "K-16 a second kit for a job",
    "UNIQUE constraint failed: career_job_kit.job_id",
    `INSERT INTO career_job_kit (job_id, updated_at) VALUES ('cj1', 't')`,
  ],
  [
    "K-16 kit of an unknown job",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_job_kit (job_id, updated_at) VALUES ('nope', 't')`,
  ],
  [
    "K-17 intro 1,501",
    "career_job_kit_intro_length",
    `UPDATE career_job_kit SET intro = substr(hex(zeroblob(751)), 1, 1501) WHERE job_id = 'cj1'`,
  ],
  [
    "K-17 form answer 2,001",
    "career_form_answer_answer_length",
    `UPDATE career_form_answer SET answer = substr(hex(zeroblob(1001)), 1, 2001) WHERE id = 'cfa1'`,
  ],
  [
    "K-17 empty form answer",
    "career_form_answer_answer_length",
    `UPDATE career_form_answer SET answer = '' WHERE id = 'cfa1'`,
  ],
  [
    "K-17 question 201",
    "career_form_answer_question_length",
    `UPDATE career_form_answer SET question = substr(hex(zeroblob(101)), 1, 201) WHERE id = 'cfa1'`,
  ],
  [
    "K-17 negative position",
    "career_form_answer_position_min",
    `UPDATE career_form_answer SET position = -1 WHERE id = 'cfa1'`,
  ],
  [
    "K-18 the same label in another case",
    "UNIQUE constraint failed: career_standard_answer.label",
    `INSERT INTO career_standard_answer (id, label, value, position) VALUES ('xsa1', 'notice PERIOD', '2 weeks', 2)`,
  ],
  [
    "K-18 blank label",
    "career_standard_answer_label_not_blank",
    `INSERT INTO career_standard_answer (id, label, value, position) VALUES ('xsa2', '  ', 'v', 2)`,
  ],
  [
    "K-19 value 301",
    "career_standard_answer_value_length",
    `UPDATE career_standard_answer SET value = substr(hex(zeroblob(151)), 1, 301) WHERE id = 'csa1'`,
  ],
  [
    "K-19 negative position",
    "career_standard_answer_position_min",
    `UPDATE career_standard_answer SET position = -1 WHERE id = 'csa1'`,
  ],
  [
    "K-20 another criteria id",
    "career_search_criteria_one_row",
    `INSERT INTO career_search_criteria (id, max_hours, max_age_days, updated_at) VALUES ('other', 20, 14, 't')`,
  ],
  [
    "K-20 the criteria twice",
    "UNIQUE constraint failed: career_search_criteria.id",
    `INSERT INTO career_search_criteria (id, max_hours, max_age_days, updated_at) VALUES ('criteria', 20, 14, 't')`,
  ],
  [
    "K-20 lanes not an array",
    "career_search_criteria_lists",
    `UPDATE career_search_criteria SET lanes_json = '{}' WHERE id = 'criteria'`,
  ],
  [
    "K-20 sources not JSON",
    "career_search_criteria_lists",
    `UPDATE career_search_criteria SET sources_json = 'RemoteOK' WHERE id = 'criteria'`,
  ],
  [
    "K-21 criteria inserted with a floor alone",
    "career_search_criteria_rate",
    `INSERT INTO career_search_criteria (id, queries_json, lanes_json, max_hours, rate_floor, rate_currency, rate_period, max_age_days, updated_at) VALUES ('criteria', '[]', '[]', 20, 35, NULL, NULL, 14, 't')`,
  ],
  [
    "K-21 negative hours",
    "career_search_criteria_max_hours",
    `UPDATE career_search_criteria SET max_hours = -1 WHERE id = 'criteria'`,
  ],
  [
    "K-21 fractional hours",
    "career_search_criteria_max_hours",
    `UPDATE career_search_criteria SET max_hours = 20.5 WHERE id = 'criteria'`,
  ],
  [
    "K-21 max age 0",
    "career_search_criteria_max_age",
    `UPDATE career_search_criteria SET max_age_days = 0 WHERE id = 'criteria'`,
  ],
  [
    "K-21 floor without currency",
    "career_search_criteria_rate",
    `UPDATE career_search_criteria SET rate_currency = NULL WHERE id = 'criteria'`,
  ],
  [
    "K-21 period cleared alone",
    "career_search_criteria_rate",
    `UPDATE career_search_criteria SET rate_period = NULL WHERE id = 'criteria'`,
  ],
  [
    "K-21 negative floor",
    "career_search_criteria_rate",
    `UPDATE career_search_criteria SET rate_floor = -5 WHERE id = 'criteria'`,
  ],
  [
    "K-21 fractional floor",
    "career_search_criteria_rate",
    `UPDATE career_search_criteria SET rate_floor = 35.5 WHERE id = 'criteria'`,
  ],
  [
    "K-21 unknown currency",
    "career_search_criteria_rate",
    `UPDATE career_search_criteria SET rate_currency = 'XYZ' WHERE id = 'criteria'`,
  ],
  [
    "K-21 weekly",
    "career_search_criteria_rate",
    `UPDATE career_search_criteria SET rate_period = 'week' WHERE id = 'criteria'`,
  ],
  [
    "K-22 a URL twice",
    "UNIQUE constraint failed: career_opening.url",
    `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('xo1', 'https://jobs.example/1', 'Acme', 'AI Engineer', 'AI engineering', 'Excerpt', 'Evals-heavy', 'new', NULL, 't', 't')`,
  ],
  [
    "K-22 http URL",
    "career_opening_url_https",
    `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('xo2', 'http://jobs.example/x', 'Acme', 'AI Engineer', 'AI engineering', 'Excerpt', 'Evals-heavy', 'new', NULL, 't', 't')`,
  ],
  [
    "K-22 unknown status",
    "career_opening_status_allowed",
    `UPDATE career_opening SET status = 'archived' WHERE id = 'co1'`,
  ],
  [
    "K-22 excerpt 4,001",
    "career_opening_posting_length",
    `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('xo3', 'https://jobs.example/x3', 'Acme', 'AI Engineer', 'AI engineering', substr(hex(zeroblob(2001)), 1, 4001), 'Evals-heavy', 'new', NULL, 't', 't')`,
  ],
  [
    "K-23 tracked without a job",
    "career_opening_tracked",
    `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('xo4', 'https://jobs.example/x4', 'Acme', 'AI Engineer', 'AI engineering', 'Excerpt', 'Evals-heavy', 'tracked', NULL, 't', 't')`,
  ],
  [
    "K-23 a job while new",
    "career_opening_tracked",
    `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('xo5', 'https://jobs.example/x5', 'Acme', 'AI Engineer', 'AI engineering', 'Excerpt', 'Evals-heavy', 'new', 'cj1', 't', 't')`,
  ],
  [
    "K-23 marked tracked alone",
    "career_opening_tracked",
    `UPDATE career_opening SET status = 'tracked' WHERE id = 'co1'`,
  ],
  [
    "K-23 tracked opening loses its job",
    "career_opening_tracked",
    `UPDATE career_opening SET job_id = NULL WHERE id = 'co2'`,
  ],
  [
    "K-23 tracked opening back to kept",
    "career_opening_tracked",
    `UPDATE career_opening SET status = 'kept' WHERE id = 'co2'`,
  ],
  [
    "K-23 unknown job",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_opening (id, url, company, role, lane, posting, why, status, job_id, created_at, updated_at) VALUES ('xo6', 'https://jobs.example/x6', 'Acme', 'AI Engineer', 'AI engineering', 'Excerpt', 'Evals-heavy', 'tracked', 'nope', 't', 't')`,
  ],
  [
    "K-24 situation 601",
    "career_story_parts_length",
    `INSERT INTO career_story (id, title, situation, task, action, result, experience_id, created_at, updated_at) VALUES ('xst1', 'Cut eval time', substr(hex(zeroblob(301)), 1, 601), 't', 'a', 'r', 'ce1', 't', 't')`,
  ],
  [
    "K-24 task 601",
    "career_story_parts_length",
    `INSERT INTO career_story (id, title, situation, task, action, result, experience_id, created_at, updated_at) VALUES ('xst2', 'Cut eval time', 's', substr(hex(zeroblob(301)), 1, 601), 'a', 'r', 'ce1', 't', 't')`,
  ],
  [
    "K-24 action 601",
    "career_story_parts_length",
    `INSERT INTO career_story (id, title, situation, task, action, result, experience_id, created_at, updated_at) VALUES ('xst3', 'Cut eval time', 's', 't', substr(hex(zeroblob(301)), 1, 601), 'r', 'ce1', 't', 't')`,
  ],
  [
    "K-24 result 601",
    "career_story_parts_length",
    `UPDATE career_story SET result = substr(hex(zeroblob(301)), 1, 601) WHERE id = 'cst1'`,
  ],
  [
    "K-24 blank title",
    "career_story_title_not_blank",
    `INSERT INTO career_story (id, title, situation, task, action, result, experience_id, created_at, updated_at) VALUES ('xst4', ' ', 's', 't', 'a', 'r', 'ce1', 't', 't')`,
  ],
  [
    "K-24 unknown experience",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_story (id, title, situation, task, action, result, experience_id, created_at, updated_at) VALUES ('xst5', 'T', 's', 't', 'a', 'r', 'nope', 't', 't')`,
  ],
  [
    "K-25 unknown fact",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_story_fact (story_id, fact_id) VALUES ('cst1', 'nope')`,
  ],
  [
    "K-25 a fact twice",
    "UNIQUE constraint failed: career_story_fact.story_id, career_story_fact.fact_id",
    `INSERT INTO career_story_fact (story_id, fact_id) VALUES ('cst1', 'cf1')`,
  ],
  [
    "K-25 story skill not in the registry",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_story_skill (story_id, skill_id) VALUES ('cst1', 'nope')`,
  ],
  [
    "K-26 Drive ID 9",
    "career_answer_drive",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan1', 'Tell me about yourself', 'I build evals', 'aaaaaaaaa', NULL, NULL, 't', 't')`,
  ],
  [
    "K-26 Drive ID 101",
    "career_answer_drive",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan2', 'Tell me about yourself', 'I build evals', substr(hex(zeroblob(51)), 1, 101), NULL, NULL, 't', 't')`,
  ],
  [
    "K-26 Drive ID with a slash",
    "career_answer_drive",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan3', 'Tell me about yourself', 'I build evals', '../../etc/passwd', NULL, NULL, 't', 't')`,
  ],
  [
    "K-26 Drive ID with a space",
    "career_answer_drive",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan4', 'Tell me about yourself', 'I build evals', 'abcde fghijk', NULL, NULL, 't', 't')`,
  ],
  [
    "K-26 a whole link",
    "career_answer_drive",
    `UPDATE career_answer SET drive_file_id = 'https://drive.google.com/file/d/abc' WHERE id = 'can1'`,
  ],
  [
    "K-27 unknown story",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan5', 'Tell me about yourself', 'I build evals', NULL, 'nope', NULL, 't', 't')`,
  ],
  [
    "K-27 unknown job",
    "FOREIGN KEY constraint failed",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan6', 'Tell me about yourself', 'I build evals', NULL, NULL, 'nope', 't', 't')`,
  ],
  [
    "K-27 answer 3,001",
    "career_answer_answer_length",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan7', 'Tell me about yourself', substr(hex(zeroblob(1501)), 1, 3001), NULL, NULL, NULL, 't', 't')`,
  ],
  [
    "K-27 question 201",
    "career_answer_question_length",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan8', substr(hex(zeroblob(101)), 1, 201), 'I build evals', NULL, NULL, NULL, 't', 't')`,
  ],
  [
    "K-27 empty answer",
    "career_answer_answer_length",
    `INSERT INTO career_answer (id, question, answer, drive_file_id, story_id, job_id, created_at, updated_at) VALUES ('xan9', 'Tell me about yourself', '', NULL, NULL, NULL, 't', 't')`,
  ],
  [
    "K-28 unknown mode",
    "career_drill_mode_allowed",
    `INSERT INTO career_drill (id, at, mode, topic, weakest_json, fix) VALUES ('xd1', 't', 'case', 'Acme', '[]', 'f')`,
  ],
  [
    "K-28 three weakest",
    "career_drill_weakest",
    `INSERT INTO career_drill (id, at, mode, topic, weakest_json, fix) VALUES ('xd2', 't', 'behavioral', 'Acme', '["a","b","c"]', 'f')`,
  ],
  [
    "K-28 weakest not an array",
    "career_drill_weakest",
    `INSERT INTO career_drill (id, at, mode, topic, weakest_json, fix) VALUES ('xd3', 't', 'behavioral', 'Acme', '{}', 'f')`,
  ],
];

// One NULL per NOT NULL column: [table, columns, a valid row in the same order]
const notNull: [string, string[], string[]][] = [
  [
    "user",
    [
      "id",
      "auth_key_hash",
      "kdf_salt",
      "kdf_iterations",
      "timezone",
      "created_at",
      "session_version",
    ],
    ["'n1'", "'h'", "'s'", "1", "'UTC'", "'t'", "0"],
  ],
  [
    "mutation",
    ["key", "scope", "response_json", "created_at"],
    ["'n1'", "'POST /api/x'", "'{}'", "'t'"],
  ],
  ["auth_attempt", ["ip_hash", "window_start", "count"], ["'n1'", "9", "1"]],
  [
    "skill",
    ["id", "name", "aliases_json", "created_at"],
    ["'n1'", "'Kotlin'", "'[]'", "'t'"],
  ],
  [
    "mcp_call",
    ["id", "tool", "client_name", "ok", "created_at"],
    ["'n1'", "'core_x'", "'claude'", "1", "'t'"],
  ],
  [
    "learn_area",
    ["id", "prefix", "name", "position", "next_seq", "created_at"],
    ["'n1'", "'NX'", "'Null area'", "9", "1", "'t'"],
  ],
  [
    "learn_topic",
    [
      "id",
      "code",
      "area_id",
      "skill_id",
      "level",
      "priority",
      "status",
      "note",
      "created_at",
      "updated_at",
    ],
    [
      "'n1'",
      "'SE-50'",
      "'area-se'",
      "'ss4'",
      "'unset'",
      "2",
      "'not_started'",
      "''",
      "'t'",
      "'t'",
    ],
  ],
  [
    "learn_course",
    ["id", "topic_id", "level", "module", "path", "recorded_at"],
    [
      "'n1'",
      "'t1'",
      "'essential'",
      "1",
      "'Study Lab/n/n/n__essential.md'",
      "'t'",
    ],
  ],
  [
    "learn_exam",
    ["id", "topic_id", "level", "attempt", "md_path", "source", "created_at"],
    [
      "'n1'",
      "'t1'",
      "'specialized'",
      "1",
      "'Study Lab/n/n/n__specialized__exam-1.md'",
      "'app'",
      "'t'",
    ],
  ],
  [
    "learn_exam_paper",
    [
      "exam_id",
      "title",
      "settings_json",
      "questions_json",
      "key_json",
      "draft_json",
      "created_at",
      "updated_at",
    ],
    ["'ae2'", "'Big-O'", "'{}'", "'[]'", "'[]'", "'[]'", "'t'", "'t'"],
  ],
  [
    "career_person",
    [
      "id",
      "full_name",
      "headline",
      "location",
      "timezone",
      "email",
      "phone",
      "summary",
      "languages_json",
      "updated_at",
    ],
    ["'person'", "''", "''", "''", "''", "''", "''", "''", "'[]'", "'t'"],
  ],
  [
    "career_link",
    ["id", "kind", "label", "url", "position", "created_at"],
    ["'n1'", "'other'", "'L'", "'https://a.example'", "0", "'t'"],
  ],
  [
    "career_education",
    [
      "id",
      "institution",
      "degree",
      "field",
      "start_on",
      "notes",
      "position",
      "created_at",
    ],
    ["'n1'", "'U'", "'BSc'", "''", "'2015'", "''", "0", "'t'"],
  ],
  [
    "career_experience",
    [
      "id",
      "organization",
      "title",
      "kind",
      "start_on",
      "location",
      "summary",
      "position",
      "created_at",
    ],
    ["'n1'", "'A'", "'B'", "'job'", "'2020'", "''", "''", "0", "'t'"],
  ],
  [
    "career_fact",
    ["id", "text", "verified", "position", "created_at", "updated_at"],
    ["'n1'", "'F'", "0", "0", "'t'", "'t'"],
  ],
  ["career_fact_skill", ["fact_id", "skill_id"], ["'cf2'", "'cs2'"]],
  [
    "career_declared_skill",
    ["skill_id", "level", "note", "created_at", "updated_at"],
    ["'ss3'", "'working'", "''", "'t'", "'t'"],
  ],
  [
    "career_job",
    [
      "id",
      "company",
      "role",
      "seniority",
      "language",
      "work_shape",
      "posting",
      "fit_notes",
      "created_at",
      "updated_at",
    ],
    ["'n1'", "'A'", "'R'", "''", "'en'", "''", "'P'", "''", "'t'", "'t'"],
  ],
  [
    "career_requirement",
    ["id", "job_id", "text", "type", "position"],
    ["'n1'", "'cj1'", "'Visa'", "'not_mapped'", "0"],
  ],
  [
    "career_job_event",
    ["id", "job_id", "status", "at", "note"],
    ["'n1'", "'cj1'", "'applied'", "'t9'", "''"],
  ],
  [
    "career_job_item",
    ["job_id", "item_kind", "item_id", "variant", "position"],
    ["'cj2'", "'fact'", "'cf1'", "'ai'", "0"],
  ],
  ["career_job_kit", ["job_id", "intro", "updated_at"], ["'cj3'", "''", "'t'"]],
  [
    "career_form_answer",
    ["id", "job_id", "question", "answer", "position"],
    ["'n1'", "'cj1'", "'Q'", "'A'", "0"],
  ],
  [
    "career_standard_answer",
    ["id", "label", "value", "position"],
    ["'n1'", "'Null label'", "'v'", "0"],
  ],
  [
    "career_search_criteria",
    [
      "id",
      "queries_json",
      "lanes_json",
      "shapes_json",
      "auto_reject_json",
      "sources_json",
      "max_hours",
      "timezone_note",
      "max_age_days",
      "updated_at",
    ],
    [
      "'criteria'",
      "'[]'",
      "'[]'",
      "'[]'",
      "'[]'",
      "'[]'",
      "20",
      "''",
      "14",
      "'t'",
    ],
  ],
  [
    "career_opening",
    [
      "id",
      "url",
      "company",
      "role",
      "lane",
      "posting",
      "rate_text",
      "why",
      "status",
      "created_at",
      "updated_at",
    ],
    [
      "'n1'",
      "'https://jobs.example/n1'",
      "'A'",
      "'R'",
      "'L'",
      "'P'",
      "''",
      "'W'",
      "'new'",
      "'t'",
      "'t'",
    ],
  ],
  [
    "career_story",
    [
      "id",
      "title",
      "situation",
      "task",
      "action",
      "result",
      "created_at",
      "updated_at",
    ],
    ["'n1'", "'T'", "'s'", "'t'", "'a'", "'r'", "'t'", "'t'"],
  ],
  ["career_story_fact", ["story_id", "fact_id"], ["'cst2'", "'cf1'"]],
  ["career_story_skill", ["story_id", "skill_id"], ["'cst2'", "'cs2'"]],
  [
    "career_answer",
    ["id", "question", "answer", "created_at", "updated_at"],
    ["'n1'", "'Q'", "'A'", "'t'", "'t'"],
  ],
  [
    "career_drill",
    ["id", "at", "mode", "topic", "weakest_json", "fix"],
    ["'n1'", "'t'", "'technical'", "'T'", "'[]'", "'F'"],
  ],
];
for (const [table, columns, row] of notNull) {
  columns.forEach((column, i) => {
    const values = row.map((v, j) => (i === j ? "NULL" : v));
    forbidden.push([
      `${table}.${column} NULL`,
      `NOT NULL constraint failed: ${table}.${column}`,
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")})`,
    ]);
  });
}

describe("forbidden writes fail", () => {
  it.each(forbidden)("%s", async (_, error, sql) => {
    await expect(run(sql)).rejects.toThrow(error);
  });
});

// TD-01: the contract migration after F-23 retired signed uploads. Dropping the
// table drops its C-13 trigger with it; C-10 to C-13 are retired, not reused.
describe("retired schema is gone", () => {
  it("no upload table and no upload_used_at_once trigger", async () => {
    const { results } = await db()
      .prepare(
        "SELECT type, name FROM sqlite_master WHERE name IN ('upload', 'upload_used_at_once')",
      )
      .all();
    expect(results).toEqual([]);
  });
});

// 0010_study_areas: every backlog starts with these, in this order (PRD 10).
describe("seeded Study areas", () => {
  it("are the seven areas, in position order", async () => {
    const { results } = await db()
      .prepare(
        "SELECT prefix, position FROM learn_area WHERE id LIKE 'area-%' AND id <> 'area-ai' ORDER BY position",
      )
      .all<{ prefix: string; position: number }>();
    expect(results).toEqual(
      ["CS", "FE", "BE", "DB", "DO", "SA", "SE"].map((prefix, i) => ({
        prefix,
        position: i + 1,
      })),
    );
  });
});
