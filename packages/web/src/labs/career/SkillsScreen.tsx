// The Skills tab (docs/prd/20-career-profile.md § Screens): declared skills by
// level, each with its readiness (Verified when Study proved it, else
// Declared), and the skills Study verified that the profile doesn't declare,
// offered to declare (A-8: an offer, never added silently). The bundle draws
// no screen for it: Groups of ListRows, as the Backlog.
import { formatGrade } from "@projects-lab/shared";
import {
  SKILL_LEVELS,
  type SkillLevel,
  type SkillsResponse,
  skillsResponseSchema,
} from "@projects-lab/shared/career";
import { useState } from "react";
import {
  Badge,
  Button,
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
import { apiFetch } from "../../core/api";
import { ReadView } from "../../core/ReadView";
import { FormSheet, send } from "./FormSheet";

const LEVEL: Record<SkillLevel, string> = {
  strong: "Strong",
  working: "Working",
  familiar: "Familiar",
};
/** Strongest first. */
const LEVELS: SkillLevel[] = ["strong", "working", "familiar"];

async function fetchSkills(
  signal: AbortSignal,
): Promise<SkillsResponse | null> {
  const response = await apiFetch("/api/career/skills", { signal });
  if (!response.ok)
    throw new Error(`GET /api/career/skills: ${response.status}`);
  const data = skillsResponseSchema.parse(await response.json());
  return data.skills.length + data.offers.length === 0 ? null : data;
}

type Declared = SkillsResponse["skills"][number];
type Opening =
  | { kind: "add" }
  | { kind: "offer"; name: string; grade: number }
  | { kind: "edit"; skill: Declared };
type Editing = Opening & { opened: number };

function SkillSheet({
  editing,
  open,
  onClose,
  onDone,
}: {
  editing: Editing;
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const skill = editing.kind === "edit" ? editing.skill : undefined;
  const fixedName =
    editing.kind === "offer" ? editing.name : (skill?.name ?? null);
  const [name, setName] = useState(fixedName ?? "");
  const [level, setLevel] = useState<SkillLevel>(skill?.level ?? "working");
  const [years, setYears] = useState(
    skill?.years === null || skill?.years === undefined
      ? ""
      : String(skill.years),
  );
  const [note, setNote] = useState(skill?.note ?? "");
  const [tried, setTried] = useState(false);
  const yearsOk = years.trim() === "" || /^\d{1,2}$/.test(years.trim());

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      onDone={onDone}
      title={
        editing.kind === "add"
          ? "Declare a skill"
          : editing.kind === "offer"
            ? `Declare ${editing.name}`
            : (skill?.name ?? "Skill")
      }
      saveLabel={editing.kind === "edit" ? "Save" : "Declare"}
      onSave={() => {
        setTried(true);
        if (!name.trim() || !yearsOk) return null;
        return send("PUT", "/api/career/skills", {
          skill: name.trim(),
          level,
          years: years.trim() === "" ? null : Number(years.trim()),
          note,
        });
      }}
      remove={
        skill && {
          label: "Remove",
          confirm: `Remove ${skill.name} from your profile?`,
          detail: "It stays in Study and in the skill registry.",
          run: () =>
            send(
              "DELETE",
              `/api/career/skills/${encodeURIComponent(skill.name)}`,
            ),
        }
      }
    >
      {editing.kind === "offer" && (
        <p className="text-sm text-ink-muted">
          Study verified it with a grade of {formatGrade(editing.grade)}.
          Declare it to use it in your documents.
        </p>
      )}
      {fixedName === null && (
        <Input
          label="Skill"
          value={name}
          hint="A name or an alias, e.g. Postgres."
          error={tried && !name.trim() ? "Name the skill." : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Level"
          value={level}
          options={SKILL_LEVELS.map((l) => [l, LEVEL[l]])}
          onChange={setLevel}
        />
        <Input
          label="Years"
          optional
          inputMode="numeric"
          value={years}
          error={yearsOk ? undefined : "Whole years, e.g. 3."}
          onChange={(e) => setYears(e.target.value)}
        />
      </div>
      <Textarea
        label="Note"
        optional
        value={note}
        maxLength={200}
        onChange={(e) => setNote(e.target.value)}
      />
    </FormSheet>
  );
}

function Readiness({ skill }: { skill: Declared }) {
  return skill.readiness === "verified" ? (
    <Badge tone="verified" size="sm">
      Verified
    </Badge>
  ) : (
    <Badge tone="declared" size="sm">
      Declared
    </Badge>
  );
}

function Skills({
  data,
  open,
}: {
  data: SkillsResponse;
  open: (opening: Opening) => void;
}) {
  const verified = data.skills.filter((s) => s.readiness === "verified").length;
  return (
    <>
      <div className="flex flex-col tablet:flex-row tablet:items-end">
        <div className="flex-1">
          <PageTitle
            title="Skills"
            subtitle={`${data.skills.length} declared · ${verified} verified in Study`}
          />
        </div>
        <div className="px-4 pb-3 tablet:pl-0">
          <Button icon="plus" onClick={() => open({ kind: "add" })}>
            Declare a skill
          </Button>
        </div>
      </div>
      {/* PageTitle brings its own gutter; the rest lines up with it. */}
      <div className="flex flex-col gap-4 px-4 pb-6 tablet:gap-5">
        {data.offers.length > 0 && (
          <Group
            title="Verified in Study, not declared"
            count={data.offers.length}
          >
            {data.offers.map((offer) => (
              <ListRow
                key={offer.skillId}
                title={offer.name}
                meta={`Study grade ${formatGrade(offer.grade)} · tap to declare`}
                tags={
                  <Badge tone="verified" size="sm">
                    Verified
                  </Badge>
                }
                onClick={() =>
                  open({ kind: "offer", name: offer.name, grade: offer.grade })
                }
              />
            ))}
          </Group>
        )}
        {LEVELS.map((level) => {
          const skills = data.skills.filter((s) => s.level === level);
          if (skills.length === 0) return null;
          return (
            <Group key={level} title={LEVEL[level]} count={skills.length}>
              {skills.map((skill) => (
                <ListRow
                  key={skill.skillId}
                  title={skill.name}
                  meta={
                    [
                      skill.years === null
                        ? null
                        : `${skill.years} ${skill.years === 1 ? "year" : "years"}`,
                      skill.grade === null
                        ? null
                        : `Study grade ${formatGrade(skill.grade)}`,
                      skill.note || null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  tags={<Readiness skill={skill} />}
                  onClick={() => open({ kind: "edit", skill })}
                />
              ))}
            </Group>
          );
        })}
      </div>
    </>
  );
}

export function SkillsScreen() {
  const toast = useToast();
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [last, setLast] = useState<Editing | null>(null);
  if (editing && editing !== last) setLast(editing);
  const open = (next: Opening) =>
    setEditing({ ...next, opened: (last?.opened ?? 0) + 1 });
  const done = (message: string) => {
    setEditing(null);
    setRefresh((n) => n + 1);
    toast.show({ tone: "success", message });
  };
  const sheet = editing ?? last;

  return (
    <>
      <ReadView
        load={fetchSkills}
        refresh={refresh}
        skeleton={
          <>
            <PageTitle title="Skills" />
            <div className="flex flex-col gap-3 p-4">
              <Skeleton shape="block" />
              <Skeleton shape="block" />
            </div>
          </>
        }
        empty={
          <>
            <PageTitle title="Skills" />
            <EmptyState
              icon="award"
              title="No skills yet"
              actions={
                <Button onClick={() => open({ kind: "add" })}>
                  Declare a skill
                </Button>
              }
            >
              Declare what you can do, or finish a course in Study: a topic Done
              with 7.0 or more is offered here.
            </EmptyState>
          </>
        }
      >
        {(data) => <Skills data={data} open={open} />}
      </ReadView>
      {sheet && (
        <SkillSheet
          key={sheet.opened}
          editing={sheet}
          open={editing !== null}
          onClose={() => setEditing(null)}
          onDone={done}
        />
      )}
    </>
  );
}
