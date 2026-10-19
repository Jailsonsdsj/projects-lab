// Courses (`/study/courses`, docs/prd/11-study-courses.md § Reading): every
// recorded course, grouped by area; In progress topics first in each area,
// then the newest. Each row opens the reader.
import {
  type AreaInfo,
  backlogResponseSchema,
  type CourseInfo,
  coursesResponseSchema,
  type TopicInfo,
} from "@projects-lab/shared/study";
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
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";

const LEVEL: Record<CourseInfo["level"], string> = {
  fast_track: "Fast track",
  essential: "Essential",
  specialized: "Specialized",
};

interface Row {
  course: CourseInfo;
  topic: TopicInfo;
}
interface Loaded {
  areas: AreaInfo[];
  rows: Row[];
}

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await apiFetch(path, { signal });
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}

async function loadCourses(signal: AbortSignal): Promise<Loaded | null> {
  const [courses, backlog] = await Promise.all([
    getJson("/api/study/courses", signal).then((b) =>
      coursesResponseSchema.parse(b),
    ),
    getJson("/api/study/backlog", signal).then((b) =>
      backlogResponseSchema.parse(b),
    ),
  ]);
  const topics = new Map(backlog.topics.map((t) => [t.id, t]));
  const rows = courses.courses.flatMap((course) => {
    const topic = topics.get(course.topicId);
    return topic ? [{ course, topic }] : [];
  });
  return rows.length > 0 ? { areas: backlog.areas, rows } : null;
}

/** In progress first, then the newest recorded (the API sends newest first). */
const inProgressFirst = (a: Row, b: Row) =>
  Number(b.topic.status === "in_progress") -
  Number(a.topic.status === "in_progress");

const recorded = (iso: string) => `Recorded ${iso.slice(0, 10)}`;

function Courses({ areas, rows }: Loaded) {
  const navigate = useNavigate();
  const topicsInProgress = new Set(
    rows.filter((r) => r.topic.status === "in_progress").map((r) => r.topic.id),
  ).size;
  return (
    <>
      <PageTitle
        title="Courses"
        subtitle={`${rows.length} ${rows.length === 1 ? "course" : "courses"} · ${topicsInProgress} in progress`}
      />
      <div className="flex flex-col gap-3 px-4 pb-6 tablet:gap-4">
        {areas.map((area) => {
          const inArea = rows
            .filter((r) => r.topic.area === area.prefix)
            .sort(inProgressFirst);
          if (inArea.length === 0) return null;
          return (
            <Group key={area.prefix} title={area.name} count={inArea.length}>
              {inArea.map(({ course, topic }) => {
                const href = `/study/courses/${course.courseId}`;
                return (
                  <ListRow
                    key={course.courseId}
                    id={topic.id}
                    title={topic.skill}
                    href={href}
                    onClick={linkClick(href, navigate)}
                    meta={[
                      LEVEL[course.level],
                      course.level === "specialized"
                        ? `Module ${course.module}`
                        : null,
                      recorded(course.recordedAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    tags={
                      topic.status === "in_progress" ? (
                        <Badge size="sm" tone="doing">
                          In progress
                        </Badge>
                      ) : undefined
                    }
                  />
                );
              })}
            </Group>
          );
        })}
      </div>
    </>
  );
}

/** Courses, Study's second tab. */
export function CoursesScreen() {
  return (
    <ReadView
      load={loadCourses}
      skeleton={
        <section aria-busy="true" aria-label="Loading the courses">
          <PageTitle title="Courses" />
          <div className="flex flex-col gap-3 px-4">
            <Skeleton shape="text" width="20%" />
            <Skeleton shape="block" />
          </div>
        </section>
      }
      empty={
        <>
          <PageTitle title="Courses" />
          <div className="px-4 pb-6">
            <div className="group">
              <EmptyState icon="book" title="No courses yet">
                Start one in Claude Code with <code>/learn &lt;topic&gt;</code>.
              </EmptyState>
            </div>
          </div>
        </>
      }
    >
      {(loaded) => <Courses {...loaded} />}
    </ReadView>
  );
}
