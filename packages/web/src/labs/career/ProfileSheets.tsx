// The Profile tab's edit sheets (docs/prd/20-career-profile.md § Screens):
// person and languages, links, an experience, an education, a fact. Each
// checks what it can before sending (the API checks again with the same
// shared rules) and writes through FormSheet.
import {
  EXPERIENCE_KINDS,
  endNotBeforeStart,
  FACT_MAX_LENGTH,
  isProfileDate,
  LINK_KINDS,
  type LinkKind,
  type ProfileEducation,
  type ProfileExperience,
  type ProfileFact,
  type ProfileLink,
  type ProfilePerson,
  SUMMARY_MAX_LENGTH,
} from "@projects-lab/shared/career";
import { useState } from "react";
import { Button, Checkbox, Input, Select, Textarea } from "../../components/ui";
import { FormSheet, send } from "./FormSheet";

interface SheetBase {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

const KIND_LABEL: Record<(typeof EXPERIENCE_KINDS)[number], string> = {
  job: "Job",
  contract: "Contract",
  research: "Research",
  project: "Project",
};
const LINK_LABEL: Record<LinkKind, string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  portfolio: "Portfolio",
  scholar: "Scholar",
  other: "Other",
};

/** "English: C1" per line ⇄ [{ name, level }]. */
const languagesText = (languages: ProfilePerson["languages"]) =>
  languages.map((l) => `${l.name}: ${l.level}`).join("\n");
function parseLanguages(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines.map((line) => {
    const [name, ...rest] = line.split(":");
    return { name: name?.trim() ?? "", level: rest.join(":").trim() };
  });
  return parsed.every((l) => l.name && l.level) ? parsed : null;
}

export function PersonSheet({
  person,
  ...base
}: SheetBase & { person: ProfilePerson }) {
  const [form, setForm] = useState({
    fullName: person.fullName,
    headline: person.headline,
    email: person.email,
    phone: person.phone,
    location: person.location,
    timezone: person.timezone,
    summary: person.summary,
    languages: languagesText(person.languages),
  });
  const [tried, setTried] = useState(false);
  const languages = parseLanguages(form.languages);
  const set =
    (key: keyof typeof form) => (event: { target: { value: string } }) =>
      setForm({ ...form, [key]: event.target.value });
  const nameError = tried && !form.fullName.trim() ? "Your name." : undefined;
  const languagesError =
    languages === null ? "One per line, as Name: level." : undefined;

  return (
    <FormSheet
      {...base}
      title="Name and contact"
      onSave={() => {
        setTried(true);
        if (!form.fullName.trim() || !languages) return null;
        return send("PATCH", "/api/career/person", {
          fullName: form.fullName.trim(),
          headline: form.headline,
          email: form.email.trim() || undefined,
          phone: form.phone,
          location: form.location,
          timezone: form.timezone.trim() || undefined,
          summary: form.summary,
          languages,
        });
      }}
    >
      <Input
        label="Full name"
        value={form.fullName}
        onChange={set("fullName")}
        error={nameError}
        autoComplete="name"
      />
      <Input
        label="Headline"
        optional
        value={form.headline}
        onChange={set("headline")}
      />
      <div className="grid gap-3 tablet:grid-cols-2">
        <Input
          label="Email"
          optional
          type="email"
          value={form.email}
          onChange={set("email")}
          autoComplete="email"
        />
        <Input
          label="Phone"
          optional
          type="tel"
          value={form.phone}
          onChange={set("phone")}
          autoComplete="tel"
        />
        <Input
          label="Location"
          optional
          value={form.location}
          onChange={set("location")}
        />
        <Input
          label="Time zone"
          optional
          value={form.timezone}
          onChange={set("timezone")}
          hint="e.g. America/Recife"
        />
      </div>
      <Textarea
        label="Summary"
        optional
        value={form.summary}
        onChange={set("summary")}
        maxLength={SUMMARY_MAX_LENGTH}
        hint={`${form.summary.length} of ${SUMMARY_MAX_LENGTH}`}
      />
      <Textarea
        label="Languages"
        optional
        value={form.languages}
        onChange={set("languages")}
        hint="One per line, e.g. English: C1"
        error={languagesError}
      />
    </FormSheet>
  );
}

type LinkDraft = { kind: LinkKind; label: string; url: string };

