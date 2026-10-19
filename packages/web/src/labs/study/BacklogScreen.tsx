// The study backlog (docs/prd/10-study-backlog.md § Screens), markup from the
// bundle's "Study backlog" phone and tablet screens. The API sends topics in
// backlog order (ST-01's sort); this screen groups and filters, never re-sorts.
import {
  type BacklogResponse,
  backlogResponseSchema,
  formatGrade,
  summarize,
  type TopicInfo,
  type TopicStatus,
} from "@projects-lab/shared/study";
import { useCallback, useState } from "react";
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  Group,
  Icon,
  ListRow,
  PageTitle,
  Skeleton,
  Tabs,
  type ToastInput,
  useToast,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";
import { type Added, AddTopicSheet } from "./AddTopicSheet";
import { TopicSheet } from "./TopicSheet";

type Filter = "all" | TopicStatus;

const STATUS: Record<TopicStatus, { label: string; tone: BadgeTone }> = {
  not_started: { label: "Not started", tone: "todo" },
  in_progress: { label: "In progress", tone: "doing" },
  done: { label: "Done", tone: "done" },
};
const LEVEL: Record<TopicInfo["level"], string> = {
  unset: "",
  fast_track: "Fast track",
  essential: "Essential",
  specialized: "Specialized",
};
const PRIORITY_TONE = { 1: "p1", 2: "p2", 3: "p3" } as const;

/** The whole backlog, areas included even when it has no topics (the Add
 *  sheet needs them). */
async function fetchBacklog(signal: AbortSignal): Promise<BacklogResponse> {
  const response = await apiFetch("/api/study/backlog", { signal });
  if (!response.ok)
    throw new Error(`GET /api/study/backlog: ${response.status}`);
  return backlogResponseSchema.parse(await response.json());
}

