// "Take the test" (ST-13e1; docs/prd/12-study-exams.md § Exams in the app): the
// form that asks the Worker to write an exam for this course, and the course's
// exams in the reader's outline. The Worker writes it through the Anthropic
// API and commits it to study-materials; this only collects the settings.
import { formatGrade, IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import {
  type CourseRead,
  EXAM_FOCUS_MAX_LENGTH,
  EXAM_MAX_QUESTIONS,
  type ExamInfo,
  type ExamSettings,
  examsResponseSchema,
  generatedExamResponseSchema,
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
  type QuestionType,
} from "@projects-lab/shared/study";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Input,
  Sheet,
  Textarea,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { failureKind } from "../../core/failure";
import { useRead } from "../../core/read";

export interface LessonRef {
  n: number;
  title: string;
}

const TYPE_NAME: Record<QuestionType, string> = {
  MC: "Multiple choice",
  TF: "True or false",
  OPEN: "Open",
  CODE: "Code fill-in",
  CODE_MC: "Code multiple choice",
};

/** A whole number from what's typed, or null. */
const whole = (text: string) =>
  /^\d+$/.test(text.trim()) ? Number(text) : null;

type Failure = { kind: "offline" } | { kind: "error"; message: string };

export function TakeTestSheet({
  course,
  lessons,
  open,
  onClose,
  onReady,
}: {
  course: CourseRead;
  lessons: readonly LessonRef[];
  open: boolean;
  onClose: () => void;
  /** The new exam's id: the reader opens it. */
  onReady: (examId: string) => void;
}) {
  const [questions, setQuestions] = useState("10");
  const [showTypes, setShowTypes] = useState(false);
  const [mix, setMix] = useState<Record<QuestionType, string>>({
    MC: "3",
    TF: "2",
    OPEN: "2",
    CODE: "1",
    CODE_MC: "2",
  });
  const [chosen, setChosen] = useState<ReadonlySet<number>>(
    () => new Set(lessons.map((l) => l.n)),
  );
  const [focus, setFocus] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Failure | null>(null);

  const count = whole(questions);
  const countError =
    count === null || count < 1 || count > EXAM_MAX_QUESTIONS
      ? `A whole number from 1 to ${EXAM_MAX_QUESTIONS}.`
      : undefined;
  const mixCounts = QUESTION_TYPES.map((t) => whole(mix[t]));
  const mixTotal = mixCounts.reduce<number>((n, c) => n + (c ?? 0), 0);
  const mixError = !showTypes
    ? undefined
    : mixCounts.some((c) => c === null)
      ? "Each type needs a whole number (0 for none)."
      : count !== null && mixTotal !== count
        ? `The types add up to ${mixTotal}, not ${count}.`
        : undefined;
  const lessonsError =
    lessons.length > 0 && chosen.size === 0
      ? "Choose at least one lesson."
      : undefined;
  const focusError =
    focus.length > EXAM_FOCUS_MAX_LENGTH
      ? `At most ${EXAM_FOCUS_MAX_LENGTH} characters.`
      : undefined;

  const settings: ExamSettings | null =
    countError || mixError || lessonsError || focusError || count === null
      ? null
      : {
          questions: count,
          ...(showTypes
            ? {
                mix: Object.fromEntries(
                  QUESTION_TYPES.map((t, i) => [t, mixCounts[i] ?? 0]),
                ),
              }
            : {}),
          ...(chosen.size < lessons.length
            ? { lessons: [...chosen].sort((a, b) => a - b) }
            : {}),
          ...(focus.trim() ? { focus: focus.trim() } : {}),
        };
  // One key per set of settings: retrying the same request after a lost
  // answer gets the same exam, never a second one (each costs money).
  const settingsKey = JSON.stringify(settings);
  const idempotencyKey = useMemo(
    () => (settingsKey ? crypto.randomUUID() : ""),
    [settingsKey],
  );

  async function generate() {
    setTried(true);
    setFailed(null);
    if (!settings) return;
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/study/courses/${encodeURIComponent(course.courseId)}/exams`,
        {
          method: "POST",
          headers: {
            [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(settings),
        },
      );
      if (!response.ok) {
        const { message } = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        return setFailed({
          kind: "error",
          message: message ?? "Something went wrong. Try again in a moment.",
        });
      }
      const { exam } = generatedExamResponseSchema.parse(await response.json());
      onReady(exam.examId);
    } catch (error) {
      setFailed(
        failureKind(error) === "offline"
          ? { kind: "offline" }
          : {
              kind: "error",
              message: "Something went wrong. Try again in a moment.",
            },
      );
    } finally {
      setBusy(false);
    }
  }

  const toggle = (n: number) =>
    setChosen((was) => {
      const next = new Set(was);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Take the test"
      footer={
        <div className="flex w-full flex-col gap-2">
          {busy && (
            <p className="text-sm text-ink-muted" role="status">
              Writing your exam… This can take up to a minute. Keep this open.
            </p>
          )}
          <Button loading={busy} onClick={generate}>
            {busy ? "Writing your exam" : "Generate"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          A final exam on {course.topicId} · {course.skill}, written for you
          now. Answer it here; it's graded when you submit.
        </p>
        {failed?.kind === "error" && (
          <Banner tone="danger" title="Couldn't write the exam.">
            {failed.message}
          </Banner>
        )}
        {failed?.kind === "offline" && (
          <Banner tone="offline" title="You're offline.">
            Writing an exam needs a connection. Your choices are still here.
          </Banner>
        )}
        <Input
          label="Questions"
          inputMode="numeric"
          value={questions}
          onChange={(event) => setQuestions(event.target.value)}
          error={tried || questions !== "" ? countError : undefined}
          hint={`1 to ${EXAM_MAX_QUESTIONS}.`}
        />
        <Checkbox
          checked={showTypes}
          onChange={(event) => setShowTypes(event.target.checked)}
        >
          Choose question types
        </Checkbox>
        {showTypes && (
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">Question types</legend>
            <div className="grid grid-cols-2 gap-3 tablet:grid-cols-3">
              {QUESTION_TYPES.map((t) => (
                <Input
                  key={t}
                  label={`${TYPE_NAME[t]} (${QUESTION_TYPE_LABEL[t]})`}
                  inputMode="numeric"
                  value={mix[t]}
                  onChange={(event) =>
                    setMix((was) => ({ ...was, [t]: event.target.value }))
                  }
                />
              ))}
            </div>
            <p
              className={
                mixError ? "text-sm text-danger-ink" : "text-sm text-ink-muted"
              }
              role={mixError ? "alert" : undefined}
            >
              {mixError ?? `Total ${mixTotal} of ${count ?? "?"}.`}
            </p>
          </fieldset>
        )}
        {lessons.length > 0 && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">
              Lessons <span className="text-ink-muted">(optional)</span>
            </legend>
            {lessons.map((l) => (
              <Checkbox
                key={l.n}
                checked={chosen.has(l.n)}
                onChange={() => toggle(l.n)}
                invalid={Boolean(lessonsError)}
              >
                {l.n}. {l.title}
              </Checkbox>
            ))}
            {lessonsError && (
              <p className="text-sm text-danger-ink" role="alert">
                {lessonsError}
              </p>
            )}
          </fieldset>
        )}
        <Textarea
          label="Focus"
          optional
          rows={3}
          value={focus}
          maxLength={EXAM_FOCUS_MAX_LENGTH}
          onChange={(event) => setFocus(event.target.value)}
          error={focusError}
          hint="What to stress, e.g. more on trade-offs."
        />
      </div>
    </Sheet>
  );
}

/** The course's exams at its level, for the reader's outline. */
export function CourseExams({ course }: { course: CourseRead }) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const response = await apiFetch(
        `/api/study/exams?topicId=${encodeURIComponent(course.topicId)}`,
        { signal },
      );
      if (!response.ok)
        throw new Error(`GET /api/study/exams: ${response.status}`);
      const { exams } = examsResponseSchema.parse(await response.json());
      return exams
        .filter((e) => e.level === course.level)
        .sort((a, b) => a.attempt - b.attempt);
    },
    [course.topicId, course.level],
  );
  const { state } = useRead(load);
  if (state.status !== "loaded" || state.data.length === 0) return null;
  return (
    <nav className="toc" aria-label="Exams">
      <span className="kicker">Exams</span>
      {state.data.map((exam) => (
        <Link key={exam.examId} to={`/study/exams/${exam.examId}`}>
          {/* The row inside the link: .toc a sets its own display. */}
          <span className="flex w-full items-center justify-between gap-2">
            <span>Exam #{exam.attempt}</span>
            <ExamStatus exam={exam} />
          </span>
        </Link>
      ))}
    </nav>
  );
}

function ExamStatus({ exam }: { exam: ExamInfo }) {
  if (exam.grade !== null)
    return <span className="mono text-sm">{formatGrade(exam.grade)}</span>;
  return exam.source === "app" ? (
    <Badge size="sm" tone="doing">
      To answer
    </Badge>
  ) : (
    <Badge size="sm" tone="todo">
      Awaiting grade
    </Badge>
  );
}