export function LinksSheet({
  links,
  ...base
}: SheetBase & { links: ProfileLink[] }) {
  const [drafts, setDrafts] = useState<LinkDraft[]>(
    links.map(({ kind, label, url }) => ({ kind, label, url })),
  );
  const [tried, setTried] = useState(false);
  const update = (i: number, change: Partial<LinkDraft>) =>
    setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const urlError = (url: string) =>
    !tried
      ? undefined
      : /^https:\/\/\S+$/.test(url.trim())
        ? undefined
        : "An https:// link.";

  return (
    <FormSheet
      {...base}
      title="Links"
      onSave={() => {
        setTried(true);
        const ready = drafts.every(
          (d) => d.label.trim() && /^https:\/\/\S+$/.test(d.url.trim()),
        );
        if (!ready) return null;
        return send("PUT", "/api/career/links", {
          links: drafts.map((d) => ({
            kind: d.kind,
            label: d.label.trim(),
            url: d.url.trim(),
          })),
        });
      }}
    >
      {drafts.map((draft, i) => (
        <fieldset
          // A draft has no id until it's saved; its place is its identity here.
          // biome-ignore lint/suspicious/noArrayIndexKey: drafts are edited in place, never reordered
          key={i}
          className="flex flex-col gap-3 border-0 p-0"
          aria-label={`Link ${i + 1}`}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
            <Select
              label="Kind"
              value={draft.kind}
              options={LINK_KINDS.map((k) => [k, LINK_LABEL[k]])}
              onChange={(kind) =>
                update(i, {
                  kind,
                  label:
                    draft.label === LINK_LABEL[draft.kind] || !draft.label
                      ? LINK_LABEL[kind]
                      : draft.label,
                })
              }
            />
            <Input
              label="Label"
              value={draft.label}
              error={
                tried && !draft.label.trim() ? "Name the link." : undefined
              }
              onChange={(e) => update(i, { label: e.target.value })}
            />
          </div>
          <Input
            label="URL"
            type="url"
            value={draft.url}
            error={urlError(draft.url)}
            onChange={(e) => update(i, { url: e.target.value })}
          />
          <Button
            variant="ghost"
            tone="danger"
            size="sm"
            icon="trash"
            onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
          >
            Remove this link
          </Button>
        </fieldset>
      ))}
      <Button
        variant="outline"
        tone="neutral"
        icon="plus"
        onClick={() =>
          setDrafts([
            ...drafts,
            { kind: "linkedin", label: "LinkedIn", url: "" },
          ])
        }
      >
        Add a link
      </Button>
    </FormSheet>
  );
}

/** Start and end as YYYY or YYYY-MM; an end not before the start. */
function useDates(start0: string, end0: string | null, tried: boolean) {
  const [start, setStart] = useState(start0);
  const [end, setEnd] = useState(end0 ?? "");
  const startError = !tried
    ? undefined
    : isProfileDate(start.trim())
      ? undefined
      : "YYYY or YYYY-MM, e.g. 2023-04.";
  const endError =
    !tried || end.trim() === ""
      ? undefined
      : !isProfileDate(end.trim())
        ? "YYYY or YYYY-MM, or leave empty."
        : isProfileDate(start.trim()) &&
            !endNotBeforeStart(start.trim(), end.trim())
          ? "The end is before the start."
          : undefined;
  const ok =
    isProfileDate(start.trim()) &&
    (end.trim() === "" ||
      (isProfileDate(end.trim()) &&
        endNotBeforeStart(start.trim(), end.trim())));
  return { start, setStart, end, setEnd, startError, endError, ok };
}

