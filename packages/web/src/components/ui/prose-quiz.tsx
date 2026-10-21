// Quick-check questions (prose-remark.ts turns them into <x-quiz>). With the
// lesson's answers, each one checks itself as soon as it's answered: the right
// option green, a wrong pick red, then the key's explanation. Without answers
// they still take a selection, unchecked. Nothing is saved.
import {
  createContext,
  type ReactNode,
  useContext,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Textarea } from "./Textarea";

/** One quick-check question's entry in the answer key. */
export interface QuickCheckAnswer {
  /** Multiple choice: the right letter. */
  choice?: string;
  /** True/false: each statement's numeral ("I", "II"…) and whether it's true. */
  truths?: Record<string, boolean>;
  /** Markdown: why, or the model answer. */
  explanation: string;
}

/** The page's answers by question number, and how Prose renders an explanation. */
export const QuickCheckContext = createContext<{
  answers?: Record<number, QuickCheckAnswer>;
  render: (markdown: string) => ReactNode;
}>({ render: () => null });

interface ChoiceState {
  name: string;
  stemId: string;
  selected: string | null;
  /** The right letter, once an answer is chosen and the key has one. */
  revealed: string | null;
  select: (letter: string) => void;
}
const ChoiceContext = createContext<ChoiceState | null>(null);

interface StatementState {
  name: string;
  marks: Record<string, boolean>;
  truths?: Record<string, boolean>;
  mark: (numeral: string, value: boolean) => void;
}
const StatementContext = createContext<StatementState | null>(null);

const StemContext = createContext<string | undefined>(undefined);

type Verdict = "correct" | "wrong";

function Explanation({
  verdict,
  label,
  markdown,
}: {
  verdict?: Verdict;
  label?: string;
  markdown: string;
}) {
  const { render } = useContext(QuickCheckContext);
  if (!markdown && !label) return null;
  return (
    <div className={cx("quiz__answer", verdict && `is-${verdict}`)}>
      {label && <span className="kicker">{label}</span>}
      {markdown && render(markdown)}
    </div>
  );
}

/** A quick-check question, by kind. */
export function Quiz({
  kind = "choice",
  n,
  children,
}: {
  kind?: "choice" | "truefalse" | "open";
  n?: string;
  children?: ReactNode;
}) {
  const { answers } = useContext(QuickCheckContext);
  const answer = n ? answers?.[Number(n)] : undefined;
  if (kind === "truefalse")
    return <TrueFalse answer={answer}>{children}</TrueFalse>;
  if (kind === "open") return <Open answer={answer}>{children}</Open>;
  return <Choice answer={answer}>{children}</Choice>;
}

function Choice({
  answer,
  children,
}: {
  answer?: QuickCheckAnswer;
  children?: ReactNode;
}) {
  const id = useId();
  const stemId = `${id}-q`;
  const ref = useRef<HTMLElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const right = answer?.choice ?? null;
  const revealed = selected && right ? right : null;
  const verdict: Verdict | undefined = revealed
    ? selected === right
      ? "correct"
      : "wrong"
    : undefined;
  const select = (letter: string) => {
    if (!revealed) setSelected(letter);
  };
  const retry = () => {
    setSelected(null);
    ref.current?.querySelector("input")?.focus();
  };

  return (
    <StemContext.Provider value={stemId}>
      <ChoiceContext.Provider
        value={{ name: id, stemId, selected, revealed, select }}
      >
        <section className="quiz" aria-labelledby={stemId} ref={ref}>
          <span className="kicker">Quick check</span>
          {children}
          {answer && (
            <div className="quiz__foot">
              <p
                className={cx("quiz__feedback", verdict && `is-${verdict}`)}
                role="status"
              >
                {verdict === "correct" && "Correct."}
                {verdict === "wrong" && `Not quite: the answer is ${right}.`}
              </p>
              {verdict && (
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  icon="refresh"
                  onClick={retry}
                >
                  Try again
                </Button>
              )}
            </div>
          )}
          {answer && selected && (
            <Explanation verdict={verdict} markdown={answer.explanation} />
          )}
        </section>
      </ChoiceContext.Provider>
    </StemContext.Provider>
  );
}

export function QuizStem({ children }: { children?: ReactNode }) {
  const stemId = useContext(StemContext);
  return (
    <p className="quiz__q" id={stemId}>
      {children}
    </p>
  );
}

export function QuizOptions({ children }: { children?: ReactNode }) {
  const quiz = useContext(ChoiceContext);
  return (
    <div
      className="quiz__opts"
      role="radiogroup"
      aria-labelledby={quiz?.stemId}
    >
      {children}
    </div>
  );
}

export function QuizOption({
  letter,
  children,
}: {
  letter: string;
  children?: ReactNode;
}) {
  const quiz = useContext(ChoiceContext);
  const checked = quiz?.selected === letter;
  const right = quiz?.revealed === letter;
  const wrong = Boolean(quiz?.revealed) && checked && !right;
  return (
    <label
      className={cx(
        "quiz__opt",
        quiz?.revealed ? "is-disabled" : checked && "is-selected",
        right && "is-correct",
        wrong && "is-wrong",
      )}
    >
      <input
        type="radio"
        name={quiz?.name}
        checked={checked}
        onChange={() => quiz?.select(letter)}
      />
      <span className="quiz__letter">{letter}</span>
      <span>{children}</span>
      {right && <Icon name="check" label="Right answer" />}
      {wrong && <Icon name="close" label="Your answer" />}
    </label>
  );
}

