// Career profile (CA-03a, docs/prd/20-career-profile.md) through the real
// Worker with a session, and the profile photo in R2. Storage is shared by
// the tests in this file, so each test uses its own records and skills.
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { ORIGIN, seedOwner, sessionJwt, signInClaude } from "./oauth-flow";

let session: string;
let authKey: string;

beforeAll(async () => {
  authKey = await seedOwner();
  session = await sessionJwt();
});

const api = (
  path: string,
  init: {
    method?: string;
    body?: unknown;
    key?: string;
    token?: string;
    raw?: BodyInit;
    type?: string;
    headers?: Record<string, string>;
  } = {},
) =>
  SELF.fetch(`${ORIGIN}/api/career${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token ?? session}`,
      "Content-Type": init.type ?? "application/json",
      ...(init.key ? { "Idempotency-Key": init.key } : {}),
      ...init.headers,
    },
    ...(init.raw !== undefined
      ? { body: init.raw }
      : init.body === undefined
        ? {}
        : { body: JSON.stringify(init.body) }),
  });

async function ok<T>(res: Response): Promise<T> {
  expect(res.status, await res.clone().text()).toBe(200);
  return (await res.json()) as T;
}

type Fact = {
  id: string;
  text: string;
  verified: boolean;
  skills: { id: string; name: string }[];
};
type Profile = {
  person: {
    fullName: string;
    headline: string;
    photo: { type: string } | null;
  };
  links: { kind: string; url: string; position: number }[];
  experiences: {
    id: string;
    title: string;
    end: string | null;
    facts: Fact[];
  }[];
  education: { id: string; facts: Fact[] }[];
  facts: Fact[];
  skills: {
    skillId: string;
    name: string;
    level: string;
    years: number | null;
    note: string;
  }[];
};
const profile = async () => ok<Profile>(await api("/profile"));

const experience = async (body: Record<string, unknown>) =>
  (
    await ok<{ experience: { id: string } }>(
      await api("/experiences", { method: "POST", body }),
    )
  ).experience;

describe("access", () => {
  it("refuses no token and an OAuth access token", async () => {
    expect((await SELF.fetch(`${ORIGIN}/api/career/profile`)).status).toBe(401);
    const claude = await signInClaude(authKey);
    const oauth = claude.tokens.access_token ?? "";
    expect((await api("/profile", { token: oauth })).status).toBe(401);
    const photo = await api("/photo", {
      method: "PUT",
      token: oauth,
      type: "image/png",
      raw: PNG,
    });
    expect(photo.status).toBe(401);
  });
});

describe("person and links", () => {
  it("starts empty, then one row whatever the edits", async () => {
    const empty = await profile();
    expect(empty.person.fullName).toBe("");
    const first = await ok<{ person: Profile["person"] }>(
      await api("/person", { method: "PATCH", body: { fullName: "Owner" } }),
    );
    expect(first.person.fullName).toBe("Owner");
    await ok(
      await api("/person", {
        method: "PATCH",
        body: { headline: "AI engineer" },
      }),
    );
    const { person } = await profile();
    expect(person).toMatchObject({
      fullName: "Owner",
      headline: "AI engineer",
    });
    const { results } = await db()
      .prepare("SELECT id FROM career_person")
      .all();
    expect(results).toEqual([{ id: "person" }]);
  });

  it("refuses an edit with nothing in it", async () => {
    const res = await api("/person", { method: "PATCH", body: {} });
    expect(res.status).toBe(400);
  });

  it("replaces the links in the order given", async () => {
    const set = (links: unknown[]) =>
      api("/links", { method: "PUT", body: { links } });
    await ok(
      await set([
        { kind: "github", label: "GitHub", url: "https://github.com/a" },
        {
          kind: "linkedin",
          label: "LinkedIn",
          url: "https://linkedin.com/in/a",
        },
      ]),
    );
    await ok(
      await set([
        { kind: "portfolio", label: "Site", url: "https://a.example" },
        { kind: "github", label: "GitHub", url: "https://github.com/a" },
      ]),
    );
    expect((await profile()).links.map((l) => [l.kind, l.position])).toEqual([
      ["portfolio", 0],
      ["github", 1],
    ]);
    const http = await set([
      { kind: "other", label: "X", url: "http://a.example" },
    ]);
    expect(http.status).toBe(400);
  });

  it("replays a write with the same Idempotency-Key", async () => {
    const write = () =>
      api("/person", {
        method: "PATCH",
        key: "career-person-1",
        body: { location: "Recife" },
      });
    expect((await write()).status).toBe(200);
    const second = await write();
    expect(second.status).toBe(200);
    expect(second.headers.get("Idempotent-Replay")).toBe("true");
  });
});

