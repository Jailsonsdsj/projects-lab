// The Jobs tab (docs/prd/21-career-jobs-and-skills.md § Screens): tracked
// jobs, best readiness first as the API sends them, each opening its Job
// screen. The bundle draws the Job screen, not this list: a Group of ListRows.
import type { JobSummary } from "@projects-lab/shared/career";
import { useNavigate } from "react-router";
import {
  Badge,
  EmptyState,
  Group,
  ListRow,
  linkClick,
  PageTitle,
  Skeleton,
} from "../../components/ui";
import { ReadView } from "../../core/ReadView";
import { fetchJobs } from "./data";
import { DECISION, STATUS_LABEL } from "./labels";

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

export function JobsScreen() {
  return (
    <ReadView
      load={load}
      skeleton={
        <>
          <PageTitle title="Jobs" />
          <div className="flex flex-col gap-3 px-4">
            <Skeleton shape="block" />
            <Skeleton shape="block" />
          </div>
        </>
      }
      empty={
        <>
          <PageTitle title="Jobs" />
          <EmptyState icon="target" title="No jobs tracked yet">
            Paste a posting you like to Claude and ask it to map it: its
            requirements, your readiness and whether it's worth applying.
          </EmptyState>
        </>
      }
    >
      {(jobs) => (
        <>
          <PageTitle
            title="Jobs"
            subtitle={`${jobs.length} tracked · best match first`}
          />
          {/* PageTitle brings its own gutter; the rest lines up with it. */}
          <div className="px-4 pb-6">
            <Group title="Tracked" count={jobs.length}>
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </Group>
          </div>
        </>
      )}
    </ReadView>
  );
}
