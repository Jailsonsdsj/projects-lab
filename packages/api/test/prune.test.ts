// The daily prune (F-19), through the Worker's real `scheduled` export: rows on
// both sides of each window, and exactly at it.

import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import { db } from "./db";

const NOW = Date.parse("2026-10-16T03:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const epoch = (daysAgo: number) => Math.floor((NOW - daysAgo * DAY) / 1000);

async function runCron() {
  const controller = createScheduledController({
    scheduledTime: NOW,
    cron: "0 3 * * *",
  });
  await worker.scheduled(controller, env);
}

const ids = async (sql: string) =>
  (await db().prepare(sql).all<{ id: string }>()).results
    .map((r) => r.id)
    .sort();

beforeEach(async () => {
  const mutation = (key: string, daysAgo: number) =>
    db()
      .prepare(
        "INSERT INTO mutation (key, scope, response_json, created_at) VALUES (?, 'POST /api/x', '{}', ?)",
      )
      .bind(key, iso(daysAgo));
  const attempt = (ip: string, daysAgo: number) =>
    db()
      .prepare(
        "INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES (?, ?, 1)",
      )
      .bind(ip, epoch(daysAgo));
  const call = (id: string, daysAgo: number) =>
    db()
      .prepare(
        "INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES (?, 'core_x', 'claude', 1, ?)",
      )
      .bind(id, iso(daysAgo));
  await db().batch([
    db().prepare("DELETE FROM mutation"),
    db().prepare("DELETE FROM auth_attempt"),
    db().prepare("DELETE FROM mcp_call"),
    mutation("m-8d", 8),
    mutation("m-7d", 7), // exactly at the cutoff: stays
    mutation("m-6d", 6),
    attempt("a-8d", 8),
    attempt("a-7d", 7),
    attempt("a-6d", 6),
    call("c-91d", 91),
    call("c-90d", 90),
    call("c-89d", 89),
  ]);
});

describe("the daily prune", () => {
  it("removes rows past their window and keeps newer ones", async () => {
    await runCron();
    expect(await ids("SELECT key AS id FROM mutation")).toEqual([
      "m-6d",
      "m-7d",
    ]);
    expect(await ids("SELECT ip_hash AS id FROM auth_attempt")).toEqual([
      "a-6d",
      "a-7d",
    ]);
    expect(await ids("SELECT id FROM mcp_call")).toEqual(["c-89d", "c-90d"]);
  });

  it("changes nothing on a second run", async () => {
    await runCron();
    await runCron();
    expect(await ids("SELECT key AS id FROM mutation")).toEqual([
      "m-6d",
      "m-7d",
    ]);
    expect(await ids("SELECT id FROM mcp_call")).toEqual(["c-89d", "c-90d"]);
  });
});