describe("experiences and education", () => {
  it("adds at the end, edits keeping what's omitted, refuses dates out of order", async () => {
    const a = await experience({
      organization: "Acme",
      title: "Engineer",
      kind: "contract",
      start: "2023-04",
      end: "2024",
    });
    const b = await experience({
      organization: "Lab",
      title: "Researcher",
      kind: "research",
      start: "2020",
    });
    const rows = await db()
      .prepare(
        "SELECT id, position FROM career_experience WHERE id IN (?, ?) ORDER BY position",
      )
      .bind(a.id, b.id)
      .all<{ id: string; position: number }>();
    expect(rows.results.map((r) => r.id)).toEqual([a.id, b.id]);
    const [first, second] = rows.results.map((r) => r.position);
    expect(second).toBe((first ?? 0) + 1);

    await ok(
      await api("/experiences", {
        method: "POST",
        body: {
          id: a.id,
          organization: "Acme",
          title: "Senior Engineer",
          kind: "contract",
          start: "2023-04",
        },
      }),
    );
    const edited = (await profile()).experiences.find((e) => e.id === a.id);
    expect(edited).toMatchObject({ title: "Senior Engineer", end: "2024" });

    const backwards = await api("/experiences", {
      method: "POST",
      body: {
        organization: "X",
        title: "Y",
        kind: "job",
        start: "2023-04",
        end: "2023-03",
      },
    });
    expect(backwards.status).toBe(400);
    // A new start after the kept end: refused by the service, before K-4's trigger.
    const later = await api("/experiences", {
      method: "POST",
      body: {
        id: a.id,
        organization: "Acme",
        title: "Senior Engineer",
        kind: "contract",
        start: "2025",
      },
    });
    expect(later.status).toBe(400);
    expect(((await later.json()) as { message: string }).message).toMatch(
      /ends 2024/,
    );
  });

  it("clears an end with null, and refuses an unknown or removed id", async () => {
    const a = await experience({
      organization: "Co",
      title: "Dev",
      kind: "job",
      start: "2019",
      end: "2021",
    });
    await ok(
      await api("/experiences", {
        method: "POST",
        body: {
          id: a.id,
          organization: "Co",
          title: "Dev",
          kind: "job",
          start: "2019",
          end: null,
        },
      }),
    );
    expect(
      (await profile()).experiences.find((e) => e.id === a.id)?.end,
    ).toBeNull();

    const unknown = await api("/experiences", {
      method: "POST",
      body: {
        id: "nope",
        organization: "Co",
        title: "Dev",
        kind: "job",
        start: "2019",
      },
    });
    expect(unknown.status).toBe(404);
    expect(
      (await api(`/items/experience/${a.id}`, { method: "DELETE" })).status,
    ).toBe(204);
    expect((await profile()).experiences.some((e) => e.id === a.id)).toBe(
      false,
    );
    expect(
      (await api(`/items/experience/${a.id}`, { method: "DELETE" })).status,
    ).toBe(404);
  });

  it("saves education", async () => {
    const { education } = await ok<{
      education: { id: string; end: string | null };
    }>(
      await api("/education", {
        method: "POST",
        body: {
          institution: "UFPE",
          degree: "BSc",
          field: "CS",
          start: "2015",
          end: "2019-12",
        },
      }),
    );
    expect(education.end).toBe("2019-12");
    expect((await profile()).education.some((e) => e.id === education.id)).toBe(
      true,
    );
  });
});

