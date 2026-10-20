// The Documents tab (docs/prd/22-career-documents.md § The Documents tab):
// documents aren't stored (R3-1), so this is each job's application kit, what
// its last document was made from, and a prompt to ask Claude for one on any
// surface. The bundle draws no screen for it: CopyFields and Groups.
import {
  CURRENCIES,
  FORM_ANSWER_MAX_LENGTH,
  formatSalaryRange,
  INTRO_MAX_LENGTH,
  type JobKit,
  type JobSummary,
  PAY_PERIODS,
  QUESTION_MAX_LENGTH,
} from "@projects-lab/shared/career";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import {
  Button,
  CopyField,
  EmptyState,
  Group,
  Input,
  ListRow,
  PageTitle,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "../../components/ui";
import { ReadView } from "../../core/ReadView";
import { fetchJobs, fetchKit } from "./data";
import { FormSheet, send } from "./FormSheet";

type Data = { jobs: JobSummary[]; kits: Record<string, JobKit> };

async function load(signal: AbortSignal): Promise<Data | null> {
  const jobs = await fetchJobs(signal);
  if (jobs.length === 0) return null;
  const kits = await Promise.all(jobs.map((job) => fetchKit(job.id, signal)));
  return { jobs, kits: Object.fromEntries(kits.map((k) => [k.jobId, k])) };
}

/** What to paste into any Claude surface: the brief is the only input. */
export const documentPrompt = (
  kind: "resume" | "cover letter",
  job: JobSummary,
) =>
  `Write my ${kind} for ${job.role} at ${job.company}: call career_document_brief with jobId ${job.id} and kind ${kind === "resume" ? "resume" : "cover_letter"}, ask me about anything in askFirst, follow its rules and layout, and give me the file. Then save what you used with career_save_selection.`;

const KIND_LABEL: Record<string, string> = {
  fact: "Fact",
  experience: "Experience",
  education: "Education",
  skill: "Skill",
};

type AnswerDraft = { question: string; answer: string };

function KitSheet({
  job,
  kit,
  open,
  onClose,
  onDone,
}: {
  job: JobSummary;
  kit: JobKit;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [intro, setIntro] = useState(kit.intro);
  const [min, setMin] = useState(kit.salary ? String(kit.salary.min) : "");
  const [max, setMax] = useState(kit.salary ? String(kit.salary.max) : "");
  const [currency, setCurrency] = useState<string>(
    kit.salary?.currency ?? "USD",
  );
  const [period, setPeriod] = useState<string>(kit.salary?.period ?? "hour");
  const [answers, setAnswers] = useState<AnswerDraft[]>(kit.answers);
  const [tried, setTried] = useState(false);

  const whole = (text: string) => /^\d+$/.test(text.trim());
  const noSalary = min.trim() === "" && max.trim() === "";
  const salaryError = noSalary
    ? undefined
    : !whole(min) || !whole(max)
      ? "Whole amounts for both, or leave both empty."
      : Number(min) > Number(max)
        ? "The minimum is above the maximum."
        : undefined;
  const answersOk = answers.every((a) => a.question.trim() && a.answer.trim());
  const update = (i: number, change: Partial<AnswerDraft>) =>
    setAnswers(answers.map((a, j) => (j === i ? { ...a, ...change } : a)));

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      onDone={onDone}
      title={`Kit for ${job.company}`}
      onSave={() => {
        setTried(true);
        if (salaryError || !answersOk) return null;
        return send("PUT", `/api/career/jobs/${job.id}/kit`, {
          intro,
          salary: noSalary
            ? null
            : { min: Number(min), max: Number(max), currency, period },
          answers: answers.map((a) => ({
            question: a.question.trim(),
            answer: a.answer.trim(),
          })),
        });
      }}
    >
      <Textarea
        label="Tell me about yourself"
        optional
        value={intro}
        maxLength={INTRO_MAX_LENGTH}
        hint={`What you'd say for this role. ${intro.length} of ${INTRO_MAX_LENGTH}.`}
        onChange={(e) => setIntro(e.target.value)}
      />
      <fieldset
        className="flex flex-col gap-3 border-0 p-0"
        aria-label="Salary range"
      >
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Minimum"
            optional
            inputMode="numeric"
            value={min}
            error={tried ? salaryError : undefined}
            onChange={(e) => setMin(e.target.value)}
          />
          <Input
            label="Maximum"
            optional
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
          <Select
            label="Currency"
            value={currency}
            options={CURRENCIES.map((c) => [c, c])}
            onChange={setCurrency}
          />
          <Select
            label="Per"
            value={period}
            options={PAY_PERIODS.map((p) => [p, p])}
            onChange={setPeriod}
          />
        </div>
      </fieldset>
      {answers.map((a, i) => (
        <fieldset
          // biome-ignore lint/suspicious/noArrayIndexKey: drafts are edited in place, never reordered
          key={i}
          className="flex flex-col gap-3 border-0 p-0"
          aria-label={`Form answer ${i + 1}`}
        >
          <Input
            label="Question"
            value={a.question}
            maxLength={QUESTION_MAX_LENGTH}
            error={
              tried && !a.question.trim() ? "The form's question." : undefined
            }
            onChange={(e) => update(i, { question: e.target.value })}
          />
          <Textarea
            label="Answer"
            value={a.answer}
            maxLength={FORM_ANSWER_MAX_LENGTH}
            error={tried && !a.answer.trim() ? "Your answer." : undefined}
            onChange={(e) => update(i, { answer: e.target.value })}
          />
          <Button
            variant="ghost"
            tone="danger"
            size="sm"
            icon="trash"
            onClick={() => setAnswers(answers.filter((_, j) => j !== i))}
          >
            Remove this answer
          </Button>
        </fieldset>
      ))}
      <Button
        variant="outline"
        tone="neutral"
        icon="plus"
        onClick={() => setAnswers([...answers, { question: "", answer: "" }])}
      >
        Add a form answer
      </Button>
    </FormSheet>
  );
}

function Kit({
  job,
  kit,
  onEdit,
}: {
  job: JobSummary;
  kit: JobKit;
  onEdit: () => void;
}) {
  const toast = useToast();
  const failed = () =>
    toast.show({
      tone: "danger",
      message: "Couldn't copy: select the text instead.",
    });
  return (
    <div className="flex flex-col gap-4 tablet:gap-5">
      <section
        aria-label="Ask Claude for a document"
        className="flex flex-col gap-3"
      >
        <div className="group__title">
          <span className="kicker">Ask Claude for a document</span>
        </div>
        <CopyField
          long
          label="Resume prompt"
          value={documentPrompt("resume", job)}
          onCopyFailed={failed}
        />
        <CopyField
          long
          label="Cover letter prompt"
          value={documentPrompt("cover letter", job)}
          onCopyFailed={failed}
        />
      </section>
      <section aria-label="Application kit" className="flex flex-col gap-2">
        <div className="group__title items-center">
          <span className="kicker">Application kit</span>
          <Button size="sm" variant="soft" icon="pencil" onClick={onEdit}>
            Edit kit
          </Button>
        </div>
        <div className="group">
          <ListRow
            title="Tell me about yourself"
            meta={kit.intro || "Not written yet"}
          />
          <ListRow
            title="Salary range"
            meta={kit.salary ? formatSalaryRange(kit.salary) : "Not set"}
          />
          {kit.answers.map((a) => (
            <ListRow key={a.question} title={a.question} meta={a.answer} />
          ))}
          {kit.answers.length === 0 && (
            <ListRow title="Form answers" meta="None yet" />
          )}
        </div>
      </section>
      <Group
        title={
          kit.selection
            ? `Last document used · ${kit.selection.variant}`
            : "Last document used"
        }
        count={kit.selection?.items.length}
      >
        {kit.selection ? (
          kit.selection.items.map((item) => (
            <ListRow
              key={`${item.kind}:${item.id}`}
              title={item.label ?? "Removed from the profile"}
              meta={KIND_LABEL[item.kind] ?? item.kind}
            />
          ))
        ) : (
          <ListRow
            title="No document made for this job yet"
            meta="Ask Claude with a prompt above; it saves what it used."
          />
        )}
      </Group>
    </div>
  );
}

function Documents({
  data,
  onChanged,
}: {
  data: Data;
  onChanged: (message: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const asked = params.get("job");
  const job =
    data.jobs.find((j) => j.id === asked) ?? (data.jobs[0] as JobSummary);
  const kit = data.kits[job.id] as JobKit;
  const [editing, setEditing] = useState(0);
  return (
    <div className="flex flex-col gap-4 px-4 pb-6 tablet:gap-5">
      <div className="tablet:max-w-(--size-form)">
        <Select
          label="Job"
          value={job.id}
          options={data.jobs.map((j) => [j.id, `${j.company} · ${j.role}`])}
          onChange={(id) => setParams({ job: id }, { replace: true })}
        />
      </div>
      <Kit job={job} kit={kit} onEdit={() => setEditing((n) => n + 1)} />
      {editing > 0 && (
        <KitSheet
          key={`${job.id}-${editing}`}
          job={job}
          kit={kit}
          open={editing > 0}
          onClose={() => setEditing(0)}
          onDone={(message) => {
            setEditing(0);
            onChanged(message);
          }}
        />
      )}
    </div>
  );
}

export function DocumentsScreen() {
  const toast = useToast();
  const [refresh, setRefresh] = useState(0);
  const read = useCallback(load, []);
  return (
    <>
      <PageTitle
        title="Documents"
        subtitle="Made by Claude from your profile, never stored here"
      />
      <ReadView
        load={read}
        refresh={refresh}
        skeleton={
          <div className="flex flex-col gap-3 px-4">
            <Skeleton shape="block" />
            <Skeleton shape="block" />
          </div>
        }
        empty={
          <EmptyState icon="file" title="No jobs to write for yet">
            Documents are written for a job. Track one first: paste a posting to
            Claude and ask it to map it.
          </EmptyState>
        }
      >
        {(data) => (
          <Documents
            data={data}
            onChanged={(message) => {
              toast.show({ tone: "success", message });
              setRefresh((n) => n + 1);
            }}
          />
        )}
      </ReadView>
    </>
  );
}
