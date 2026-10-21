// An exam made in the app (ST-13e2; docs/prd/12-study-exams.md § Exams in the
// app), inside the exam viewer: answered on the page with a draft that saves
// itself, submitted for grading, then its grade and per-question results.
import { IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import {
  type ExamAnswer,
  type ExamPaper,
  type ExamQuestion,
  examPaperResponseSchema,
  formatGrade,
  LETTERS,
  type Letter,
  numberedBlanks,
  QUESTION_TYPE_LABEL,
  questionValue,
} from "@projects-lab/shared/study";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Banner,
  Button,
  Dialog,
  Input,
  Prose,
  RadioGroup,
  Skeleton,
  Textarea,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { failureKind } from "../../core/failure";
import { useRead } from "../../core/read";

const ROMAN = ["I", "II", "III", "IV", "V"] as const;
const TYPE_NAME: Record<ExamQuestion["type"], string> = {
  MC: "Multiple choice",
  TF: "True or false",
  OPEN: "Open question",
  CODE: "Code fill-in",
  CODE_MC: "Code multiple choice",
};

/** The question as text: its stem, then its snippet as a code block. */
const questionMarkdown = (q: ExamQuestion) =>
  [
    q.stem ?? "Mark each statement True or False.",
    "code" in q && q.code
      ? `\`\`\`${("language" in q && q.language) || ""}\n${q.code}\n\`\`\``
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

const answered = (a: ExamAnswer) => {
  switch (a.type) {
    case "MC":
    case "CODE_MC":
      return a.choice !== null;
    case "TF":
      return a.marks.every((m) => m !== null);
    case "OPEN":
      return a.text.trim() !== "";
    case "CODE":
      return a.blanks.some((b) => b.trim() !== "");
  }
};

type Saving = "idle" | "saving" | "saved" | "offline" | "error";

/** The paper, then the form or the results. */
export function AppExam({
  examId,
  onGraded,
}: {
  examId: string;
  /** The grade once submitted here, for the viewer's header. */
  onGraded?: (grade: number) => void;
}) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const response = await apiFetch(
        `/api/study/exams/${encodeURIComponent(examId)}/paper`,
        { signal },
      );
      if (!response.ok) throw new Error(`GET …/paper: ${response.status}`);
      return examPaperResponseSchema.parse(await response.json()).paper;
    },
    [examId],
  );
  const { state } = useRead(load);
  const [graded, setGraded] = useState<ExamPaper | null>(null);
  if (graded) return <Results paper={graded} />;
  if (state.status === "loading") return <Skeleton shape="block" />;
  if (state.status !== "loaded")
    return (
      <Banner
        tone={state.status === "offline" ? "offline" : "danger"}
        title="Couldn't open this exam."
      >
        {state.status === "offline"
          ? "Open it once you're back online."
          : "Try again in a moment."}
      </Banner>
    );
  return state.data.result ? (
    <Results paper={state.data} />
  ) : (
    <AnswerForm
      paper={state.data}
      onGraded={(paper) => {
        setGraded(paper);
        if (paper.result) onGraded?.(paper.result.grade);
      }}
    />
  );
}

