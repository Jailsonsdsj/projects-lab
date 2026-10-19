// Add a topic to the backlog (docs/prd/10-study-backlog.md § Screens): skill
// with lookup, area (or a new one), level, priority. Composed from Sheet,
// Input and Select; the bundle draws no sheet for it. Each write carries its
// own Idempotency-Key; a new area is created before the topic.
import {
  findSkillResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
  type Skill,
} from "@projects-lab/shared";
import {
  type AddTopicsResponse,
  addTopicsResponseSchema,
  type BacklogResponse,
  type CourseLevel,
  isValidPrefix,
  type Priority,
} from "@projects-lab/shared/study";
import { useEffect, useState } from "react";
import { Banner, Button, Input, Sheet } from "../../components/ui";
import { apiFetch } from "../../core/api";
import { failureKind } from "../../core/failure";
import { Select } from "./Select";

const NEW_AREA = "+new";
const LEVELS: ["" | CourseLevel, string][] = [
  ["", "Not chosen"],
  ["fast_track", "Fast track"],
  ["essential", "Essential"],
  ["specialized", "Specialized"],
];
const PRIORITIES: [Priority, string][] = [
  [1, "P1 · next up"],
  [2, "P2 · soon"],
  [3, "P3 · later"],
];

type Lookup =
  | { state: "idle" }
  | { state: "found"; skill: Skill }
  | { state: "new" };
export type Added = AddTopicsResponse["topics"][number];

