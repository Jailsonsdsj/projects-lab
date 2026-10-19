// Grades (`/study/grades`, docs/prd/12-study-exams.md § Screens), from the
// bundle's "Study Lab · Grades" screen: the average and courses done, then
// graded exams grouped Passed and To review, newest first, each opening the
// exam viewer. Verified marks the exam that makes the skill verified now.
import {
  type AreaInfo,
  backlogResponseSchema,
  type ExamInfo,
  examsResponseSchema,
  formatGrade,
  isVerified,
  summarize,
  type TopicInfo,
  VERIFIED_MIN_GRADE,
} from "@projects-lab/shared/study";
import { useNavigate } from "react-router";
import {
  Badge,
  EmptyState,
  Group,
  ListRow,
  linkClick,
  PageTitle,
  ProgressBar,
  Skeleton,
  StatCard,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";
import { examTitle, localDay } from "./ExamViewer";

type Graded = ExamInfo & { grade: number; gradedAt: string };
interface Loaded {
  areas: AreaInfo[];
  topics: TopicInfo[];
  graded: Graded[];
}

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await apiFetch(path, { signal });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}

async function loadGrades(signal: AbortSignal): Promise<Loaded | null> {
  const [exams, backlog] = await Promise.all([
    getJson("/api/study/exams", signal).then((b) =>
      examsResponseSchema.parse(b),
    ),
    getJson("/api/study/backlog", signal).then((b) =>
      backlogResponseSchema.parse(b),
    ),
  ]);
  const graded = exams.exams
    .filter((e): e is Graded => e.grade !== null && e.gradedAt !== null)
    .sort((a, b) => Date.parse(b.gradedAt) - Date.parse(a.gradedAt));
  return graded.length > 0
    ? { areas: backlog.areas, topics: backlog.topics, graded }
    : null;
}

/** The exam that makes its topic verified now: the topic's most recently
 *  graded one, on a Done topic, passed (as Career sees it). */
function verifying(graded: Graded[], topics: TopicInfo[]): Set<string> {
  const byTopic = new Map(topics.map((t) => [t.id, t]));
  const latest = new Map<string, Graded>();
  for (const exam of graded)
    if (!latest.has(exam.topicId)) latest.set(exam.topicId, exam);
  const ids = new Set<string>();
  for (const [topicId, exam] of latest) {
    const topic = byTopic.get(topicId);
    if (topic && isVerified({ status: topic.status, grade: exam.grade }))
      ids.add(exam.examId);
  }
  return ids;
}

function Grades({ areas, topics, graded }: Loaded) {
  const navigate = useNavigate();
  const { total } = summarize(
    areas.map((a) => ({ id: a.prefix, position: a.position })),
    topics.map((t) => ({ ...t, code: t.id, areaId: t.area })),
  );
  const skillOf = new Map(topics.map((t) => [t.id, t.skill]));
  const verified = verifying(graded, topics);
  const passed = graded.filter((e) => e.grade >= VERIFIED_MIN_GRADE);
  const toReview = graded.filter((e) => e.grade < VERIFIED_MIN_GRADE);

  const row = (exam: Graded) => {
    const href = `/study/exams/${exam.examId}`;
    return (
      <ListRow
        key={exam.examId}
        id={exam.topicId}
        title={skillOf.get(exam.topicId) ?? exam.topicId}
        meta={
          <>
            {examTitle(exam)} · {/* A date never breaks at its hyphens. */}
            <span className="whitespace-nowrap">{localDay(exam.gradedAt)}</span>
          </>
        }
        tags={
          verified.has(exam.examId) ? (
            <Badge size="sm" tone="verified">
              Verified
            </Badge>
          ) : undefined
        }
        value={formatGrade(exam.grade)}
        href={href}
        onClick={linkClick(href, navigate)}
      />
    );
  };

  return (
    <>
      <PageTitle title="Grades" subtitle="Final exams you've taken" />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Average grade"
            value={total.average === null ? "—" : formatGrade(total.average)}
            unit={total.average === null ? undefined : "/ 10"}
          />
          <StatCard
            label="Courses done"
            value={total.done}
            unit={`of ${topics.length}`}
          >
            <ProgressBar
              value={total.done}
              max={Math.max(topics.length, 1)}
              label="Courses done"
              size="sm"
            />
          </StatCard>
        </div>
        {passed.length > 0 && (
          <Group title="Passed" count={passed.length}>
            {passed.map(row)}
          </Group>
        )}
        {toReview.length > 0 && (
          <Group title="To review" count={toReview.length}>
            {toReview.map(row)}
          </Group>
        )}
        <p className="text-sm text-ink-muted">
          A passed exam marks the skill Verified in Career Lab.
        </p>
      </div>
    </>
  );
}

/** Grades, Study's third tab. */
export function GradesScreen() {
  return (
    <ReadView
      load={loadGrades}
      skeleton={
        <section aria-busy="true" aria-label="Loading the grades">
          <PageTitle title="Grades" />
          <div className="flex flex-col gap-3 px-4">
            <Skeleton shape="block" />
            <Skeleton shape="block" />
          </div>
        </section>
      }
      empty={
        <>
          <PageTitle title="Grades" subtitle="Final exams you've taken" />
          <div className="px-4 pb-6">
            <div className="group">
              <EmptyState icon="award" title="No grades yet">
                Take a final exam in Claude Code with <code>/final-exam</code>.
              </EmptyState>
            </div>
          </div>
        </>
      }
    >
      {(loaded) => <Grades {...loaded} />}
    </ReadView>
  );
}
