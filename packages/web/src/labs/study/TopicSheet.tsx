// A backlog topic's sheet (docs/prd/10-study-backlog.md § Screens): edit its
// level, priority, status and note, or remove it. The bundle draws no sheet
// for this, so it's composed from Sheet, Field + native select, Textarea,
// Dialog and Banner. Every write carries an Idempotency-Key.
import { IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import {
  type ExamInfo,
  examsResponseSchema,
  formatGrade,
  NOTE_MAX_LENGTH,
  type Priority,
  type TopicInfo,
  type TopicLevel,
  type TopicStatus,
} from "@projects-lab/shared/study";
import { type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Banner,
  Button,
  Dialog,
  Group,
  ListRow,
  linkClick,
  Select,
  Sheet,
  Textarea,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { failureKind } from "../../core/failure";
import { examTitle, localDay } from "./ExamViewer";

const LEVELS: [TopicLevel, string][] = [
  ["unset", "Not chosen"],
  ["fast_track", "Fast track"],
  ["essential", "Essential"],
  ["specialized", "Specialized"],
];
const PRIORITIES: [Priority, string][] = [
  [1, "P1 · next up"],
  [2, "P2 · soon"],
  [3, "P3 · later"],
];
const STATUSES: [TopicStatus, string][] = [
  ["not_started", "Not started"],
  ["in_progress", "In progress"],
  ["done", "Done"],
];

type Changes = Partial<
  Pick<TopicInfo, "level" | "priority" | "status" | "note">
>;
type Outcome = "saved" | "removed" | "gone";

/** What changed, so a save sends only that (PATCH). */
function changesOf(topic: TopicInfo, draft: Required<Changes>): Changes {
  const changes: Changes = {};
  if (draft.level !== topic.level) changes.level = draft.level;
  if (draft.priority !== topic.priority) changes.priority = draft.priority;
  if (draft.status !== topic.status) changes.status = draft.status;
  if (draft.note.trim() !== topic.note) changes.note = draft.note.trim();
  return changes;
}

/** The topic's exam attempts, newest first, each opening the exam (PRD 12). */
function Attempts({ topicId }: { topicId: string }) {
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamInfo[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/api/study/exams?topicId=${encodeURIComponent(topicId)}`, {
      signal: controller.signal,
    })
      .then(async (response) =>
        response.ok
          ? setExams(examsResponseSchema.parse(await response.json()).exams)
          : setExams([]),
      )
      .catch(() => {
        if (!controller.signal.aborted) setExams([]);
      });
    return () => controller.abort();
  }, [topicId]);
  if (!exams || exams.length === 0) return null;
  return (
    <Group title="Exams" count={exams.length}>
      {exams.map((exam) => {
        const href = `/study/exams/${exam.examId}`;
        return (
          <ListRow
            key={exam.examId}
            title={examTitle(exam)}
            meta={
              exam.grade === null || exam.gradedAt === null
                ? exam.source === "app"
                  ? "To answer"
                  : "Awaiting grade"
                : `Graded ${localDay(exam.gradedAt)}`
            }
            value={exam.grade === null ? undefined : formatGrade(exam.grade)}
            href={href}
            onClick={linkClick(href, navigate)}
          />
        );
      })}
    </Group>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mono">{children}</dd>
    </div>
  );
}

function TopicForm({
  topic,
  onDone,
}: {
  topic: TopicInfo;
  onDone: (outcome: Outcome) => void;
}) {
  const [draft, setDraft] = useState<Required<Changes>>({
    level: topic.level,
    priority: topic.priority,
    status: topic.status,
    note: topic.note,
  });
  const [busy, setBusy] = useState<"saving" | "removing" | null>(null);
  const [failed, setFailed] = useState<"error" | "offline" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const changes = changesOf(topic, draft);
  const noteTooLong = draft.note.trim().length > NOTE_MAX_LENGTH;
  const canSave = Object.keys(changes).length > 0 && !noteTooLong && !busy;

  async function write(method: "PATCH" | "DELETE"): Promise<void> {
    setBusy(method === "PATCH" ? "saving" : "removing");
    setFailed(null);
    try {
      const response = await apiFetch(`/api/study/topics/${topic.id}`, {
        method,
        headers: {
          [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
          ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "PATCH" ? { body: JSON.stringify(changes) } : {}),
      });
      if (response.ok) return onDone(method === "PATCH" ? "saved" : "removed");
      if (response.status === 404) return onDone("gone");
      setFailed("error");
    } catch (error) {
      setFailed(failureKind(error));
    } finally {
      setBusy(null);
      setConfirming(false);
    }
  }

  const set = <K extends keyof Changes>(key: K, value: Required<Changes>[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      <div className="flex flex-col gap-4">
        {failed === "error" && (
          <Banner tone="danger" title="Couldn't save.">
            Your changes are still here. Try again in a moment.
          </Banner>
        )}
        {failed === "offline" && (
          <Banner tone="offline" title="You're offline.">
            Your changes are still here. Save once you're back online.
          </Banner>
        )}
        <Attempts topicId={topic.id} />
        <dl className="grid grid-cols-3 gap-3">
          <Fact label="Started">{topic.startedOn ?? "—"}</Fact>
          <Fact label="Finished">{topic.finishedOn ?? "—"}</Fact>
          <Fact label="Grade">
            {topic.grade === null ? "—" : formatGrade(topic.grade)}
          </Fact>
        </dl>
        <Select
          label="Level"
          value={draft.level}
          options={LEVELS}
          onChange={(v) => set("level", v)}
        />
        <Select
          label="Priority"
          value={draft.priority}
          options={PRIORITIES}
          onChange={(v) => set("priority", v)}
        />
        <Select
          label="Status"
          value={draft.status}
          options={STATUSES}
          onChange={(v) => set("status", v)}
        />
        <Textarea
          label="Note"
          optional
          rows={2}
          value={draft.note}
          onChange={(event) => set("note", event.target.value)}
          hint={`${draft.note.trim().length}/${NOTE_MAX_LENGTH}`}
          error={
            noteTooLong
              ? `At most ${NOTE_MAX_LENGTH} characters: one short line.`
              : undefined
          }
        />
        <div className="flex gap-3">
          <Button
            variant="soft"
            tone="danger"
            icon="trash"
            disabled={busy !== null}
            onClick={() => setConfirming(true)}
          >
            Remove
          </Button>
          <div className="flex-1" />
          <Button
            loading={busy === "saving"}
            disabled={!canSave}
            onClick={() => write("PATCH")}
          >
            {busy === "saving" ? "Saving" : "Save"}
          </Button>
        </div>
      </div>
      <Dialog
        open={confirming}
        onClose={() => busy === null && setConfirming(false)}
        tone="danger"
        icon="trash"
        title={`Remove ${topic.id} from the backlog?`}
        stretchActions
        actions={
          <>
            <Button
              variant="outline"
              tone="neutral"
              disabled={busy !== null}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
            <Button
              tone="danger"
              loading={busy === "removing"}
              onClick={() => write("DELETE")}
            >
              {busy === "removing" ? "Removing" : "Remove"}
            </Button>
          </>
        }
      >
        Its ID stays reserved: adding {topic.skill} again restores it.
      </Dialog>
    </>
  );
}

export interface TopicSheetProps {
  /** The topic shown; kept while the sheet animates closed. */
  topic: TopicInfo | null;
  open: boolean;
  onClose: () => void;
  /** After a write: the parent toasts, closes and reads the backlog again. */
  onDone: (topic: TopicInfo, outcome: Outcome) => void;
}

/** Tap a backlog row: its facts, its fields, Save and Remove. */
export function TopicSheet({ topic, open, onClose, onDone }: TopicSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={topic ? `${topic.id} · ${topic.skill}` : ""}
    >
      {topic && (
        // A new key per topic: the form starts from that topic's values.
        <TopicForm
          key={topic.id}
          topic={topic}
          onDone={(outcome) => onDone(topic, outcome)}
        />
      )}
    </Sheet>
  );
}