describe("facts", () => {
  const fact = async (body: Record<string, unknown>) =>
    (await ok<{ fact: Fact }>(await api("/facts", { method: "POST", body })))
      .fact;

  it("starts unverified, keeps verified when omitted, and dedupes skills", async () => {
    const parent = await experience({
      organization: "Evals Inc",
      title: "Engineer",
      kind: "job",
      start: "2022",
    });
    const added = await fact({
      experienceId: parent.id,
      text: "Built the eval harness",
      skills: ["LLM evaluation", "llm EVALUATION", "Pytest"],
    });
    expect(added.verified).toBe(false);
    expect(added.skills.map((s) => s.name)).toEqual([
      "LLM evaluation",
      "Pytest",
    ]);

    const verified = await fact({
      id: added.id,
      text: added.text,
      verified: true,
    });
    expect(verified.verified).toBe(true);
    const reworded = await fact({
      id: added.id,
      text: "Built and ran the eval harness",
    });
    expect(reworded).toMatchObject({
      verified: true,
      text: "Built and ran the eval harness",
    });
    expect(reworded.skills).toHaveLength(2);

    const listed = (await profile()).experiences.find(
      (e) => e.id === parent.id,
    );
    expect(listed?.facts.map((f) => f.id)).toEqual([added.id]);
  });

  it("refuses a removed parent and hides facts under one", async () => {
    const parent = await experience({
      organization: "Gone",
      title: "T",
      kind: "project",
      start: "2018",
    });
    const under = await fact({ experienceId: parent.id, text: "Shipped it" });
    await api(`/items/experience/${parent.id}`, { method: "DELETE" });
    const refused = await api("/facts", {
      method: "POST",
      body: { experienceId: parent.id, text: "Another" },
    });
    expect(refused.status).toBe(404);
    const all = await profile();
    const ids = [...all.facts, ...all.experiences.flatMap((e) => e.facts)].map(
      (f) => f.id,
    );
    expect(ids).not.toContain(under.id);
  });

  it("moves a fact under one parent, clearing the other (K-5)", async () => {
    const job = await experience({
      organization: "Move",
      title: "T",
      kind: "job",
      start: "2017",
    });
    const { education } = await ok<{ education: { id: string } }>(
      await api("/education", {
        method: "POST",
        body: { institution: "U", degree: "MSc", start: "2016" },
      }),
    );
    const f = await fact({ experienceId: job.id, text: "A claim" });
    await fact({ id: f.id, text: "A claim", educationId: education.id });
    const row = await db()
      .prepare(
        "SELECT experience_id AS x, education_id AS e FROM career_fact WHERE id = ?",
      )
      .bind(f.id)
      .first();
    expect(row).toEqual({ x: null, e: education.id });
  });

  it("removes a fact softly (K-8)", async () => {
    const f = await fact({ text: "Standalone claim" });
    expect((await profile()).facts.map((x) => x.id)).toContain(f.id);
    expect(
      (await api(`/items/fact/${f.id}`, { method: "DELETE" })).status,
    ).toBe(204);
    expect((await profile()).facts.map((x) => x.id)).not.toContain(f.id);
    const row = await db()
      .prepare(
        "SELECT deleted_at IS NOT NULL AS removed FROM career_fact WHERE id = ?",
      )
      .bind(f.id)
      .first();
    expect(row).toEqual({ removed: 1 });
  });
});

