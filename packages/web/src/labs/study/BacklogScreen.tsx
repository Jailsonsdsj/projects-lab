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
import { useState } from "react";
import {
  Badge,
  type BadgeTone,
  EmptyState,
  Group,
  Icon,
  ListRow,
  PageTitle,
  Skeleton,
  Tabs,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";

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

async function loadBacklog(
  signal: AbortSignal,
): Promise<BacklogResponse | null> {
  const response = await apiFetch("/api/study/backlog", { signal });
  if (!response.ok)
    throw new Error(`GET /api/study/backlog: ${response.status}`);
  const backlog = backlogResponseSchema.parse(await response.json());
  return backlog.topics.length > 0 ? backlog : null;
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

function TopicRow({ topic }: { topic: TopicInfo }) {
  const status = STATUS[topic.status];
  return (
    <ListRow
      table
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

function Backlog({ backlog }: { backlog: BacklogResponse }) {
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
        <div className="px-4 tablet:w-(--size-rail) tablet:box-content tablet:pl-0">
          {/* The bundle's search box: no visible label (SearchField isn't built). */}
          <div className="input input--search">
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
                topics.map((topic) => <TopicRow key={topic.id} topic={topic} />)
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

/** Backlog (`/study`, Study's first tab). */
export function BacklogScreen() {
  return (
    <div className="flex flex-col gap-3 tablet:gap-4">
      <ReadView
        load={loadBacklog}
        skeleton={<BacklogSkeleton />}
        empty={
          <>
            <PageTitle title="Backlog" />
            <div className="px-4 pb-6">
              <div className="group">
                <EmptyState icon="list" title="No topics yet">
                  Add one here, or ask Claude to <code>/add</code> it.
                </EmptyState>
              </div>
            </div>
          </>
        }
      >
        {(backlog) => <Backlog backlog={backlog} />}
      </ReadView>
    </div>
  );
}
