// The Jobs tab (docs/prd/21-career-jobs-and-skills.md § Screens): tracked
// jobs, best readiness first as the API sends them, each opening its Job
// screen. The bundle draws the Job screen, not this list: a Group of ListRows.
import type { JobSummary } from "@projects-lab/shared/career";
import { useNavigate, useSearchParams } from "react-router";
import {
  Badge,
  EmptyState,
  Group,
  ListRow,
  linkClick,
  PageTitle,
  Skeleton,
  Tabs,
} from "../../components/ui";
import { ReadView } from "../../core/ReadView";
import { CriteriaForm } from "./CriteriaForm";
import { fetchJobs } from "./data";
import { DECISION, STATUS_LABEL } from "./labels";
import { OpeningsPanel } from "./OpeningsPanel";

async function load(signal: AbortSignal): Promise<JobSummary[] | null> {
  const jobs = await fetchJobs(signal);
  return jobs.length ? jobs : null;
}

function JobRow({ job }: { job: JobSummary }) {
  const navigate = useNavigate();
  const href = `/career/jobs/${job.id}`;
  const { ready, total } = job.readiness.required;
  return (
    <ListRow
      title={job.role}
      meta={[
        job.company,
        STATUS_LABEL[job.status],
        job.silent ? "No answer in 3 weeks" : null,
      ]
        .filter(Boolean)
        .join(" · ")}
      tags={
        job.fit && (
          <Badge tone={DECISION[job.fit.decision].tone} size="sm">
            {DECISION[job.fit.decision].label}
          </Badge>
        )
      }
      value={total ? `${ready}/${total}` : "—"}
      href={href}
      onClick={linkClick(href, navigate)}
    />
  );
}

function TrackedJobs() {
  return (
    <ReadView
      load={load}
      skeleton={
        <div className="flex flex-col gap-3">
          <Skeleton shape="block" />
          <Skeleton shape="block" />
        </div>
      }
      empty={
        <EmptyState icon="target" title="No jobs tracked yet">
          Paste a posting you like to Claude and ask it to map it: its
          requirements, your readiness and whether it's worth applying.
        </EmptyState>
      }
    >
      {(jobs) => (
        <Group title="Tracked" count={jobs.length}>
          {jobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </Group>
      )}
    </ReadView>
  );
}

type View = "tracked" | "openings" | "criteria";
const VIEWS: readonly View[] = ["tracked", "openings", "criteria"];

/** Jobs: what's tracked, what the weekly search found, and what it searches
 *  for. The view is in the URL (?view=openings), so the digest can link to it. */
export function JobsScreen() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("view") as View | null;
  const view: View = asked && VIEWS.includes(asked) ? asked : "tracked";
  return (
    <>
      <PageTitle title="Jobs" />
      <Tabs
        className="px-3 tablet:mx-4 tablet:px-0"
        label="Jobs views"
        value={view}
        onChange={(next) =>
          setParams(next === "tracked" ? {} : { view: next }, { replace: true })
        }
        items={[
          { id: "tracked", label: "Tracked" },
          { id: "openings", label: "Openings" },
          { id: "criteria", label: "Search criteria" },
        ]}
      />
      {/* PageTitle brings its own gutter; the rest lines up with it. */}
      <div className="px-4 pt-4 pb-6">
        {view === "tracked" && <TrackedJobs />}
        {view === "openings" && <OpeningsPanel />}
        {view === "criteria" && <CriteriaForm />}
      </div>
    </>
  );
}