describe("declared skills", () => {
  const declare = (body: Record<string, unknown>) =>
    api("/skills", { method: "PUT", body });

  it("declares a skill once, by name or alias", async () => {
    await db()
      .prepare(
        "INSERT INTO skill (id, name, aliases_json, created_at) VALUES ('k8s', 'Kubernetes', '[\"k8s\"]', 't')",
      )
      .run();
    await ok(
      await declare({
        skill: "Kubernetes",
        level: "working",
        years: 2,
        note: "Prod clusters",
      }),
    );
    await ok(await declare({ skill: "K8S", level: "strong" }));
    const listed = (await profile()).skills.filter((s) => s.skillId === "k8s");
    expect(listed).toEqual([
      {
        skillId: "k8s",
        name: "Kubernetes",
        level: "strong",
        years: 2,
        note: "Prod clusters",
      },
    ]);
    await ok(await declare({ skill: "k8s", level: "strong", years: null }));
    expect(
      (await profile()).skills.find((s) => s.skillId === "k8s")?.years,
    ).toBeNull();
  });

  it("removes a declaration, and 404s one that isn't there", async () => {
    await ok(await declare({ skill: "Rustlang", level: "familiar" }));
    expect((await api("/skills/rustlang", { method: "DELETE" })).status).toBe(
      204,
    );
    expect((await profile()).skills.some((s) => s.name === "Rustlang")).toBe(
      false,
    );
    expect((await api("/skills/rustlang", { method: "DELETE" })).status).toBe(
      404,
    );
    expect(
      (await api("/skills/Never%20heard", { method: "DELETE" })).status,
    ).toBe(404);
    const skill = await db()
      .prepare("SELECT 1 FROM skill WHERE name = 'Rustlang'")
      .first();
    expect(skill).not.toBeNull();
  });
});

const pad = (head: number[], size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set(head);
  return bytes;
};
const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = pad([
  ...new TextEncoder().encode("RIFF"),
  0,
  0,
  0,
  0,
  ...new TextEncoder().encode("WEBP"),
]);

describe("photo", () => {
  const put = (raw: BodyInit, type: string) =>
    api("/photo", { method: "PUT", raw, type });

  it("stores a JPEG, replaces it with a WebP, serves it, removes it", async () => {
    expect((await put(JPEG, "image/jpeg")).status).toBe(200);
    expect(await env.FILES?.head("profile/photo.jpg")).not.toBeNull();
    expect((await profile()).person.photo).toEqual({ type: "image/jpeg" });

    expect((await put(WEBP, "image/webp")).status).toBe(200);
    expect(await env.FILES?.head("profile/photo.webp")).not.toBeNull();
    expect(await env.FILES?.head("profile/photo.jpg")).toBeNull();

    const served = await SELF.fetch(`${ORIGIN}/api/career/photo`, {
      headers: { Cookie: `pl_session=${session}` },
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("Content-Type")).toBe("image/webp");
    expect(served.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(WEBP);
    const etag = served.headers.get("ETag") ?? "";
    const again = await api("/photo", { headers: { "If-None-Match": etag } });
    expect(again.status).toBe(304);

    expect((await api("/photo", { method: "DELETE" })).status).toBe(204);
    expect(await env.FILES?.head("profile/photo.webp")).toBeNull();
    expect((await profile()).person.photo).toBeNull();
    expect((await api("/photo")).status).toBe(404);
  });

  it("refuses another type, a renamed file and an empty one (415)", async () => {
    expect((await put(PNG, "image/gif")).status).toBe(415);
    expect((await put(PNG, "image/jpeg")).status).toBe(415);
    expect((await put(new Uint8Array(0), "image/png")).status).toBe(415);
    expect(
      (await put(new TextEncoder().encode("<svg/>"), "image/svg+xml")).status,
    ).toBe(415);
  });

  it("refuses a file over 2 MB (413), and keeps the photo it had", async () => {
    expect((await put(PNG, "image/png")).status).toBe(200);
    const big = pad(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      2 * 1024 * 1024 + 1,
    );
    expect((await put(big, "image/png")).status).toBe(413);
    const exact = pad(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      2 * 1024 * 1024,
    );
    expect((await put(exact, "image/png")).status).toBe(200);
    expect((await profile()).person.photo).toEqual({ type: "image/png" });
  });
});
