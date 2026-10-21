// The course reader (docs/prd/11-study-courses.md § Reading), from the bundle's
// "Course reader" phone and tablet screens: one page at a time (overview, each
// lesson, wrap-up), kept in the URL as ?p=. The outline is a Sheet on phone and
// pinned beside the text on tablet. Content comes by blob SHA, immutable, so
// the service worker keeps a course once opened.
import {
  type CourseRead,
  courseReadResponseSchema,
} from "@projects-lab/shared/study";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  Badge,
  Button,
  cx,
  ErrorState,
  PageHeader,
  ProgressBar,
  Prose,
  Sheet,
  Skeleton,
  useMinWidth,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";
import { type Course, type CoursePage, splitCourse } from "./course";

const COURSES_PATH = "/study/courses";
const LEVEL: Record<CourseRead["level"], string> = {
  fast_track: "Fast track",
  essential: "Essential",
  specialized: "Specialized",
};

interface Loaded {
  course: CourseRead;
  parsed: Course;
}
/** The course is recorded but its file left study-materials (PRD 11). */
interface Missing {
  missing: string;
}

/** `_img/x.png` or `./_img/x.png` → the content proxy by the file's SHA; any
 *  other relative path, or an image the folder lacks, has nowhere to load from. */
function imageResolver(images: CourseRead["images"]) {
  return (src: string): string | null => {
    const name = /^(?:\.\/)?_img\/([^/]+)$/.exec(src)?.[1];
    const sha = name ? images[decodeURIComponent(name)] : undefined;
    return name && sha
      ? `/api/study/content/${sha}/${encodeURIComponent(decodeURIComponent(name))}`
      : null;
  };
}

/** A lesson's answers, shown only when asked for (PRD 11): never in the page before. */
function AnswerKey({ n, markdown }: { n: number; markdown: string }) {
  const [shown, setShown] = useState(false);
  return (
    <section className="reader__answers" aria-label={`Answer key, lesson ${n}`}>
      <Button
        variant="soft"
        tone="neutral"
        icon={shown ? "eye-off" : "eye"}
        aria-expanded={shown}
        onClick={() => setShown((s) => !s)}
      >
        {shown ? "Hide answer key" : "Show answer key"}
      </Button>
      {shown && <Prose markdown={markdown} />}
    </section>
  );
}

function MissingFile({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <main className="p-4">
      <ErrorState
        kind="error"
        title="This course isn't there"
        actions={
          <Button
            variant="outline"
            tone="neutral"
            onClick={() => navigate(COURSES_PATH)}
          >
            Courses
          </Button>
        }
      >
        {message}
      </ErrorState>
    </main>
  );
}

const pageLabel = (page: CoursePage) =>
  page.kind === "lesson" ? `Lesson ${page.n} · ${page.title}` : page.title;

/** Scrolls the window, where the browser can (not in jsdom). */
function scrollTop() {
  if (typeof window.scrollTo === "function")
    try {
      window.scrollTo(0, 0);
    } catch {
      // jsdom: not implemented
    }
}

/** How far down the page the reader is, 0–100. */
function useReadingProgress(page: number): number {
  const [percent, setPercent] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page has a new height; measure it again.
  useEffect(() => {
    const measure = () => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      setPercent(room > 0 ? Math.round((window.scrollY / room) * 100) : 0);
    };
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [page]);
  return percent;
}