function TrueFalse({
  answer,
  children,
}: {
  answer?: QuickCheckAnswer;
  children?: ReactNode;
}) {
  const id = useId();
  const stemId = `${id}-q`;
  const ref = useRef<HTMLElement>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [last, setLast] = useState<string | null>(null);
  const truths = answer?.truths;
  const numerals = truths ? Object.keys(truths) : [];
  const done =
    numerals.length > 0 && numerals.every((k) => marks[k] !== undefined);
  const score = numerals.filter((k) => marks[k] === truths?.[k]).length;
  const mark = (numeral: string, value: boolean) => {
    // A checked statement stays as answered until Try again.
    if (truths?.[numeral] !== undefined && marks[numeral] !== undefined) return;
    setMarks((m) => ({ ...m, [numeral]: value }));
    setLast(numeral);
  };
  const retry = () => {
    setMarks({});
    setLast(null);
    ref.current?.querySelector("input")?.focus();
  };

  let status = "";
  if (done) status = `${score} of ${numerals.length} right.`;
  else if (last && truths?.[last] !== undefined)
    status =
      marks[last] === truths[last]
        ? `${last}: correct.`
        : `${last}: wrong, it's ${truths[last] ? "true" : "false"}.`;

  return (
    <StemContext.Provider value={stemId}>
      <StatementContext.Provider value={{ name: id, marks, truths, mark }}>
        <section className="quiz" aria-labelledby={stemId} ref={ref}>
          <span className="kicker">Quick check</span>
          {children}
          {truths && (
            <div className="quiz__foot">
              <p
                className={cx(
                  "quiz__feedback",
                  done &&
                    (score === numerals.length ? "is-correct" : "is-wrong"),
                )}
                role="status"
              >
                {status}
              </p>
              {Object.keys(marks).length > 0 && (
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  icon="refresh"
                  onClick={retry}
                >
                  Try again
                </Button>
              )}
            </div>
          )}
          {answer && done && <Explanation markdown={answer.explanation} />}
        </section>
      </StatementContext.Provider>
    </StemContext.Provider>
  );
}

export function QuizStatements({ children }: { children?: ReactNode }) {
  return <div className="quiz__stmts">{children}</div>;
}

export function QuizStatement({
  numeral,
  children,
}: {
  numeral: string;
  children?: ReactNode;
}) {
  const quiz = useContext(StatementContext);
  const textId = useId();
  const marked = quiz?.marks[numeral];
  const truth = quiz?.truths?.[numeral];
  const checked = marked !== undefined && truth !== undefined;
  const right = checked && marked === truth;
  return (
    <div
      className={cx(
        "quiz__stmt",
        checked && (right ? "is-correct" : "is-wrong"),
      )}
      role="radiogroup"
      aria-labelledby={textId}
    >
      <span className="quiz__letter">{numeral}</span>
      <span id={textId}>{children}</span>
      <span className="quiz__tf">
        {[true, false].map((value) => (
          <label
            key={String(value)}
            className={cx(
              "quiz__tfopt",
              marked === value && "is-selected",
              checked && "is-disabled",
            )}
          >
            <input
              type="radio"
              name={`${quiz?.name}-${numeral}`}
              checked={marked === value}
              onChange={() => quiz?.mark(numeral, value)}
            />
            {value ? "True" : "False"}
          </label>
        ))}
        {checked && (
          <span className="quiz__verdict">
            <Icon name={right ? "check" : "close"} />
            {right ? "Correct" : `It's ${truth ? "true" : "false"}`}
          </span>
        )}
      </span>
    </div>
  );
}

function Open({
  answer,
  children,
}: {
  answer?: QuickCheckAnswer;
  children?: ReactNode;
}) {
  const id = useId();
  const stemId = `${id}-q`;
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | undefined>();

  return (
    <StemContext.Provider value={stemId}>
      <section className="quiz" aria-labelledby={stemId}>
        <span className="kicker">Quick check</span>
        {children}
        {answer && (
          <>
            <Textarea
              label="Your answer"
              optional
              hint="Not saved: for thinking it through."
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            {shown && (
              <Explanation
                verdict={verdict}
                label="Model answer"
                markdown={answer.explanation}
              />
            )}
            <div className="quiz__foot">
              <p
                className={cx("quiz__feedback", verdict && `is-${verdict}`)}
                role="status"
              >
                {shown && !verdict && "Did you get it?"}
                {verdict === "correct" && "Got it."}
                {verdict === "wrong" && "Missed it: worth another read."}
              </p>
              {!shown ? (
                <Button
                  variant="soft"
                  size="sm"
                  icon="eye"
                  onClick={() => setShown(true)}
                >
                  Show model answer
                </Button>
              ) : !verdict ? (
                <span className="flex gap-2">
                  <Button
                    variant="soft"
                    tone="neutral"
                    size="sm"
                    icon="check"
                    onClick={() => setVerdict("correct")}
                  >
                    Got it
                  </Button>
                  <Button
                    variant="soft"
                    tone="neutral"
                    size="sm"
                    icon="close"
                    onClick={() => setVerdict("wrong")}
                  >
                    Missed it
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  tone="neutral"
                  size="sm"
                  icon="refresh"
                  onClick={() => {
                    setShown(false);
                    setVerdict(undefined);
                  }}
                >
                  Try again
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </StemContext.Provider>
  );
}