/** "8 topics · 1 in progress · avg grade 8.5" (the bundle's subtitle). */
function subtitle(backlog: BacklogResponse): string {
  const { total } = summarize(
    backlog.areas.map((area) => ({ id: area.prefix, position: area.position })),
    backlog.topics.map((topic) => ({
      ...topic,
      code: topic.id,
      areaId: topic.area,
    })),
  );
  const count = backlog.topics.length;
  return [
    `${count} ${count === 1 ? "topic" : "topics"}`,
    `${total.inProgress} in progress`,
    total.average === null ? null : `avg grade ${formatGrade(total.average)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function TopicRow({
  topic,
  current,
  onOpen,
}: {
  topic: TopicInfo;
  current: boolean;
  onOpen: (topic: TopicInfo) => void;
}) {
  const status = STATUS[topic.status];
  return (
    <ListRow
      table
      current={current}
      onClick={() => onOpen(topic)}
      id={topic.id}
      title={topic.skill}
      meta={LEVEL[topic.level] || undefined}
      tags={
        <>
          <Badge size="sm" tone={PRIORITY_TONE[topic.priority]}>
            P{topic.priority}
          </Badge>
          <Badge size="sm" tone={status.tone}>
            {status.label}
          </Badge>
        </>
      }
      value={topic.grade === null ? undefined : formatGrade(topic.grade)}
    />
  );
}

function Backlog({
  backlog,
  openId,
  onOpen,
  onAdd,
}: {
  backlog: BacklogResponse;
  openId: string | null;
  onOpen: (topic: TopicInfo) => void;
  onAdd: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const counts = (status: TopicStatus) =>
    backlog.topics.filter((t) => t.status === status).length;
  const needle = query.trim().toLowerCase();
  const inFilter = backlog.topics.filter(
    (t) => filter === "all" || t.status === filter,
  );
  const shown = inFilter.filter(
    (t) =>
      !needle ||
      t.skill.toLowerCase().includes(needle) ||
      t.id.toLowerCase().includes(needle),
  );
  const narrowed = filter !== "all" || needle !== "";

  return (
    <>
      {/* PageTitle brings its own gutter; the rest lines up with it. */}
      <div className="flex flex-col tablet:flex-row tablet:items-end">
        <div className="flex-1">
          <PageTitle title="Backlog" subtitle={subtitle(backlog)} />
        </div>
        <div className="flex gap-2 px-4 tablet:pl-0">
          {/* The bundle's search box: no visible label (SearchField isn't built). */}
          <div className="input input--search flex-1 tablet:w-(--size-rail) tablet:flex-none">
            <Icon name="search" className="input__icon" />
            <input
              type="search"
              placeholder="Search backlog"
              aria-label="Search backlog"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                type="button"
                className="input__action"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <Icon name="clear" />
              </button>
            )}
          </div>
          <Button variant="soft" icon="plus" onClick={onAdd}>
            Add
          </Button>
        </div>
      </div>
      <Tabs
        className="px-3 tablet:mx-4 tablet:px-0"
        label="Filter by status"
        value={filter}
        onChange={setFilter}
        items={[
          { id: "all", label: "All", count: backlog.topics.length },
          {
            id: "not_started",
            label: "Not started",
            count: counts("not_started"),
          },
          {
            id: "in_progress",
            label: "In progress",
            count: counts("in_progress"),
          },
          { id: "done", label: "Done", count: counts("done") },
        ]}
      />
      <div className="flex flex-col gap-3 px-4 pb-6 tablet:gap-4">
        {needle && (
          <p role="status" className="text-sm text-ink-muted">
            {shown.length} of {inFilter.length}
            {filter === "all" ? "" : ` ${STATUS[filter].label.toLowerCase()}`}{" "}
            {shown.length === 1 ? "matches" : "match"} “{query.trim()}”
          </p>
        )}
        {backlog.areas.map((area) => {
          const topics = shown.filter((t) => t.area === area.prefix);
          if (narrowed && topics.length === 0) return null;
          return (
            <Group key={area.prefix} title={area.name} count={topics.length}>
              {topics.length === 0 ? (
                <ListRow title="No topics yet" />
              ) : (
                topics.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    current={topic.id === openId}
                    onOpen={onOpen}
                  />
                ))
              )}
            </Group>
          );
        })}
      </div>
    </>
  );
}

function BacklogSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading the backlog"
      className="flex flex-col gap-3"
    >
      <PageTitle title="Backlog" />
      <div className="flex flex-col gap-3 px-4">
        <Skeleton shape="text" width="60%" />
        {[0, 1].map((group) => (
          <div key={group} className="flex flex-col gap-2">
            <Skeleton shape="text" width="20%" />
            <Skeleton shape="block" />
          </div>
        ))}
      </div>
    </section>
  );
}

const DONE: Record<
  "saved" | "removed" | "gone",
  (topic: TopicInfo) => ToastInput
> = {
  saved: (t) => ({ message: `${t.id} saved`, tone: "success" }),
  removed: (t) => ({ message: `${t.id} removed`, tone: "success" }),
  gone: (t) => ({ message: `${t.id} was already removed`, tone: "info" }),
};

function addedToast({ topic, created, restored }: Added): ToastInput {
  const name = `${topic.id} · ${topic.skill}`;
  if (created) return { message: `Added ${name}`, tone: "success" };
  if (restored) return { message: `Restored ${name}`, tone: "success" };
  return {
    message: `${topic.skill} is already in the backlog as ${topic.id}`,
    tone: "info",
  };
}

/** Backlog (`/study`, Study's first tab). */
export function BacklogScreen() {
  const { show } = useToast();
  const [topic, setTopic] = useState<TopicInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [latest, setLatest] = useState<BacklogResponse | null>(null);
  const [refresh, setRefresh] = useState(0);

  // An empty backlog reads as null (its empty state); the areas are kept.
  const load = useCallback(async (signal: AbortSignal) => {
    const backlog = await fetchBacklog(signal);
    setLatest(backlog);
    return backlog.topics.length > 0 ? backlog : null;
  }, []);

  return (
    <div className="flex flex-col gap-3 tablet:gap-4">
      <ReadView
        refresh={refresh}
        load={load}
        skeleton={<BacklogSkeleton />}
        empty={
          <>
            <PageTitle title="Backlog" />
            <div className="px-4 pb-6">
              <div className="group">
                <EmptyState
                  icon="list"
                  title="No topics yet"
                  actions={
                    <Button icon="plus" onClick={() => setAdding(true)}>
                      Add a topic
                    </Button>
                  }
                >
                  Add one here, or ask Claude to <code>/add</code> it.
                </EmptyState>
              </div>
            </div>
          </>
        }
      >
        {(backlog) => (
          <Backlog
            backlog={backlog}
            openId={open ? (topic?.id ?? null) : null}
            onOpen={(t) => {
              setTopic(t);
              setOpen(true);
            }}
            onAdd={() => setAdding(true)}
          />
        )}
      </ReadView>
      <TopicSheet
        topic={topic}
        open={open}
        onClose={() => setOpen(false)}
        onDone={(t, outcome) => {
          show(DONE[outcome](t));
          setOpen(false);
          setRefresh((n) => n + 1);
        }}
      />
      <AddTopicSheet
        open={adding}
        backlog={latest}
        onClose={() => setAdding(false)}
        onAdded={(added) => {
          show(addedToast(added));
          setAdding(false);
          setRefresh((n) => n + 1);
        }}
      />
    </div>
  );
}