function Outline({
  parsed,
  current,
  onPage,
  onSection,
}: {
  parsed: Course;
  current: number;
  onPage: (index: number) => void;
  onSection: (id: string) => void;
}) {
  const page = parsed.pages[current];
  const go = (index: number) => (event: MouseEvent) => {
    event.preventDefault();
    onPage(index);
  };
  const lessons = parsed.pages
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.kind === "lesson");
  const others = parsed.pages
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.kind !== "lesson");

  return (
    <div className="reader__outline">
      {page && page.sections.length > 0 && (
        <nav className="toc" aria-label="In this page">
          <span className="kicker">
            {page.kind === "lesson" ? "In this lesson" : "On this page"}
          </span>
          {page.sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => {
                event.preventDefault();
                onSection(section.id);
              }}
            >
              {section.title}
            </a>
          ))}
        </nav>
      )}
      {lessons.length > 0 && (
        <nav className="flex flex-col gap-1" aria-label="Lessons">
          <span className="kicker">Lessons</span>
          {lessons.map(({ p, index }) =>
            p.kind === "lesson" ? (
              <a
                key={index}
                className="lesson"
                href={`?p=${index}`}
                aria-current={index === current ? "page" : undefined}
                onClick={go(index)}
              >
                <span className="lesson__n">{p.n}</span>
                <span className="lesson__t">{p.title}</span>
                {p.minutes !== null && (
                  <span className="lesson__m">{p.minutes} min</span>
                )}
              </a>
            ) : null,
          )}
        </nav>
      )}
      <nav className="toc" aria-label="Course">
        <span className="kicker">Course</span>
        {others.map(({ p, index }) => (
          <a
            key={index}
            href={`?p=${index}`}
            aria-current={index === current ? "page" : undefined}
            onClick={go(index)}
          >
            {p.title}
          </a>
        ))}
      </nav>
    </div>
  );
}

/** Tablet and wider: whether the outline column shows, remembered on this device. */
const OUTLINE_KEY = "pl_reader_outline";
function usePinnedOutline(): [boolean, (shown: boolean) => void] {
  const [shown, setShown] = useState(() => {
    try {
      return localStorage.getItem(OUTLINE_KEY) !== "hidden";
    } catch {
      return true;
    }
  });
  const set = (next: boolean) => {
    setShown(next);
    try {
      localStorage.setItem(OUTLINE_KEY, next ? "shown" : "hidden");
    } catch {
      // Private mode: it still toggles, just isn't remembered.
    }
  };
  return [shown, set];
}

function Reader({ course, parsed }: Loaded) {
  const navigate = useNavigate();
  const tablet = useMinWidth("--breakpoint-tablet");
  const [params, setParams] = useSearchParams();
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [pinned, setPinned] = usePinnedOutline();
  const outlineShown = tablet && pinned;
  const last = parsed.pages.length - 1;
  const requested = Number(params.get("p") ?? 0);
  const current = Number.isInteger(requested)
    ? Math.min(Math.max(requested, 0), last)
    : 0;
  const page = parsed.pages[current] as CoursePage;
  const progress = useReadingProgress(current);
  const title = parsed.title ?? course.skill;

  const toPage = (index: number) => {
    setOutlineOpen(false);
    setParams({ p: String(index) });
    scrollTop();
  };
  const toSection = (id: string) => {
    setOutlineOpen(false);
    document.getElementById(id)?.scrollIntoView?.({ block: "start" });
  };
  const back = () => {
    // Back to where the reader came from, else the Courses tab.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(COURSES_PATH);
  };

  const previous = current > 0 ? parsed.pages[current - 1] : undefined;
  const next = current < last ? parsed.pages[current + 1] : undefined;

  return (
    <>
      <div className="reader__head">
        <PageHeader
          leading={
            tablet ? (
              <div className="flex items-center gap-1">
                {/* Like Preview's sidebar button: the outline column, shown or hidden. */}
                <Button
                  variant="ghost"
                  tone="neutral"
                  icon="sidebar"
                  iconOnly
                  aria-label={
                    pinned ? "Hide lesson outline" : "Show lesson outline"
                  }
                  aria-expanded={pinned}
                  aria-controls="reader-outline"
                  onClick={() => setPinned(!pinned)}
                />
                <Button
                  variant="ghost"
                  tone="neutral"
                  icon="chevron-left"
                  onClick={back}
                >
                  Courses
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                tone="neutral"
                icon="chevron-left"
                iconOnly
                aria-label="Back to courses"
                onClick={back}
              />
            )
          }
          title={tablet ? `${course.topicId} · ${title}` : title}
          titleIsHeading={false}
          actions={
            !tablet && (
              <Button
                variant="ghost"
                tone="neutral"
                icon="list"
                iconOnly
                aria-label="Lesson outline"
                onClick={() => setOutlineOpen(true)}
              />
            )
          }
        />
        {!tablet && (
          <ProgressBar value={progress} label="Reading progress" size="sm" />
        )}
      </div>
      <div className={cx("reader", tablet && !pinned && "reader--wide")}>
        {outlineShown && (
          <aside
            id="reader-outline"
            className="reader__aside"
            aria-label="Lesson outline"
          >
            <Outline
              parsed={parsed}
              current={current}
              onPage={toPage}
              onSection={toSection}
            />
          </aside>
        )}
        <main className="reader__main">
          {/* Lesson position and minutes are in the course's own badges. */}
          <div className="reader__meta">
            <Badge tone="accent" mono>
              {course.topicId}
            </Badge>
            <span>{LEVEL[course.level]}</span>
            {course.level === "specialized" && (
              <>
                <span aria-hidden="true">·</span>
                <span>Module {course.module}</span>
              </>
            )}
          </div>
          <Prose
            key={current}
            markdown={page.markdown}
            large={tablet}
            resolveImage={imageResolver(course.images)}
          />
          {page.kind === "lesson" && parsed.answers[page.n] && (
            // A new key per page: the answers start hidden on every lesson.
            <AnswerKey
              key={`answers-${current}`}
              n={page.n}
              markdown={parsed.answers[page.n] as string}
            />
          )}
          {(previous || next) && (
            <nav className="reader__pager" aria-label="Pages">
              {next && (
                <>
                  <span className="kicker">Next</span>
                  <Button
                    variant="soft"
                    size="lg"
                    block
                    onClick={() => toPage(current + 1)}
                  >
                    {/* Long lesson titles end in an ellipsis, never widen the page. */}
                    <span className="min-w-0 truncate">{pageLabel(next)}</span>
                  </Button>
                </>
              )}
              {previous && (
                <Button
                  variant="ghost"
                  tone="neutral"
                  icon="chevron-left"
                  block
                  aria-label={`Previous · ${pageLabel(previous)}`}
                  onClick={() => toPage(current - 1)}
                >
                  <span className="min-w-0 truncate">
                    {`Previous · ${pageLabel(previous)}`}
                  </span>
                </Button>
              )}
            </nav>
          )}
        </main>
      </div>
      {!tablet && (
        <Sheet
          open={outlineOpen}
          onClose={() => setOutlineOpen(false)}
          title="Lesson outline"
        >
          <Outline
            parsed={parsed}
            current={current}
            onPage={toPage}
            onSection={toSection}
          />
        </Sheet>
      )}
    </>
  );
}

function ReaderSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading the course"
      className="flex flex-col gap-3 p-4"
    >
      <Skeleton shape="title" width="60%" />
      <Skeleton shape="text" />
      <Skeleton shape="text" width="80%" />
      <Skeleton shape="block" />
    </section>
  );
}

/** `/study/courses/:courseId`: a recorded course, read from study-materials. */
export function CourseReader() {
  const { courseId = "" } = useParams();
  const load = useCallback(
    async (signal: AbortSignal): Promise<Loaded | Missing> => {
      const meta = await apiFetch(
        `/api/study/courses/${encodeURIComponent(courseId)}`,
        { signal },
      );
      if (meta.status === 404) {
        const { message } = (await meta.json().catch(() => ({}))) as {
          message?: string;
        };
        return { missing: message ?? "No such course." };
      }
      if (!meta.ok) throw new Error(`GET /api/study/courses/…: ${meta.status}`);
      const { course } = courseReadResponseSchema.parse(await meta.json());
      const content = await apiFetch(
        `/api/study/content/${course.sha}/${encodeURIComponent(course.name)}`,
        { signal },
      );
      if (!content.ok)
        throw new Error(`GET /api/study/content/…: ${content.status}`);
      return { course, parsed: splitCourse(await content.text()) };
    },
    [courseId],
  );
  return (
    <ReadView
      key={courseId}
      load={load}
      skeleton={<ReaderSkeleton />}
      empty={null}
      failure={{
        offline: {
          title: "You're offline",
          text: "Open this course once online to read it offline.",
        },
      }}
    >
      {(loaded) =>
        "missing" in loaded ? (
          <MissingFile message={loaded.missing} />
        ) : (
          <Reader {...loaded} />
        )
      }
    </ReadView>
  );
}
