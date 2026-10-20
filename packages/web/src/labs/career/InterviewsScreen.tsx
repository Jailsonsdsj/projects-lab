// The Interviews tab (docs/prd/24-career-interviews.md § Screens): answers by
// job then general (a job's self-introduction first, as its "Tell me about
// yourself"), the STAR story bank, and the practice log Claude keeps. The
// view is in the URL (?view=stories). The bundle draws none of these: Groups
// of ListRows, sheets to edit.
import {
  type Answer,
  answersResponseSchema,
  type Drill,
  drillsResponseSchema,
  type JobKit,
  type JobSummary,
  type ProfileFact,
  type Story,
  storiesResponseSchema,
} from "@projects-lab/shared/career";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import {
  Badge,
  Button,
  EmptyState,
  Group,
  ListRow,
  PageTitle,
  Skeleton,
  Tabs,
  useToast,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";
import { fetchJobs, fetchKit, fetchProfile } from "./data";
import { AnswerSheet, StorySheet } from "./InterviewSheets";

async function read<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  signal: AbortSignal,
): Promise<T> {
  const response = await apiFetch(path, { signal });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return schema.parse(await response.json());
}

type Data = {
  answers: Answer[];
  stories: Story[];
  jobs: JobSummary[];
  kits: Record<string, JobKit>;
  facts: ProfileFact[];
};

async function load(signal: AbortSignal): Promise<Data> {
  const [answers, stories, jobs, profile] = await Promise.all([
    read("/api/career/answers", answersResponseSchema, signal),
    read("/api/career/stories", storiesResponseSchema, signal),
    fetchJobs(signal),
    fetchProfile(signal),
  ]);
  const kits = await Promise.all(jobs.map((j) => fetchKit(j.id, signal)));
  return {
    answers: answers.answers,
    stories: stories.stories,
    jobs,
    kits: Object.fromEntries(kits.map((k) => [k.jobId, k])),
    facts: [
      ...profile.experiences.flatMap((e) => e.facts),
      ...profile.education.flatMap((e) => e.facts),
      ...profile.facts,
    ],
  };
}

type Editing =
  | { kind: "answer"; answer?: Answer; job?: string | null; opened: number }
  | { kind: "story"; story?: Story; opened: number };

function Answers({
  data,
  edit,
}: {
  data: Data;
  edit: (editing: Omit<Extract<Editing, { kind: "answer" }>, "opened">) => void;
}) {
  const general = data.answers.filter((a) => a.jobId === null);
  const row = (a: Answer) => (
    <ListRow
      key={a.id}
      title={a.question}
      meta={a.answer}
      tags={
        a.video ? (
          <Badge tone="info" size="sm">
            Video
          </Badge>
        ) : undefined
      }
      onClick={() => edit({ kind: "answer", answer: a })}
    />
  );
  return (
    <div className="flex flex-col gap-4 tablet:gap-5">
      <div>
        <Button icon="plus" onClick={() => edit({ kind: "answer" })}>
          Add an answer
        </Button>
      </div>
      {data.jobs.map((job) => {
        const own = data.answers.filter((a) => a.jobId === job.id);
        const intro = data.kits[job.id]?.intro ?? "";
        if (own.length === 0 && !intro) return null;
        return (
          <Group
            key={job.id}
            title={`${job.company} · ${job.role}`}
            count={own.length}
          >
            {intro && <ListRow title="Tell me about yourself" meta={intro} />}
            {own.map(row)}
            <ListRow
              title={
                <span className="text-ink-muted">
                  Add an answer for {job.company}
                </span>
              }
              onClick={() => edit({ kind: "answer", job: job.id })}
            />
          </Group>
        );
      })}
      <Group title="General" count={general.length}>
        {general.map(row)}
        {general.length === 0 && (
          <ListRow
            title="No general answers yet"
            meta="Ask Claude to drill you, or add one."
          />
        )}
      </Group>
    </div>
  );
}