function AnswerForm({
  paper,
  onGraded,
}: {
  paper: ExamPaper;
  onGraded: (paper: ExamPaper) => void;
}) {
  const [answers, setAnswers] = useState<ExamAnswer[]>(paper.draft);
  const [saving, setSaving] = useState<Saving>("idle");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState<
    { kind: "offline" } | { kind: "error"; message: string } | null
  >(null);
  const first = useRef(true);

  const save = useCallback(
    async (next: ExamAnswer[]) => {
      setSaving("saving");
      try {
        const response = await apiFetch(
          `/api/study/exams/${encodeURIComponent(paper.examId)}/draft`,
          {
            method: "PUT",
            headers: {
              [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ answers: next }),
          },
        );
        setSaving(response.ok ? "saved" : "error");
      } catch (error) {
        setSaving(failureKind(error) === "offline" ? "offline" : "error");
      }
    },
    [paper.examId],
  );

  // A moment after the last change, the draft saves itself.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => void save(answers), 800);
    return () => clearTimeout(timer);
  }, [answers, save]);

  // Back online with unsaved answers: save them.
  useEffect(() => {
    if (saving !== "offline") return;
    const retry = () => void save(answers);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [saving, answers, save]);

  const set = (i: number, answer: ExamAnswer) =>
    setAnswers((was) => was.map((a, j) => (j === i ? answer : a)));

  async function submit() {
    setConfirming(false);
    setFailed(null);
    setSubmitting(true);
    try {
      const response = await apiFetch(
        `/api/study/exams/${encodeURIComponent(paper.examId)}/submit`,
        {
          method: "POST",
          headers: {
            [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ answers }),
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
      onGraded(examPaperResponseSchema.parse(await response.json()).paper);
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
      setSubmitting(false);
    }
  }

  const n = paper.questions.length;
  const open = answers.filter((a) => !answered(a)).length;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        {n} questions, {questionValue(n)} points each. Your answers save as you
        go
        {saving === "saving" && " · Saving…"}
        {saving === "saved" && " · Saved"}
        {saving === "offline" && " · Offline: they'll save when you're back"}
        {saving === "error" && " · Couldn't save; they're still here"}.
      </p>
      {paper.questions.map((q, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a paper's questions never change (S-19); position is their identity
        <QuestionCard key={i} n={i + 1} total={n} question={q}>
          <AnswerField
            n={i + 1}
            question={q}
            answer={answers[i] as ExamAnswer}
            onChange={(a) => set(i, a)}
            disabled={submitting}
          />
        </QuestionCard>
      ))}
      {failed?.kind === "error" && (
        <Banner tone="danger" title="Couldn't grade your answers.">
          {failed.message} Your answers are saved.
        </Banner>
      )}
      {failed?.kind === "offline" && (
        <Banner tone="offline" title="You're offline.">
          Submitting needs a connection. Your answers are saved here.
        </Banner>
      )}
      {submitting && (
        <p className="text-sm text-ink-muted" role="status">
          Grading your answers… This can take up to a minute.
        </p>
      )}
      <Button
        size="lg"
        loading={submitting}
        onClick={() => setConfirming(true)}
      >
        {submitting ? "Grading" : "Submit answers"}
      </Button>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Submit your answers?"
        actions={
          <>
            <Button
              variant="ghost"
              tone="neutral"
              onClick={() => setConfirming(false)}
            >
              Keep answering
            </Button>
            <Button onClick={submit}>Submit</Button>
          </>
        }
      >
        You can't change them after.
        {open > 0 &&
          ` ${open} ${open === 1 ? "question is" : "questions are"} not answered and will score 0.`}
      </Dialog>
    </div>
  );
}

function QuestionCard({
  n,
  total,
  question,
  children,
  earned,
}: {
  n: number;
  total: number;
  question: ExamQuestion;
  children: React.ReactNode;
  earned?: string;
}) {
  return (
    <section className="card flex flex-col gap-3" aria-labelledby={`q${n}`}>
      <h2 id={`q${n}`} className="kicker">
        Question {n} · {TYPE_NAME[question.type]} (
        {QUESTION_TYPE_LABEL[question.type]}) ·{" "}
        {earned ?? `${questionValue(total)} pt`}
      </h2>
      <Prose markdown={questionMarkdown(question)} />
      {children}
    </section>
  );
}

function AnswerField({
  n,
  question: q,
  answer,
  onChange,
  disabled,
}: {
  n: number;
  question: ExamQuestion;
  answer: ExamAnswer;
  onChange: (answer: ExamAnswer) => void;
  disabled: boolean;
}) {
  if ((q.type === "MC" || q.type === "CODE_MC") && answer.type === q.type)
    return (
      <RadioGroup<Letter>
        label="Your answer"
        name={`q${n}`}
        value={answer.choice}
        disabled={disabled}
        options={q.options.map((option, j) => ({
          value: LETTERS[j] as Letter,
          label:
            q.type === "CODE_MC" ? (
              <>
                {LETTERS[j]}) <code>{option}</code>
              </>
            ) : (
              `${LETTERS[j]}) ${option}`
            ),
        }))}
        onChange={(choice) => onChange({ type: q.type, choice })}
      />
    );
  if (q.type === "TF" && answer.type === "TF")
    return (
      <div className="flex flex-col gap-3">
        {q.statements.map((statement, j) => (
          <RadioGroup<"true" | "false">
            // biome-ignore lint/suspicious/noArrayIndexKey: a TF question's five statements are fixed
            key={j}
            label={`${ROMAN[j]}. ${statement}`}
            name={`q${n}-${j}`}
            inline
            disabled={disabled}
            value={
              answer.marks[j] === null
                ? null
                : answer.marks[j]
                  ? "true"
                  : "false"
            }
            options={[
              { value: "true", label: "True" },
              { value: "false", label: "False" },
            ]}
            onChange={(value) =>
              onChange({
                type: "TF",
                marks: answer.marks.map((m, k) =>
                  k === j ? value === "true" : m,
                ),
              })
            }
          />
        ))}
      </div>
    );
  if (q.type === "OPEN" && answer.type === "OPEN")
    return (
      <Textarea
        label="Your answer"
        rows={6}
        maxLength={4000}
        disabled={disabled}
        value={answer.text}
        onChange={(event) =>
          onChange({ type: "OPEN", text: event.target.value })
        }
      />
    );
  if (q.type === "CODE" && answer.type === "CODE")
    return (
      <div className="grid gap-3 tablet:grid-cols-2">
        {numberedBlanks(q.code).map((b, j) => (
          <Input
            key={b}
            label={`Blank (${b})`}
            className="mono"
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={answer.blanks[j] ?? ""}
            onChange={(event) =>
              onChange({
                type: "CODE",
                blanks: numberedBlanks(q.code).map((_, k) =>
                  k === j ? event.target.value : (answer.blanks[k] ?? ""),
                ),
              })
            }
          />
        ))}
      </div>
    );
  return null;
}

