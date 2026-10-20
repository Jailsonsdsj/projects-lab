// One tracked job (docs/prd/21-career-jobs-and-skills.md § Screens), markup
// from the bundle's "Job readiness" phone and tablet screens: the meter, each
// requirement with its readiness and where it stands in Study, "Add to Study
// backlog" for a gap; then what isn't mapped, the fit and the posting.
// Readiness comes computed from the API (never worked out here).
import { formatGrade } from "@projects-lab/shared";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@projects-lab/shared/career";
import { type ReactNode, useCallback, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  Button,
  Dialog,
  Group,
  ListRow,
  OptionsMenu,
  ReadinessMeter,
  RequirementRow,
  Select,
  Skeleton,
  StatCard,
  Textarea,
  useMinWidth,
  useToast,
} from "../../components/ui";
import { ReadView } from "../../core/ReadView";
import { fetchJob, fetchStudyAreas, type JobDetail } from "./data";
import { FormSheet, send } from "./FormSheet";
import { DECISION, STATUS_LABEL } from "./labels";

type Requirement = JobDetail["requirements"][number];
type Areas = Awaited<ReturnType<typeof fetchStudyAreas>>;

/** Where a requirement stands, in the bundle's words. */
function whereItStands(r: Requirement): ReactNode {
  const topic = r.study && (
    <Link to="/study">
      {r.study.topicId} {r.skill}
    </Link>
  );
  if (r.readiness === "verified")
    return (
      <>
        Passed {topic}
        {r.study?.grade !== null && r.study?.grade !== undefined && (
          <>
            {" · "}
            <span className="mono">{formatGrade(r.study.grade)}</span>
          </>
        )}
      </>
    );
  if (r.readiness === "declared")
    return r.study?.status === "in_progress" ? (
      <>Studying now: {topic}</>
    ) : (
      "In your profile · no exam yet"
    );
  return topic ? (
    <>Already in your backlog as {topic}</>
  ) : (
    "Not in your profile or backlog"
  );
}

/** Gaps first, then declared, then verified (the bundle's phone order). */
const ORDER: readonly Requirement["readiness"][] = [
  "gap",
  "declared",
  "verified",
];
const rank = (r: Requirement) => ORDER.indexOf(r.readiness);

function GapSheet({
  job,
  requirement,
  areas,
  open,
  onClose,
  onAdded,
}: {
  job: JobDetail;
  requirement: Requirement;
  areas: Areas;
  open: boolean;
  onClose: () => void;
  onAdded: (topicId: string) => void;
}) {
  const [area, setArea] = useState("");
  // P1 core required, P2 other required, P3 nice to have (PRD 21).
  const [priority, setPriority] = useState<1 | 2 | 3>(
    requirement.type === "required" ? 2 : 3,
  );
  const [tried, setTried] = useState(false);
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={`Add ${requirement.skill} to Study`}
      saveLabel="Add to Study backlog"
      onSave={() => {
        setTried(true);
        if (!area) return null;
        return send("POST", `/api/career/jobs/${job.id}/gaps`, {
          gaps: [{ requirementId: requirement.id, area, priority }],
        });
      }}
      onDone={() => undefined}
      onSaved={async (response) => {
        const { gaps } = (await response.json()) as {
          gaps: { topicId: string }[];
        };
        onAdded(gaps[0]?.topicId ?? "");
      }}
    >
      <p className="text-sm text-ink-muted">
        For {job.role} at {job.company}. The topic's note says "Job:{" "}
        {job.company}".
      </p>
      <Select
        label="Area"
        value={area}
        error={tried && !area ? "Choose where it goes." : undefined}
        options={[
          ["", "Choose an area"],
          ...areas.map((a): [string, string] => [a.prefix, a.name]),
        ]}
        onChange={setArea}
      />
      <Select
        label="Priority"
        value={priority}
        options={[
          [1, "P1 · next up"],
          [2, "P2 · soon"],
          [3, "P3 · later"],
        ]}
        onChange={setPriority}
      />
    </FormSheet>
  );
}

