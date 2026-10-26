// An exam attempt (docs/prd/12-study-exams.md § Screens), full screen like the
// course reader: its Markdown (questions, then Results once graded) and a link
// to its PDF. Both by blob SHA through the content proxy; the PDF opens in the
// browser's own viewer, with the session cookie. Delete exam (ST-14): a
// danger confirm, then back where the owner came from with Undo in a toast.
import { IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import {
  type ExamRead,
  examReadResponseSchema,
  formatGrade,
} from "@projects-lab/shared/study";
import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  Badge,
  Button,
  Dialog,
  ErrorState,
  Icon,
  PageHeader,
  Prose,
  Skeleton,
  useMinWidth,
  useToast,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";
import { announceDataChanged } from "../../core/read";
import { AppExam } from "./AppExam";

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

/** One exam's delete or Undo, by ID: answers whether it went through, or why not. */
async function send(
  examId: string,
  undo: boolean,
): Promise<"ok" | "gone" | "failed" | { refused: string }> {
  const id = encodeURIComponent(examId);
  const response = await apiFetch(
    undo ? `/api/study/exams/${id}/restore` : `/api/study/exams/${id}`,
    {
      method: undo ? "POST" : "DELETE",
      headers: { [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID() },
    },
  ).catch(() => null);
  if (response?.ok) return "ok";
  if (response?.status === 404) return "gone";
  if (response?.status === 409) {
    const { message } = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    return { refused: message ?? "It can't come back." };
  }
  return "failed";
}

function Exam({ exam, markdown }: { exam: ExamRead; markdown: string }) {
  // Graded on this page (an app exam): the header shows it at once.
  const [gradedHere, setGradedHere] = useState<number | null>(null);
  // An app exam being graded can't be deleted under it.
  const [grading, setGrading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);
  const { show } = useToast();
  const navigate = useNavigate();
  const tablet = useMinWidth("--breakpoint-tablet");
  const location = useLocation();
  // Back where the owner came from; opened directly (the first page), Study.
  const back = () => {
    if (location.key !== "default") navigate(-1);
    else navigate("/study");
  };
  const name = `${exam.topicId} exam #${exam.attempt}`;

  // Runs from the toast, after this screen is gone: nothing here but `show`.
  async function undo() {
    const result = await send(exam.examId, true);
    if (result === "ok") {
      announceDataChanged();
      show({ message: `${name} is back`, tone: "success" });
    } else if (typeof result === "object")
      show({ message: result.refused, tone: "danger" });
    else
      show({
        message: `Couldn't bring back ${name}.`,
        tone: "danger",
        action: { label: "Retry", onClick: undo },
      });
  }

  async function remove() {
    setDeleting(true);
    setFailed(false);
    const result = await send(exam.examId, false);
    setDeleting(false);
    // 404: already gone, which is what Delete wanted.
    if (result === "ok" || result === "gone") {
      setConfirming(false);
      back();
      announceDataChanged();
      show({
        message: `${name} deleted`,
        action: { label: "Undo", onClick: undo },
      });
    } else setFailed(true);
  }
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
          actions={
            <Button
              variant="ghost"
              tone="danger"
              icon="trash"
              iconOnly={!tablet}
              aria-label="Delete exam"
              disabled={grading}
              onClick={() => setConfirming(true)}
            >
              {tablet ? "Delete" : undefined}
            </Button>
          }
        />
      </div>
      <Dialog
        open={confirming}
        onClose={() => !deleting && setConfirming(false)}
        tone="danger"
        icon="trash"
        title={`Delete exam #${exam.attempt}?`}
        stretchActions
        actions={
          <>
            <Button
              variant="outline"
              tone="neutral"
              disabled={deleting}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button tone="danger" loading={deleting} onClick={remove}>
              {deleting ? "Deleting" : "Delete"}
            </Button>
          </>
        }
      >
        {failed
          ? "Couldn't delete it. Check your connection and try again."
          : `${exam.topicId} · ${examTitle(exam)} leaves Grades and its course, and the topic's grade is worked out without it. Its files leave study-materials tonight; until then, Undo brings it back.`}
      </Dialog>
      <main className="reader__main">
        <div className="reader__meta">
          <Badge tone="accent" mono>
            {exam.topicId}
          </Badge>
          <span>{exam.skill}</span>
          <span aria-hidden="true">·</span>
          {gradedHere !== null ? (
            <span>
              Grade <b className="mono">{formatGrade(gradedHere)}</b> · today
            </span>
          ) : exam.grade === null || exam.gradedAt === null ? (
            <Badge size="sm" tone="todo">
              {exam.source === "app" ? "To answer" : "Awaiting grade"}
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
        {/* Made in the app: answered and graded here (ST-13e2). */}
        {exam.source === "app" ? (
          <AppExam
            examId={exam.examId}
            onGraded={setGradedHere}
            onBusy={setGrading}
          />
        ) : (
          <Prose markdown={markdown} large={tablet} />
        )}
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