function Results({ paper }: { paper: ExamPaper }) {
  const result = paper.result;
  if (!result) return null;
  const n = paper.questions.length;
  return (
    <div className="flex flex-col gap-6">
      <section className="card flex flex-col gap-2" aria-label="Grade">
        <span className="kicker">Your grade</span>
        <p className="text-3xl font-semibold">
          <span className="mono">{formatGrade(result.grade)}</span> / 10
        </p>
        <p className="text-sm text-ink-muted">
          {result.grade >= 70
            ? `Verified: ${paper.skill} now counts as proven for every job that needs it.`
            : "Below 7.0: the topic is done, but the skill isn't verified yet. A retake is a new attempt."}
        </p>
      </section>
      {result.review && (
        <Banner tone="warning" title="Review suggestions">
          {result.review}
        </Banner>
      )}
      {result.questions.map((r) => {
        const q = paper.questions[r.number - 1] as ExamQuestion;
        return (
          <QuestionCard
            key={r.number}
            n={r.number}
            total={n}
            question={q}
            earned={`${r.points} pt`}
          >
            <ResultBody result={r} question={q} />
          </QuestionCard>
        );
      })}
    </div>
  );
}

function ResultBody({
  result: r,
  question: q,
}: {
  result: NonNullable<ExamPaper["result"]>["questions"][number];
  question: ExamQuestion;
}) {
  const verdict =
    r.accuracy === 100 ? (
      <Badge tone="done">Correct</Badge>
    ) : r.accuracy === 0 ? (
      <Badge tone="danger">Wrong</Badge>
    ) : (
      <Badge tone="doing">{r.accuracy}%</Badge>
    );
  const { answer, key } = r;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {verdict}
        {(key.type === "MC" || key.type === "CODE_MC") &&
          answer.type === key.type && (
            <span>
              Your answer <b className="mono">{answer.choice ?? "—"}</b> ·
              correct <b className="mono">{key.answer}</b>
            </span>
          )}
      </div>
      {key.type === "TF" && answer.type === "TF" && q.type === "TF" && (
        <table className="w-full">
          <thead>
            <tr className="text-ink-muted">
              <th className="text-left font-medium">Statement</th>
              <th className="font-medium">Yours</th>
              <th className="font-medium">Correct</th>
            </tr>
          </thead>
          <tbody>
            {q.statements.map((statement, i) => {
              const mark = answer.marks[i];
              return (
                <tr key={ROMAN[i]}>
                  <td className="py-1 pr-2">
                    {ROMAN[i]}. {statement}
                  </td>
                  <td className="mono text-center">
                    {mark === null || mark === undefined
                      ? "—"
                      : mark
                        ? "T"
                        : "F"}
                  </td>
                  <td className="mono text-center">
                    {key.answers[i] ? "T" : "F"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {"why" in key && <p>{key.why}</p>}
      {r.feedback && <p>{r.feedback}</p>}
      {r.missing && (
        <p>
          <b>What was missing:</b> {r.missing}
        </p>
      )}
      {key.type === "OPEN" && answer.type === "OPEN" && (
        <>
          <p>
            <b>Your answer:</b> {answer.text.trim() || "—"}
          </p>
          <p>
            <b>Model answer:</b> {key.modelAnswer}
          </p>
        </>
      )}
      {key.type === "CODE" && answer.type === "CODE" && q.type === "CODE" && (
        <>
          <p className="mono">
            Yours{" "}
            {answer.blanks
              .map((b, i) => `(${i + 1}) ${b.trim() || "—"}`)
              .join(", ")}
          </p>
          <Prose
            markdown={`**Reference solution**\n\n\`\`\`${q.language ?? ""}\n${key.solution}\n\`\`\``}
          />
        </>
      )}
    </div>
  );
}