export function ExperienceSheet({
  experience,
  ...base
}: SheetBase & { experience?: Omit<ProfileExperience, "facts"> }) {
  const [form, setForm] = useState({
    organization: experience?.organization ?? "",
    title: experience?.title ?? "",
    kind: experience?.kind ?? "job",
    location: experience?.location ?? "",
    summary: experience?.summary ?? "",
  });
  const [tried, setTried] = useState(false);
  const dates = useDates(
    experience?.start ?? "",
    experience?.end ?? null,
    tried,
  );
  const missing = (value: string, message: string) =>
    tried && !value.trim() ? message : undefined;

  return (
    <FormSheet
      {...base}
      title={experience ? "Experience" : "Add an experience"}
      saveLabel={experience ? "Save" : "Add"}
      onSave={() => {
        setTried(true);
        if (!form.organization.trim() || !form.title.trim() || !dates.ok)
          return null;
        return send("POST", "/api/career/experiences", {
          ...(experience ? { id: experience.id } : {}),
          organization: form.organization.trim(),
          title: form.title.trim(),
          kind: form.kind,
          start: dates.start.trim(),
          end: dates.end.trim() || null,
          location: form.location,
          summary: form.summary,
        });
      }}
      remove={
        experience && {
          label: "Remove",
          confirm: "Remove this experience?",
          detail:
            "Its facts are hidden with it. A job's saved selection may still cite them.",
          run: () =>
            send("DELETE", `/api/career/items/experience/${experience.id}`),
        }
      }
    >
      <Input
        label="Title"
        value={form.title}
        error={missing(form.title, "The role you held.")}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <Input
        label="Organization"
        value={form.organization}
        error={missing(form.organization, "Where.")}
        onChange={(e) => setForm({ ...form, organization: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Kind"
          value={form.kind}
          options={EXPERIENCE_KINDS.map((k) => [k, KIND_LABEL[k]])}
          onChange={(kind) => setForm({ ...form, kind })}
        />
        <Input
          label="Location"
          optional
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
        />
        <Input
          label="Start"
          value={dates.start}
          placeholder="2023-04"
          error={dates.startError}
          onChange={(e) => dates.setStart(e.target.value)}
        />
        <Input
          label="End"
          optional
          value={dates.end}
          placeholder="Current"
          error={dates.endError}
          onChange={(e) => dates.setEnd(e.target.value)}
        />
      </div>
      <Textarea
        label="Summary"
        optional
        value={form.summary}
        maxLength={SUMMARY_MAX_LENGTH}
        hint="Context only: documents cite facts, never the summary."
        onChange={(e) => setForm({ ...form, summary: e.target.value })}
      />
    </FormSheet>
  );
}

export function EducationSheet({
  education,
  ...base
}: SheetBase & { education?: Omit<ProfileEducation, "facts"> }) {
  const [form, setForm] = useState({
    institution: education?.institution ?? "",
    degree: education?.degree ?? "",
    field: education?.field ?? "",
    notes: education?.notes ?? "",
  });
  const [tried, setTried] = useState(false);
  const dates = useDates(education?.start ?? "", education?.end ?? null, tried);
  const missing = (value: string, message: string) =>
    tried && !value.trim() ? message : undefined;

  return (
    <FormSheet
      {...base}
      title={education ? "Education" : "Add education"}
      saveLabel={education ? "Save" : "Add"}
      onSave={() => {
        setTried(true);
        if (!form.institution.trim() || !form.degree.trim() || !dates.ok)
          return null;
        return send("POST", "/api/career/education", {
          ...(education ? { id: education.id } : {}),
          institution: form.institution.trim(),
          degree: form.degree.trim(),
          field: form.field,
          start: dates.start.trim(),
          end: dates.end.trim() || null,
          notes: form.notes,
        });
      }}
      remove={
        education && {
          label: "Remove",
          confirm: "Remove this education?",
          detail: "Its facts are hidden with it.",
          run: () =>
            send("DELETE", `/api/career/items/education/${education.id}`),
        }
      }
    >
      <Input
        label="Degree"
        value={form.degree}
        error={missing(form.degree, "BSc, MSc, a certificate…")}
        onChange={(e) => setForm({ ...form, degree: e.target.value })}
      />
      <Input
        label="Institution"
        value={form.institution}
        error={missing(form.institution, "Where.")}
        onChange={(e) => setForm({ ...form, institution: e.target.value })}
      />
      <Input
        label="Field"
        optional
        value={form.field}
        onChange={(e) => setForm({ ...form, field: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Start"
          value={dates.start}
          placeholder="2015"
          error={dates.startError}
          onChange={(e) => dates.setStart(e.target.value)}
        />
        <Input
          label="End"
          optional
          value={dates.end}
          placeholder="In progress"
          error={dates.endError}
          onChange={(e) => dates.setEnd(e.target.value)}
        />
      </div>
      <Textarea
        label="Notes"
        optional
        value={form.notes}
        maxLength={SUMMARY_MAX_LENGTH}
        onChange={(e) => setForm({ ...form, notes: e.target.value })}
      />
    </FormSheet>
  );
}

export type FactParent =
  | { kind: "experience"; id: string; label: string }
  | { kind: "education"; id: string; label: string }
  | null;

export function FactSheet({
  fact,
  parent,
  ...base
}: SheetBase & { fact?: ProfileFact; parent: FactParent }) {
  const [text, setText] = useState(fact?.text ?? "");
  const [skills, setSkills] = useState(
    fact?.skills.map((s) => s.name).join(", ") ?? "",
  );
  const [verified, setVerified] = useState(fact?.verified ?? false);
  const [tried, setTried] = useState(false);
  const textError =
    tried && !text.trim() ? "One claim, in a sentence." : undefined;

  return (
    <FormSheet
      {...base}
      title={fact ? "Fact" : "Add a fact"}
      saveLabel={fact ? "Save" : "Add"}
      onSave={() => {
        setTried(true);
        if (!text.trim()) return null;
        return send("POST", "/api/career/facts", {
          ...(fact ? { id: fact.id } : {}),
          ...(parent?.kind === "experience" ? { experienceId: parent.id } : {}),
          ...(parent?.kind === "education" ? { educationId: parent.id } : {}),
          text: text.trim(),
          verified,
          skills: skills
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
      remove={
        fact && {
          label: "Remove",
          confirm: "Remove this fact?",
          detail:
            "Documents stop using it. A job's saved selection may still cite it.",
          run: () => send("DELETE", `/api/career/items/fact/${fact.id}`),
        }
      }
    >
      {parent && <p className="text-sm text-ink-muted">{parent.label}</p>}
      <Textarea
        label="Fact"
        value={text}
        maxLength={FACT_MAX_LENGTH}
        error={textError}
        hint={`One claim a document can use. ${text.length} of ${FACT_MAX_LENGTH}.`}
        onChange={(e) => setText(e.target.value)}
      />
      <Input
        label="Skills it shows"
        optional
        value={skills}
        hint="Comma-separated, e.g. TypeScript, LLM evaluation"
        onChange={(e) => setSkills(e.target.value)}
      />
      <Checkbox
        checked={verified}
        onChange={(e) => setVerified(e.target.checked)}
      >
        Verified: I confirm this is true. Unverified facts stay out of
        documents.
      </Checkbox>
    </FormSheet>
  );
}