function StatusSheet({
  job,
  open,
  onClose,
  onDone,
}: {
  job: JobDetail;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [status, setStatus] = useState<ApplicationStatus>(job.status);
  const [note, setNote] = useState("");
  return (
    <FormSheet
      open={open}
      onClose={onClose}
      onDone={onDone}
      title="Change status"
      onSave={() =>
        status === job.status && !note.trim()
          ? null
          : send("PATCH", `/api/career/jobs/${job.id}`, {
              status,
              ...(note.trim() ? { note: note.trim() } : {}),
            })
      }
    >
      <Select
        label="Status"
        value={status}
        options={APPLICATION_STATUSES.map((s) => [s, STATUS_LABEL[s]])}
        onChange={setStatus}
      />
      <Textarea
        label="Note"
        optional
        maxLength={500}
        value={note}
        hint="Kept with this change in the job's history."
        onChange={(e) => setNote(e.target.value)}
      />
    </FormSheet>
  );
}

function Job({
  job,
  areas,
  onChanged,
}: {
  job: JobDetail;
  areas: Areas;
  onChanged: (message: string) => void;
}) {
  const tablet = useMinWidth("--breakpoint-tablet");
  const navigate = useNavigate();
  const toast = useToast();
  const [adding, setAdding] = useState<Requirement | null>(null);
  const [lastAdding, setLastAdding] = useState<Requirement | null>(null);
  if (adding && adding !== lastAdding) setLastAdding(adding);
  const [statusOpen, setStatusOpen] = useState(0);
  const [removing, setRemoving] = useState(false);

  const required = job.requirements.filter((r) => r.type === "required");
  const nice = job.requirements.filter((r) => r.type === "nice");
  const count = (readiness: Requirement["readiness"]) =>
    new Set(
      required.filter((r) => r.readiness === readiness).map((r) => r.skillId),
    ).size;
  const sorted = (list: Requirement[]) =>
    [...list].sort(
      (a, b) =>
        (tablet && a.readiness !== "gap" && b.readiness !== "gap"
          ? rank(b) - rank(a)
          : rank(a) - rank(b)) || a.position - b.position,
    );
  const row = (r: Requirement) => (
    <RequirementRow
      key={r.id}
      table={tablet}
      name={r.text}
      readiness={r.readiness}
      meta={whereItStands(r)}
      action={
        r.readiness === "gap" && !r.study ? (
          <Button
            variant="soft"
            size="sm"
            icon={tablet ? undefined : "plus"}
            onClick={() => setAdding(r)}
          >
            Add to Study backlog
          </Button>
        ) : undefined
      }
    />
  );
  const list = (title: string, items: Requirement[]) =>
    items.length > 0 && (
      <section aria-label={title}>
        <div className="group__title">
          <span className="kicker">{title}</span>
          <span className="kicker mono">{items.length}</span>
        </div>
        <ul className="group m-0 p-0">{sorted(items).map(row)}</ul>
      </section>
    );

  const summary = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl leading-tight font-semibold tracking-tight">
          {job.role}
        </h1>
        <p className="text-ink-secondary">
          {job.company} · {STATUS_LABEL[job.status]}
          {job.silent ? " · no answer in 3 weeks" : ""}
        </p>
      </div>
      <section className="stat" aria-label="Readiness">
        <ReadinessMeter
          verified={count("verified")}
          declared={count("declared")}
          gap={count("gap")}
          detailed={tablet}
        />
      </section>
      {job.fit && (
        <StatCard
          label="Fit"
          value={String(job.fit.total)}
          unit="/ 100"
          note={DECISION[job.fit.decision].label}
        />
      )}
    </div>
  );

  return (
    <>
      <div className="flex items-center gap-2 px-2 pt-1 tablet:px-6 tablet:pt-6">
        <Button
          variant="ghost"
          tone="neutral"
          size={tablet ? "sm" : "md"}
          icon="chevron-left"
          onClick={() => navigate("/career")}
        >
          Jobs
        </Button>
        <span className="flex-1" />
        <OptionsMenu
          label="Options for this job"
          heading={`${job.role} · ${job.company}`}
          items={[
            {
              label: "Change status",
              icon: "pencil",
              onSelect: () => setStatusOpen((n) => n + 1),
            },
            "separator",
            {
              label: "Stop tracking",
              icon: "trash",
              danger: true,
              onSelect: () => setRemoving(true),
            },
          ]}
        />
      </div>
      <div className="flex flex-col gap-5 px-4 pb-6 tablet:grid tablet:grid-cols-[var(--size-rail)_minmax(0,1fr)] tablet:items-start tablet:gap-6 tablet:px-8">
        {summary}
        <div className="flex flex-col gap-4">
          {tablet ? (
            <>
              {list(
                "Gaps",
                required.filter((r) => r.readiness === "gap"),
              )}
              {list(
                "Ready",
                required.filter((r) => r.readiness !== "gap"),
              )}
            </>
          ) : (
            list("Requirements", required)
          )}
          {list("Nice to have", nice)}
          {job.notMapped.length > 0 && (
            <Group title="Not mapped to a skill" count={job.notMapped.length}>
              {job.notMapped.map((r) => (
                <ListRow key={r.id} title={r.text} />
              ))}
            </Group>
          )}
          {job.fitNotes && (
            <details className="group p-4">
              <summary className="font-medium">Fit notes</summary>
              <p className="pt-2 whitespace-pre-wrap text-ink-secondary">
                {job.fitNotes}
              </p>
            </details>
          )}
          <details className="group p-4">
            <summary className="font-medium">Posting</summary>
            <p className="pt-2 whitespace-pre-wrap text-ink-secondary">
              {job.posting}
            </p>
          </details>
        </div>
      </div>

      {lastAdding && (
        <GapSheet
          key={lastAdding.id}
          job={job}
          requirement={lastAdding}
          areas={areas}
          open={adding !== null}
          onClose={() => setAdding(null)}
          onAdded={(topicId) => {
            setAdding(null);
            onChanged(
              `Added to Study backlog as ${topicId} ${lastAdding.skill}`,
            );
          }}
        />
      )}
      {statusOpen > 0 && (
        <StatusSheet
          key={statusOpen}
          job={job}
          open={statusOpen > 0}
          onClose={() => setStatusOpen(0)}
          onDone={(message) => {
            setStatusOpen(0);
            onChanged(message);
          }}
        />
      )}
      <Dialog
        open={removing}
        onClose={() => setRemoving(false)}
        tone="danger"
        icon="trash"
        title="Stop tracking this job?"
        actions={
          <>
            <Button
              variant="outline"
              tone="neutral"
              onClick={() => setRemoving(false)}
            >
              Keep it
            </Button>
            <Button
              tone="danger"
              onClick={async () => {
                setRemoving(false);
                const response = await send(
                  "DELETE",
                  `/api/career/jobs/${job.id}`,
                ).catch(() => null);
                if (!response?.ok)
                  return toast.show({
                    tone: "danger",
                    message: "Couldn't stop tracking it. Try again.",
                  });
                toast.show({ tone: "success", message: "Stopped tracking it" });
                navigate("/career");
              }}
            >
              Stop tracking
            </Button>
          </>
        }
      >
        It leaves your jobs. The topics its gaps added stay in Study.
      </Dialog>
    </>
  );
}

export function JobScreen() {
  const { jobId = "" } = useParams();
  const toast = useToast();
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [job, areas] = await Promise.all([
        fetchJob(jobId, signal),
        fetchStudyAreas(signal),
      ]);
      return { job, areas };
    },
    [jobId],
  );
  return (
    <ReadView
      key={jobId}
      refresh={refresh}
      load={load}
      skeleton={
        <div className="flex flex-col gap-4 p-4 tablet:px-8">
          <Skeleton shape="title" width="60%" />
          <Skeleton shape="block" />
          <Skeleton shape="block" />
        </div>
      }
      empty={null}
      failure={{
        error: {
          title: "Couldn't open this job",
          text: "It may have been removed. Go back to Jobs, or try again.",
        },
      }}
    >
      {({ job, areas }) => (
        <Job
          job={job}
          areas={areas}
          onChanged={(message) => {
            toast.show({ tone: "success", message });
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </ReadView>
  );
}