function Stories({
  data,
  edit,
}: {
  data: Data;
  edit: (editing: Omit<Extract<Editing, { kind: "story" }>, "opened">) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button icon="plus" onClick={() => edit({ kind: "story" })}>
          Add a story
        </Button>
      </div>
      {data.stories.length === 0 ? (
        <EmptyState icon="book" title="No stories yet">
          A STAR story is reusable evidence for interviews. Ask Claude to draft
          one from your facts, or add one.
        </EmptyState>
      ) : (
        <Group title="Story bank" count={data.stories.length}>
          {data.stories.map((s) => (
            <ListRow
              key={s.id}
              title={s.title}
              meta={s.skills.map((k) => k.name).join(" · ") || s.result}
              tags={
                s.verified ? (
                  <Badge tone="verified" size="sm">
                    Verified
                  </Badge>
                ) : (
                  <Badge tone="warning" size="sm">
                    Unverified
                  </Badge>
                )
              }
              onClick={() => edit({ kind: "story", story: s })}
            />
          ))}
        </Group>
      )}
    </div>
  );
}

const MODE: Record<Drill["mode"], string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  negotiation: "Negotiation",
};

function Practice() {
  const loadDrills = useCallback(async (signal: AbortSignal) => {
    const { drills } = await read(
      "/api/career/drills?limit=50",
      drillsResponseSchema,
      signal,
    );
    return drills.length ? drills : null;
  }, []);
  return (
    <ReadView
      load={loadDrills}
      skeleton={<Skeleton shape="block" />}
      empty={
        <EmptyState icon="target" title="No practice yet">
          Ask Claude to drill you (behavioral, technical or negotiation): it
          logs each session here with the weakest answers and what to fix.
        </EmptyState>
      }
    >
      {(drills) => (
        <Group title="Practice log" count={drills.length}>
          {drills.map((d) => (
            <ListRow
              key={d.id}
              title={`${MODE[d.mode]} · ${d.topic}`}
              meta={[
                d.at.slice(0, 10),
                d.weakest.length ? `Weakest: ${d.weakest.join("; ")}` : null,
                `Fix: ${d.fix}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </Group>
      )}
    </ReadView>
  );
}

type View = "answers" | "stories" | "practice";
const VIEWS: readonly View[] = ["answers", "stories", "practice"];

export function InterviewsScreen() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const asked = params.get("view") as View | null;
  const view: View = asked && VIEWS.includes(asked) ? asked : "answers";
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [last, setLast] = useState<Editing | null>(null);
  if (editing && editing !== last) setLast(editing);
  const opened = (last?.opened ?? 0) + 1;
  const done = (message: string) => {
    setEditing(null);
    setRefresh((n) => n + 1);
    toast.show({ tone: "success", message });
  };
  const sheetBase = {
    open: editing !== null,
    onClose: () => setEditing(null),
    onDone: done,
  };

  return (
    <>
      <PageTitle title="Interviews" />
      <Tabs
        className="px-3 tablet:mx-4 tablet:px-0"
        label="Interview views"
        value={view}
        onChange={(next) =>
          setParams(next === "answers" ? {} : { view: next }, { replace: true })
        }
        items={[
          { id: "answers", label: "Answers" },
          { id: "stories", label: "Stories" },
          { id: "practice", label: "Practice" },
        ]}
      />
      {/* PageTitle brings its own gutter; the rest lines up with it. */}
      <div className="px-4 pt-4 pb-6">
        {view === "practice" ? (
          <Practice />
        ) : (
          <ReadView
            load={load}
            refresh={refresh}
            skeleton={<Skeleton shape="block" />}
            empty={null}
          >
            {(data) => {
              const shown = editing ?? last;
              return (
                <>
                  {view === "answers" ? (
                    <Answers
                      data={data}
                      edit={(next) => setEditing({ ...next, opened })}
                    />
                  ) : (
                    <Stories
                      data={data}
                      edit={(next) => setEditing({ ...next, opened })}
                    />
                  )}
                  {shown?.kind === "answer" && (
                    <AnswerSheet
                      key={shown.opened}
                      {...sheetBase}
                      answer={shown.answer}
                      presetJob={shown.job}
                      jobs={data.jobs}
                      stories={data.stories}
                    />
                  )}
                  {shown?.kind === "story" && (
                    <StorySheet
                      key={shown.opened}
                      {...sheetBase}
                      story={shown.story}
                      facts={data.facts}
                    />
                  )}
                </>
              );
            }}
          </ReadView>
        )}
      </div>
    </>
  );
}
