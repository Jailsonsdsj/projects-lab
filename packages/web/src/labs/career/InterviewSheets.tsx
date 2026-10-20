// Interview edit sheets (docs/prd/24-career-interviews.md): an answer with its
// Drive video, and a STAR story with the facts it rests on. Plus Drive's own
// player, embedded in a sandboxed iframe (R2-13: video never goes to R2).
import {
  ANSWER_MAX_LENGTH,
  type Answer,
  driveFileId,
  type JobSummary,
  type ProfileFact,
  QUESTION_MAX_LENGTH,
  STAR_PART_MAX_LENGTH,
  type Story,
} from "@projects-lab/shared/career";
import { useState } from "react";
import { Checkbox, Input, Select, Textarea } from "../../components/ui";
import { FormSheet, send } from "./FormSheet";

/**
 * Drive's player for one file. The browser can't tell the app whether a
 * cross-origin player loaded, so the way out is always on screen: a message,
 * never a blank box.
 */
export function DrivePlayer({
  video,
  title,
}: {
  video: NonNullable<Answer["video"]>;
  title: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {failed ? (
        <div className="empty empty--error" role="status">
          The video couldn't load here.
        </div>
      ) : (
        <iframe
          className="aspect-video w-full rounded-(--radius-lg) border-0 bg-(--color-surface-2)"
          title={`Video: ${title}`}
          src={video.previewUrl}
          // Drive's player needs its own scripts and origin; nothing else.
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; fullscreen"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <p className="text-sm text-ink-muted">
        If it doesn't play, share it with your Google account in Drive.{" "}
        <a
          className="text-(--color-lab-accent) underline"
          href={`https://drive.google.com/file/d/${video.fileId}/view`}
          target="_blank"
          rel="noreferrer"
        >
          Open in Drive
        </a>
      </p>
    </div>
  );
}

interface SheetBase {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

const GENERAL = "";

export function AnswerSheet({
  answer,
  jobs,
  stories,
  presetJob,
  ...base
}: SheetBase & {
  answer?: Answer;
  jobs: JobSummary[];
  stories: Story[];
  presetJob?: string | null;
}) {
  const [question, setQuestion] = useState(answer?.question ?? "");
  const [text, setText] = useState(answer?.answer ?? "");
  const [link, setLink] = useState(
    answer?.video
      ? `https://drive.google.com/file/d/${answer.video.fileId}/view`
      : "",
  );
  const [jobId, setJobId] = useState(answer?.jobId ?? presetJob ?? GENERAL);
  const [storyId, setStoryId] = useState(answer?.storyId ?? "");
  const [tried, setTried] = useState(false);
  const linkOk = link.trim() === "" || driveFileId(link.trim()) !== null;

  return (
    <FormSheet
      {...base}
      title={answer ? "Answer" : "Add an answer"}
      saveLabel={answer ? "Save" : "Add"}
      onSave={() => {
        setTried(true);
        if (!question.trim() || !text.trim() || !linkOk) return null;
        return send("POST", "/api/career/answers", {
          ...(answer ? { id: answer.id } : {}),
          question: question.trim(),
          answer: text.trim(),
          driveLink: link.trim() === "" ? null : link.trim(),
          jobId: jobId === GENERAL ? null : jobId,
          storyId: storyId === "" ? null : storyId,
        });
      }}
    >
      {answer?.video && (
        <DrivePlayer video={answer.video} title={answer.question} />
      )}
      <Input
        label="Question"
        value={question}
        maxLength={QUESTION_MAX_LENGTH}
        error={
          tried && !question.trim() ? "The question you expect." : undefined
        }
        onChange={(e) => setQuestion(e.target.value)}
      />
      <Textarea
        label="Your answer"
        value={text}
        maxLength={ANSWER_MAX_LENGTH}
        error={tried && !text.trim() ? "What you'd say." : undefined}
        hint={`${text.length} of ${ANSWER_MAX_LENGTH}`}
        onChange={(e) => setText(e.target.value)}
      />
      <Input
        label="Drive video"
        optional
        type="url"
        value={link}
        error={
          linkOk
            ? undefined
            : "A Google Drive file link: drive.google.com/file/d/… or open?id=…"
        }
        hint="Upload the video to Google Drive and paste its link. Empty removes it."
        onChange={(e) => setLink(e.target.value)}
      />
      <div className="grid gap-3 tablet:grid-cols-2">
        <Select
          label="For"
          value={jobId}
          options={[
            [GENERAL, "Any job (general)"],
            ...jobs.map((j): [string, string] => [
              j.id,
              `${j.company} · ${j.role}`,
            ]),
          ]}
          onChange={setJobId}
        />
        <Select
          label="Story it uses"
          value={storyId}
          options={[
            ["", "None"],
            ...stories.map((s): [string, string] => [s.id, s.title]),
          ]}
          onChange={setStoryId}
        />
      </div>
    </FormSheet>
  );
}

const PARTS = [
  ["situation", "Situation"],
  ["task", "Task"],
  ["action", "Action"],
  ["result", "Result"],
] as const;

export function StorySheet({
  story,
  facts,
  ...base
}: SheetBase & { story?: Story; facts: ProfileFact[] }) {
  const [title, setTitle] = useState(story?.title ?? "");
  const [parts, setParts] = useState({
    situation: story?.situation ?? "",
    task: story?.task ?? "",
    action: story?.action ?? "",
    result: story?.result ?? "",
  });
  const [cited, setCited] = useState<string[]>(
    story?.facts.map((f) => f.id) ?? [],
  );
  const [skills, setSkills] = useState(
    story?.skills.map((s) => s.name).join(", ") ?? "",
  );
  const [tried, setTried] = useState(false);
  const missing = (value: string) => tried && !value.trim();

  return (
    <FormSheet
      {...base}
      title={story ? "Story" : "Add a story"}
      saveLabel={story ? "Save" : "Add"}
      onSave={() => {
        setTried(true);
        if (!title.trim() || PARTS.some(([key]) => !parts[key].trim()))
          return null;
        return send("POST", "/api/career/stories", {
          ...(story ? { id: story.id } : {}),
          title: title.trim(),
          ...Object.fromEntries(PARTS.map(([key]) => [key, parts[key].trim()])),
          factIds: cited,
          skills: skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
    >
      <Input
        label="Title"
        value={title}
        error={missing(title) ? "A short name for the story." : undefined}
        onChange={(e) => setTitle(e.target.value)}
      />
      {PARTS.map(([key, label]) => (
        <Textarea
          key={key}
          label={label}
          value={parts[key]}
          maxLength={STAR_PART_MAX_LENGTH}
          error={
            missing(parts[key]) ? `The ${label.toLowerCase()}.` : undefined
          }
          onChange={(e) => setParts({ ...parts, [key]: e.target.value })}
        />
      ))}
      <fieldset className="flex flex-col gap-1 border-0 p-0">
        <legend className="field__label pb-1">Facts it rests on</legend>
        <p className="text-sm text-ink-muted">
          The result cites facts. A story on an unverified fact stays
          unverified.
        </p>
        {facts.length === 0 && (
          <p className="text-sm text-ink-muted">
            No facts in your profile yet.
          </p>
        )}
        {facts.map((fact) => (
          <Checkbox
            key={fact.id}
            checked={cited.includes(fact.id)}
            onChange={(e) =>
              setCited(
                e.target.checked
                  ? [...cited, fact.id]
                  : cited.filter((id) => id !== fact.id),
              )
            }
          >
            {fact.text}
            {fact.verified ? "" : " (unverified)"}
          </Checkbox>
        ))}
      </fieldset>
      <Input
        label="Skills it shows"
        optional
        value={skills}
        hint="Comma-separated."
        onChange={(e) => setSkills(e.target.value)}
      />
    </FormSheet>
  );
}
