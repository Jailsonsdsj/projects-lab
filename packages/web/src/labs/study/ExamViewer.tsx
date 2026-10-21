// An exam attempt (docs/prd/12-study-exams.md § Screens), full screen like the
// course reader: its Markdown (questions, then Results once graded) and a link
// to its PDF. Both by blob SHA through the content proxy; the PDF opens in the
// browser's own viewer, with the session cookie.
import {
  type ExamRead,
  examReadResponseSchema,
  formatGrade,
} from "@projects-lab/shared/study";
import { useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Badge,
  Button,
  ErrorState,
  Icon,
  PageHeader,
  Prose,
  Skeleton,
  useMinWidth,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";

const LEVEL: Record<ExamRead["level"], string> = {
  fast_track: "Fast track",
  essential: "Essential",
  specialized: "Specialized",
};

/** "Essential exam #1", "Essential retake #2". */
export const examTitle = (exam: Pick<ExamRead, "level" | "attempt">) =>
  `${LEVEL[exam.level]} ${exam.attempt > 1 ? "retake" : "exam"} #${exam.attempt}`;

/** The day an instant falls on here (YYYY-MM-DD). */
export const localDay = (iso: string) =>
  new Intl.DateTimeFormat("en-CA").format(new Date(iso));

const contentUrl = (file: { sha: string; name: string }) =>
  `/api/study/content/${file.sha}/${encodeURIComponent(file.name)}`;

type Loaded = { exam: ExamRead; markdown: string } | { missing: string };

function Exam({ exam, markdown }: { exam: ExamRead; markdown: string }) {
  const navigate = useNavigate();
  const tablet = useMinWidth("--breakpoint-tablet");
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/study");
  };
  return (
    <>
      <div className="reader__head">
        <PageHeader
          leading={
            <Button
              variant="ghost"
              tone="neutral"
              icon="chevron-left"
              iconOnly={!tablet}
              aria-label="Back"
              onClick={back}
            >
              {tablet ? "Back" : undefined}
            </Button>
          }
          title={`${exam.topicId} · ${examTitle(exam)}`}
          titleIsHeading={false}
        />
      </div>
      <main className="reader__main">
        <div className="reader__meta">
          <Badge tone="accent" mono>
            {exam.topicId}
          </Badge>
          <span>{exam.skill}</span>
          <span aria-hidden="true">·</span>
          {exam.grade === null || exam.gradedAt === null ? (
            <Badge size="sm" tone="todo">
              Awaiting grade
            </Badge>
          ) : (
            <span>
              Grade <b className="mono">{formatGrade(exam.grade)}</b> ·{" "}
              {localDay(exam.gradedAt)}
            </span>
          )}
        </div>
        {/* An exam made in the app has no PDF (PRD 12 § Exams in the app). */}
        {exam.pdf && (
          <a
            className="btn btn--soft mb-6 self-start"
            href={contentUrl(exam.pdf)}
          >
            <Icon name="file" />
            Open the PDF
          </a>
        )}
        <Prose markdown={markdown} large={tablet} />
      </main>
    </>
  );
}

/** `/study/exams/:examId`: one attempt, read from study-materials. */
export function ExamViewer() {
  const { examId = "" } = useParams();
  const navigate = useNavigate();
  const load = useCallback(
    async (signal: AbortSignal): Promise<Loaded> => {
      const meta = await apiFetch(
        `/api/study/exams/${encodeURIComponent(examId)}`,
        { signal },
      );
      if (meta.status === 404) {
        const { message } = (await meta.json().catch(() => ({}))) as {
          message?: string;
        };
        return { missing: message ?? "No such exam." };
      }
      if (!meta.ok) throw new Error(`GET /api/study/exams/…: ${meta.status}`);
      const { exam } = examReadResponseSchema.parse(await meta.json());
      const content = await apiFetch(contentUrl(exam.md), { signal });
      if (!content.ok)
        throw new Error(`GET /api/study/content/…: ${content.status}`);
      return { exam, markdown: await content.text() };
    },
    [examId],
  );
  return (
    <ReadView
      key={examId}
      load={load}
      empty={null}
      skeleton={
        <section
          aria-busy="true"
          aria-label="Loading the exam"
          className="flex flex-col gap-3 p-4"
        >
          <Skeleton shape="title" width="60%" />
          <Skeleton shape="block" />
        </section>
      }
      failure={{
        offline: {
          title: "You're offline",
          text: "Open this exam once online to read it offline.",
        },
      }}
    >
      {(loaded) =>
        "missing" in loaded ? (
          <main className="p-4">
            <ErrorState
              kind="error"
              title="This exam isn't there"
              actions={
                <Button
                  variant="outline"
                  tone="neutral"
                  onClick={() => navigate("/study")}
                >
                  Backlog
                </Button>
              }
            >
              {loaded.missing}
            </ErrorState>
          </main>
        ) : (
          <Exam {...loaded} />
        )
      }
    </ReadView>
  );
}