const post = (path: string, body: unknown) =>
  apiFetch(path, {
    method: "POST",
    headers: {
      [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

/** The registry's skill for what's typed, looked up as you type (2+ letters);
 *  each keystroke cancels the previous request. */
function useSkillLookup(text: string): Lookup {
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  useEffect(() => {
    const query = text.trim();
    if (query.length < 2) {
      setLookup({ state: "idle" });
      return;
    }
    const controller = new AbortController();
    apiFetch(`/api/skills?query=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return setLookup({ state: "idle" });
        const { skill } = findSkillResponseSchema.parse(await response.json());
        setLookup(skill ? { state: "found", skill } : { state: "new" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLookup({ state: "idle" });
      });
    return () => controller.abort();
  }, [text]);
  return lookup;
}

function AddForm({
  backlog,
  onAdded,
}: {
  backlog: BacklogResponse;
  onAdded: (added: Added) => void;
}) {
  const [skill, setSkill] = useState("");
  const [area, setArea] = useState("");
  const [areaName, setAreaName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [level, setLevel] = useState<"" | CourseLevel>("");
  const [priority, setPriority] = useState<Priority>(2);
  const [serverError, setServerError] = useState<{
    name?: string;
    prefix?: string;
  }>({});
  const [createdArea, setCreatedArea] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<"error" | "offline" | null>(null);
  const [tried, setTried] = useState(false);
  const lookup = useSkillLookup(skill);

  const newArea = area === NEW_AREA;
  const existing =
    lookup.state === "found"
      ? backlog.topics.find((t) => t.skillId === lookup.skill.id)
      : undefined;
  const skillHint =
    lookup.state === "found"
      ? existing
        ? `${lookup.skill.name} is already in the backlog as ${existing.id}.`
        : `Matches the skill ${lookup.skill.name}.`
      : lookup.state === "new"
        ? "A new skill."
        : "A name or an alias, e.g. Postgres.";

  const prefixError =
    serverError.prefix ??
    (!newArea || createdArea === prefix
      ? undefined
      : prefix && !isValidPrefix(prefix)
        ? "Two letters, A to Z."
        : backlog.areas.some((a) => a.prefix === prefix)
          ? `${prefix} is already an area's prefix.`
          : tried && !prefix
            ? "A two-letter prefix starts every topic ID."
            : undefined);
  const nameError =
    serverError.name ??
    (!newArea || createdArea === prefix
      ? undefined
      : backlog.areas.some(
            (a) => a.name.toLowerCase() === areaName.trim().toLowerCase(),
          )
        ? "An area with this name already exists."
        : tried && !areaName.trim()
          ? "Name the new area."
          : undefined);
  const skillError =
    tried && !skill.trim() ? "Name the skill to learn." : undefined;
  const areaError = tried && !area ? "Choose an area." : undefined;

  async function add() {
    setTried(true);
    setFailed(null);
    const ready =
      skill.trim() &&
      area &&
      (!newArea ||
        createdArea === prefix ||
        (areaName.trim() && isValidPrefix(prefix)));
    if (!ready || prefixError || nameError) return;
    setBusy(true);
    try {
      let target = area;
      if (newArea) {
        if (createdArea !== prefix) {
          const response = await post("/api/study/areas", {
            name: areaName.trim(),
            prefix,
          });
          if (response.status === 409) {
            const { message = "" } = (await response.json()) as {
              message?: string;
            };
            setServerError(
              message.startsWith("Prefix")
                ? { prefix: message }
                : { name: message },
            );
            return;
          }
          if (!response.ok) return setFailed("error");
          setCreatedArea(prefix);
        }
        target = prefix;
      }
      const response = await post("/api/study/topics", {
        topics: [
          {
            skill: skill.trim(),
            area: target,
            priority,
            ...(level ? { level } : {}),
          },
        ],
      });
      if (!response.ok) return setFailed("error");
      const [added] = addTopicsResponseSchema.parse(
        await response.json(),
      ).topics;
      if (added) onAdded(added);
    } catch (error) {
      setFailed(failureKind(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {failed === "error" && (
        <Banner tone="danger" title="Couldn't add it.">
          What you typed is still here. Try again in a moment.
        </Banner>
      )}
      {failed === "offline" && (
        <Banner tone="offline" title="You're offline.">
          What you typed is still here. Add it once you're back online.
        </Banner>
      )}
      <Input
        label="Skill"
        value={skill}
        onChange={(event) => setSkill(event.target.value)}
        hint={skillHint}
        error={skillError}
        autoComplete="off"
      />
      <Select
        label="Area"
        value={area}
        error={areaError}
        options={[
          ["", "Choose an area"],
          ...backlog.areas.map((a): [string, string] => [a.prefix, a.name]),
          [NEW_AREA, "New area…"],
        ]}
        onChange={(value) => {
          setArea(value);
          setServerError({});
        }}
      />
      {newArea && (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
          <Input
            label="Area name"
            value={areaName}
            error={nameError}
            disabled={createdArea === prefix && createdArea !== null}
            onChange={(event) => {
              setAreaName(event.target.value);
              setServerError({});
            }}
          />
          <Input
            label="Prefix"
            value={prefix}
            maxLength={2}
            error={prefixError}
            disabled={createdArea === prefix && createdArea !== null}
            autoCapitalize="characters"
            onChange={(event) => {
              setPrefix(event.target.value.toUpperCase());
              setServerError({});
            }}
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Level"
          value={level}
          options={LEVELS}
          onChange={setLevel}
        />
        <Select
          label="Priority"
          value={priority}
          options={PRIORITIES}
          onChange={setPriority}
        />
      </div>
      <Button loading={busy} onClick={add}>
        {busy ? "Adding" : "Add to backlog"}
      </Button>
    </div>
  );
}

export interface AddTopicSheetProps {
  open: boolean;
  backlog: BacklogResponse | null;
  onClose: () => void;
  onAdded: (added: Added) => void;
}

/** Backlog → Add: a topic, and its area if it's a new one. */
export function AddTopicSheet({
  open,
  backlog,
  onClose,
  onAdded,
}: AddTopicSheetProps) {
  // A fresh form each time it opens.
  const [opened, setOpened] = useState(0);
  useEffect(() => {
    if (open) setOpened((n) => n + 1);
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Add a topic">
      {backlog && <AddForm key={opened} backlog={backlog} onAdded={onAdded} />}
    </Sheet>
  );
}
