// The profile's records under the copy panel (docs/prd/20-career-profile.md
// § Screens): name and contact, links, experiences and education with their
// facts (unverified ones badged), other facts. Each row opens its edit sheet;
// the bundle draws no screen for these, so they're Groups of ListRows.
import type {
  ProfileEducation,
  ProfileExperience,
  ProfileFact,
  ProfileResponse,
} from "@projects-lab/shared/career";
import { useState } from "react";
import { Badge, Button, Group, ListRow } from "../../components/ui";
import {
  EducationSheet,
  ExperienceSheet,
  type FactParent,
  FactSheet,
  LinksSheet,
  PersonSheet,
} from "./ProfileSheets";

export type Editing =
  | { kind: "person" }
  | { kind: "links" }
  | { kind: "experience"; item?: Omit<ProfileExperience, "facts"> }
  | { kind: "education"; item?: Omit<ProfileEducation, "facts"> }
  | { kind: "fact"; item?: ProfileFact; parent: FactParent };

/** "2023-04 – now" */
const span = (start: string, end: string | null, open: string) =>
  `${start} – ${end ?? open}`;

function FactRows({
  facts,
  parent,
  edit,
}: {
  facts: ProfileFact[];
  parent: FactParent;
  edit: (editing: Editing) => void;
}) {
  return (
    <>
      {facts.map((fact) => (
        <ListRow
          key={fact.id}
          title={fact.text}
          meta={fact.skills.map((s) => s.name).join(" · ") || undefined}
          tags={
            fact.verified ? undefined : (
              <Badge tone="warning" size="sm">
                Unverified
              </Badge>
            )
          }
          onClick={() => edit({ kind: "fact", item: fact, parent })}
        />
      ))}
      <ListRow
        title={<span className="text-ink-muted">Add a fact</span>}
        onClick={() => edit({ kind: "fact", parent })}
      />
    </>
  );
}

export function ProfileRecords({
  profile,
  edit,
}: {
  profile: ProfileResponse;
  edit: (editing: Editing) => void;
}) {
  const { person, links } = profile;
  const contact = [person.headline, person.location, person.timezone]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-4 pt-4 tablet:gap-5">
      <Group title="About">
        <ListRow
          title={person.fullName || "Add your name"}
          meta={contact || undefined}
          onClick={() => edit({ kind: "person" })}
        />
        <ListRow
          title="Languages"
          meta={
            person.languages.map((l) => `${l.name} ${l.level}`).join(" · ") ||
            "None yet"
          }
          onClick={() => edit({ kind: "person" })}
        />
      </Group>

      <Group title="Links" count={links.length}>
        {links.map((link) => (
          <ListRow
            key={link.id}
            title={link.label}
            meta={<span className="mono">{link.url}</span>}
            onClick={() => edit({ kind: "links" })}
          />
        ))}
        <ListRow
          title={
            <span className="text-ink-muted">
              {links.length ? "Edit links" : "Add a link"}
            </span>
          }
          onClick={() => edit({ kind: "links" })}
        />
      </Group>

      <div className="flex items-center justify-between pl-1">
        <h2 className="kicker">Experience</h2>
        <Button
          size="sm"
          variant="soft"
          icon="plus"
          onClick={() => edit({ kind: "experience" })}
        >
          Add experience
        </Button>
      </div>
      {profile.experiences.map(({ facts, ...experience }) => {
        const label = `${experience.title} · ${experience.organization}`;
        return (
          <Group key={experience.id} title={label} count={facts.length}>
            <ListRow
              title={label}
              meta={[
                span(experience.start, experience.end, "now"),
                experience.location,
              ]
                .filter(Boolean)
                .join(" · ")}
              onClick={() => edit({ kind: "experience", item: experience })}
            />
            <FactRows
              facts={facts}
              parent={{ kind: "experience", id: experience.id, label }}
              edit={edit}
            />
          </Group>
        );
      })}

      <div className="flex items-center justify-between pl-1">
        <h2 className="kicker">Education</h2>
        <Button
          size="sm"
          variant="soft"
          icon="plus"
          onClick={() => edit({ kind: "education" })}
        >
          Add education
        </Button>
      </div>
      {profile.education.map(({ facts, ...education }) => {
        const label = `${education.degree} · ${education.institution}`;
        return (
          <Group key={education.id} title={label} count={facts.length}>
            <ListRow
              title={label}
              meta={[
                span(education.start, education.end, "in progress"),
                education.field,
              ]
                .filter(Boolean)
                .join(" · ")}
              onClick={() => edit({ kind: "education", item: education })}
            />
            <FactRows
              facts={facts}
              parent={{ kind: "education", id: education.id, label }}
              edit={edit}
            />
          </Group>
        );
      })}

      <Group title="Other facts" count={profile.facts.length}>
        <FactRows facts={profile.facts} parent={null} edit={edit} />
      </Group>
    </div>
  );
}

/** The sheet for what's being edited; a fresh form each time it opens. */
export function EditSheets({
  editing,
  profile,
  onClose,
  onDone,
}: {
  editing: (Editing & { opened: number }) | null;
  profile: ProfileResponse | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const base = { open: editing !== null, onClose, onDone };
  const [last, setLast] = useState(editing);
  if (editing && editing !== last) setLast(editing);
  const shown = editing ?? last;
  if (!shown) return null;
  const key = shown.opened;
  switch (shown.kind) {
    case "person":
      return (
        profile && <PersonSheet key={key} {...base} person={profile.person} />
      );
    case "links":
      return (
        profile && <LinksSheet key={key} {...base} links={profile.links} />
      );
    case "experience":
      return <ExperienceSheet key={key} {...base} experience={shown.item} />;
    case "education":
      return <EducationSheet key={key} {...base} education={shown.item} />;
    case "fact":
      return (
        <FactSheet
          key={key}
          {...base}
          fact={shown.item}
          parent={shown.parent}
        />
      );
  }
}
