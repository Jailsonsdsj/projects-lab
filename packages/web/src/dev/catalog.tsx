// Every component in components/ui, with labelled examples that together cover
// its variants × states (D-06). /dev/ui renders this; a test fails when an
// exported component has no entry. Hover, pressed and focus are real CSS states:
// try them with a pointer or the keyboard.
import { type ReactNode, useState } from "react";
import {
  BADGE_ICON,
  Badge,
  type BadgeTone,
  BottomTabs,
  Button,
  type ButtonTone,
  type ButtonVariant,
  Checkbox,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  ICONS,
  Icon,
  type IconName,
  ImageTile,
  Input,
  LabCard,
  LabSwitcher,
  OptionsMenu,
  PageHeader,
  PageTitle,
  ProgressBar,
  Prose,
  Sheet,
  SideRail,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
} from "../components/ui";

export interface Example {
  label: string;
  node: ReactNode;
}

export interface CatalogEntry {
  /** The export's name in components/ui. */
  name: string;
  summary: string;
  /** Shown at its natural width (buttons, badges…); block components fill the cell. */
  inline?: boolean;
  examples: readonly Example[];
}

const noop = () => {};
/** A transparent 1 × 1 GIF: a photo that loads, with no colour literal. */
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function product<A, B>(as: readonly A[], bs: readonly B[]): [A, B][] {
  return as.flatMap((a) => bs.map((b): [A, B] => [a, b]));
}

const VARIANTS: ButtonVariant[] = ["solid", "soft", "outline", "ghost"];
const TONES: ButtonTone[] = ["accent", "neutral", "danger"];
const BUTTON_STATES = ["default", "disabled", "loading"] as const;
const BADGE_TONES: BadgeTone[] = [
  "neutral",
  "accent",
  ...(Object.keys(BADGE_ICON) as BadgeTone[]),
  "p1",
  "p2",
  "p3",
];

const LABS = [
  {
    id: "platform",
    name: "Home",
    description: "Both labs at a glance",
    icon: "home",
    href: "#home",
  },
  {
    id: "study",
    name: "Study Lab",
    description: "Backlog, courses, grades",
    icon: "book",
    href: "#study",
  },
  {
    id: "career",
    name: "Career Lab",
    description: "Profile, skills, job readiness",
    icon: "briefcase",
    href: "#career",
  },
] as const;

const TABS = [
  { label: "Backlog", icon: "list", href: "#backlog", current: true, count: 8 },
  { label: "Courses", icon: "book", href: "#courses", count: 2 },
  { label: "Grades", icon: "award", href: "#grades", count: 1 },
] as const;

const SAMPLE_COURSE = `## Big-O in one lesson

**Big-O** describes how work grows with the input, written \`O(n)\`.

> **Tip:** A loop inside a loop over the same data? Ask whether a \`Map\` can replace the inner one.

> **Warning:** \`O(n²)\` on 10,000 items is 100,000,000 steps.

| Class | Example | n = 1,000 |
|---|---|---:|
| \`O(1)\` | Read \`arr[i]\` | 1 |
| \`O(n)\` | One loop | 1,000 |

\`\`\`ts
// O(n + m): index once, look up
const byId = new Map(users.map((u) => [u.id, u]));
\`\`\`

1. Two nested loops over n items are roughly…
   - A) O(n)
   - B) O(n²)
   - C) O(log n)
`;

function TabsDemo() {
  const [value, setValue] = useState("all");
  return (
    <Tabs
      label="Filter by status"
      value={value}
      onChange={setValue}
      items={[
        { id: "all", label: "All", count: 8 },
        { id: "todo", label: "Not started", count: 6 },
        { id: "doing", label: "In progress", count: 1 },
        { id: "archived", label: "Archived", disabled: true },
      ]}
    />
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" tone="neutral" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Filter backlog"
        footer={
          <>
            <Button
              variant="outline"
              tone="neutral"
              onClick={() => setOpen(false)}
            >
              Reset
            </Button>
            <Button onClick={() => setOpen(false)}>Show 6</Button>
          </>
        }
      >
        <Chip pressed count={6}>
          Not started
        </Chip>
      </Sheet>
    </>
  );
}

function DialogDemo({
  tone,
  stretch,
}: {
  tone: "accent" | "danger";
  stretch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        tone={tone === "danger" ? "danger" : "neutral"}
        onClick={() => setOpen(true)}
      >
        Open {tone} dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={
          tone === "danger" ? "Revoke Claude Code?" : "Log out of Projects Lab?"
        }
        icon={tone === "danger" ? "trash" : "log-out"}
        tone={tone}
        stretchActions={stretch}
        actions={
          <>
            <Button
              variant="outline"
              tone="neutral"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              tone={tone === "danger" ? "danger" : "neutral"}
              onClick={() => setOpen(false)}
            >
              {tone === "danger" ? "Revoke" : "Log out"}
            </Button>
          </>
        }
      >
        {tone === "danger"
          ? "It loses access to your Projects Lab straight away."
          : "You'll need your passphrase to sign back in on this device."}
      </Dialog>
    </>
  );
}

function ToastDemo() {
  const toast = useToast();
  const tones = ["neutral", "success", "warning", "danger", "info"] as const;
  return (
    <div className="ks-row">
      {tones.map((tone) => (
        <Button
          key={tone}
          variant="soft"
          tone="neutral"
          size="sm"
          onClick={() =>
            toast.show({ tone, icon: "copy", message: `A ${tone} toast` })
          }
        >
          {tone}
        </Button>
      ))}
      <Button
        variant="soft"
        tone="neutral"
        size="sm"
        onClick={() =>
          toast.show({
            tone: "success",
            message: "Removed from backlog",
            action: { label: "Undo", onClick: noop },
          })
        }
      >
        with action
      </Button>
    </div>
  );
}

export const CATALOG: readonly CatalogEntry[] = [
  {
    name: "Button",
    inline: true,
    summary: "variant × tone × state, then size, block and icon-only.",
    examples: [
      ...product(VARIANTS, TONES).flatMap(([variant, tone]) =>
        BUTTON_STATES.map((state) => ({
          label: `${variant} · ${tone} · ${state}`,
          node: (
            <Button
              variant={variant}
              tone={tone}
              disabled={state === "disabled"}
              loading={state === "loading"}
            >
              {state === "loading" ? "Saving" : "Save"}
            </Button>
          ),
        })),
      ),
      ...(["sm", "md", "lg"] as const).map((size) => ({
        label: `size ${size}`,
        node: (
          <Button size={size} icon="plus">
            Add
          </Button>
        ),
      })),
      { label: "block", node: <Button block>Sign in</Button> },
      {
        label: "icon-only",
        node: (
          <Button
            variant="ghost"
            tone="neutral"
            iconOnly
            icon="more"
            aria-label="More options"
          />
        ),
      },
    ],
  },
  {
    name: "Field",
    summary: "Label, hint and error around any control (here a native select).",
    examples: [
      {
        label: "with a select",
        node: (
          <Field label="Area" hint="Where the course goes in the backlog.">
            {(c) => (
              <div className="input">
                <select
                  id={c.id}
                  aria-describedby={c.describedBy}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose an area
                  </option>
                  <option>Frontend</option>
                  <option>Databases</option>
                </select>
                <Icon name="chevron-down" className="input__chev" />
              </div>
            )}
          </Field>
        ),
      },
    ],
  },
  {
    name: "Input",
    summary: "Text input in a Field: every state the design draws.",
    examples: [
      {
        label: "default",
        node: (
          <Input label="Job title" placeholder="Senior Full-Stack Engineer" />
        ),
      },
      {
        label: "filled · optional · hint",
        node: (
          <Input
            label="Company"
            optional
            defaultValue="Acme"
            hint="Shown on the readiness card."
          />
        ),
      },
      {
        label: "required",
        node: <Input label="Email" required type="email" />,
      },
      {
        label: "invalid",
        node: (
          <Input
            label="LinkedIn URL"
            defaultValue="linkedin/sam"
            error="Start with https://"
          />
        ),
      },
      {
        label: "disabled",
        node: <Input label="Client ID" defaultValue="claude-ai" disabled />,
      },
      {
        label: "search",
        node: (
          <Input
            label="Search"
            search
            icon="search"
            placeholder="Filter by title or ID"
          />
        ),
      },
      {
        label: "with action",
        node: (
          <Input
            label="Passphrase"
            type="password"
            defaultValue="correct horse"
            action={
              <button
                type="button"
                className="input__action"
                aria-label="Show passphrase"
              >
                <Icon name="eye" />
              </button>
            }
          />
        ),
      },
    ],
  },
  {
    name: "Textarea",
    summary: "Multi-line input in a Field.",
    examples: [
      {
        label: "default · hint",
        node: (
          <Textarea
            label="Why this company?"
            placeholder="Two or three sentences."
            hint="0 / 600"
          />
        ),
      },
      {
        label: "invalid",
        node: <Textarea label="Notes" error="Write at least one sentence." />,
      },
      {
        label: "disabled",
        node: (
          <Textarea
            label="Notes"
            disabled
            defaultValue="Locked while offline."
          />
        ),
      },
    ],
  },
  {
    name: "Chip",
    inline: true,
    summary: "Filter toggle (aria-pressed), with an optional count.",
    examples: [
      {
        label: "off",
        node: (
          <Chip pressed={false} count={6}>
            Not started
          </Chip>
        ),
      },
      {
        label: "on",
        node: (
          <Chip pressed count={1}>
            In progress
          </Chip>
        ),
      },
      {
        label: "disabled",
        node: (
          <Chip pressed={false} disabled>
            Archived
          </Chip>
        ),
      },
    ],
  },
  {
    name: "Checkbox",
    inline: true,
    summary: "A --size-touch row around a --size-checkbox box.",
    examples: [
      { label: "unchecked", node: <Checkbox>Keep me signed in</Checkbox> },
      {
        label: "checked",
        node: <Checkbox defaultChecked>Keep me signed in</Checkbox>,
      },
      { label: "mixed", node: <Checkbox mixed>Select all</Checkbox> },
      { label: "invalid", node: <Checkbox invalid>Accept the terms</Checkbox> },
      { label: "disabled", node: <Checkbox disabled>Sync offline</Checkbox> },
      {
        label: "disabled · checked",
        node: (
          <Checkbox disabled defaultChecked>
            Sync offline
          </Checkbox>
        ),
      },
    ],
  },
  {
    name: "Badge",
    inline: true,
    summary: "Every tone at both sizes; semantic tones carry their icon.",
    examples: product(BADGE_TONES, ["md", "sm"] as const).map(
      ([tone, size]) => ({
        label: `${tone} · ${size}`,
        node: (
          <Badge tone={tone} size={size} mono={tone.startsWith("p")}>
            {tone.startsWith("p") ? tone.toUpperCase() : tone}
          </Badge>
        ),
      }),
    ),
  },
  {
    name: "Tabs",
    summary: "ARIA tabs: arrows, Home and End; disabled tabs are skipped.",
    examples: [{ label: "with counts and a disabled tab", node: <TabsDemo /> }],
  },
  {
    name: "Sheet",
    inline: true,
    summary: "Bottom sheet on a native modal dialog.",
    examples: [{ label: "open / close", node: <SheetDemo /> }],
  },
  {
    name: "Dialog",
    inline: true,
    summary: "Confirmation on a native modal dialog; Escape closes.",
    examples: [
      { label: "accent", node: <DialogDemo tone="accent" /> },
      {
        label: "danger · stretched actions",
        node: <DialogDemo tone="danger" stretch />,
      },
    ],
  },
  {
    name: "OptionsMenu",
    inline: true,
    summary:
      "Anchored popover menu: arrows, Escape, disabled and danger items.",
    examples: [
      {
        label: "with heading, disabled and danger items",
        node: (
          <OptionsMenu
            label="Options for FE-01"
            heading="FE-01 · Next.js"
            items={[
              { label: "Open course", icon: "book", onSelect: noop },
              { label: "Copy ID", icon: "copy", onSelect: noop },
              {
                label: "Regenerate (offline)",
                icon: "refresh",
                onSelect: noop,
                disabled: true,
              },
              "separator",
              {
                label: "Remove from backlog",
                icon: "trash",
                onSelect: noop,
                danger: true,
              },
            ]}
          />
        ),
      },
    ],
  },
  {
    name: "Toast",
    summary: "Every tone, and one with an action (held longer).",
    examples: [{ label: "show", node: <ToastDemo /> }],
  },
  {
    name: "ProgressBar",
    summary: "Value, size and tone.",
    examples: [
      ...product([0, 40, 100], ["md", "sm"] as const).map(([value, size]) => ({
        label: `${value}% · ${size}`,
        node: <ProgressBar value={value} size={size} label="Lesson progress" />,
      })),
      {
        label: "with head",
        node: (
          <ProgressBar
            value={1}
            max={3}
            label="Lessons"
            caption="Lesson 1 of 3"
            valueText="33%"
          />
        ),
      },
      {
        label: "success",
        node: (
          <ProgressBar
            value={8}
            max={10}
            tone="success"
            label="Grade"
            valueText="8.0"
            caption="Final exam"
          />
        ),
      },
    ],
  },
  {
    name: "EmptyState",
    summary: "A successful answer that happens to be empty.",
    examples: [
      {
        label: "plain",
        node: (
          <EmptyState icon="book" title="Your backlog is empty">
            Ask Claude to plan a topic and it will add courses here.
          </EmptyState>
        ),
      },
      {
        label: "with action",
        node: (
          <EmptyState
            icon="search"
            title='No matches for "graphql"'
            actions={<Button variant="soft">Clear search</Button>}
          >
            Nothing in Not started has that word.
          </EmptyState>
        ),
      },
    ],
  },
  {
    name: "ErrorState",
    summary: "A failed read: error or offline. Never 'nothing here yet'.",
    examples: [
      {
        label: "error · code · retry",
        node: (
          <ErrorState
            title="Couldn't load your backlog"
            code="503 · req 7f3a-19c2"
            actions={<Button>Retry</Button>}
          >
            The server didn't answer. Nothing you saved is lost.
          </ErrorState>
        ),
      },
      {
        label: "offline",
        node: (
          <ErrorState kind="offline" title="Not saved for offline">
            This lesson hasn't been opened on this device yet.
          </ErrorState>
        ),
      },
    ],
  },
  {
    name: "Skeleton",
    summary: "Placeholder shapes; still under reduced motion.",
    examples: [
      { label: "text", node: <Skeleton shape="text" width="75%" /> },
      { label: "title", node: <Skeleton shape="title" width="40%" /> },
      {
        label: "circle",
        node: <Skeleton shape="circle" size="var(--size-avatar)" />,
      },
      {
        label: "block",
        node: <Skeleton shape="block" width="100%" size="var(--size-row)" />,
      },
    ],
  },
  {
    name: "ImageTile",
    inline: true,
    summary:
      "Profile photo: loaded, or initials when missing or failed (loading shimmers until the image arrives).",
    examples: [
      { label: "loaded", node: <ImageTile src={PIXEL} name="Sam Rivera" /> },
      {
        label: "no photo · round",
        node: <ImageTile name="Sam Rivera" round />,
      },
      {
        label: "failed · large",
        node: (
          <ImageTile src="/missing-photo.jpg" name="Sam Rivera" size="lg" />
        ),
      },
    ],
  },
  {
    name: "LabCard",
    summary: "Home's per-lab card in each lab's accent.",
    examples: product(
      ["study", "career"] as const,
      ["loading", "loaded", "empty", "error"] as const,
    ).map(([lab, status]) => ({
      label: `${lab} · ${status}`,
      node: (
        <LabCard
          lab={lab}
          name={lab === "study" ? "Study Lab" : "Career Lab"}
          icon={lab === "study" ? "book" : "briefcase"}
          href={`#${lab}`}
          onNavigate={noop}
          state={
            status === "loaded"
              ? {
                  status,
                  data: {
                    stats: [
                      { value: "1", label: "in progress" },
                      { value: "6", label: "not started" },
                      { value: "8.5", label: "avg grade" },
                    ],
                    foot: { label: "Continue", value: "FE-01 Next.js" },
                  },
                }
              : status === "empty"
                ? {
                    status,
                    text: "No courses yet. Ask Claude to plan a topic.",
                  }
                : status === "error"
                  ? { status, onRetry: noop }
                  : { status }
          }
        />
      ),
    })),
  },
  {
    name: "LabSwitcher",
    inline: true,
    summary: "Sheet on phone, popover (block) in the tablet rail.",
    examples: [
      {
        label: "sheet",
        node: (
          <LabSwitcher
            labs={LABS}
            current="study"
            variant="sheet"
            onNavigate={noop}
          />
        ),
      },
      {
        label: "menu · block",
        node: (
          <LabSwitcher
            labs={LABS}
            current="career"
            variant="menu"
            block
            onNavigate={noop}
          />
        ),
      },
    ],
  },
  {
    name: "PageHeader",
    summary: "The screen's top bar.",
    examples: [
      {
        label: "title · back · action",
        node: (
          <PageHeader
            leading={
              <Button
                variant="ghost"
                tone="neutral"
                iconOnly
                icon="chevron-left"
                aria-label="Back"
              />
            }
            title="Big-O Notation"
            actions={
              <Button
                variant="ghost"
                tone="neutral"
                iconOnly
                icon="list"
                aria-label="Outline"
              />
            }
          />
        ),
      },
    ],
  },
  {
    name: "PageTitle",
    summary: "The large title at the top of a screen.",
    examples: [
      {
        label: "with subtitle",
        node: <PageTitle title="Home" subtitle="Your two labs" />,
      },
    ],
  },
  {
    name: "BottomTabs",
    summary: "Phone navigation for the current lab.",
    examples: [
      {
        label: "Study Lab",
        node: (
          <BottomTabs
            label="Study Lab (example)"
            items={TABS}
            onNavigate={noop}
          />
        ),
      },
    ],
  },
  {
    name: "SideRail",
    inline: true,
    summary:
      "Tablet navigation: full, and compact under the landscape breakpoint.",
    examples: (["full", "compact"] as const).map((form) => ({
      label: form,
      node: (
        <SideRail
          label={`Study Lab (${form} example)`}
          section="Study"
          compact={form === "compact"}
          items={TABS}
          footItems={[
            { label: "Settings", icon: "settings", href: "#settings" },
          ]}
          onNavigate={noop}
        />
      ),
    })),
  },
  {
    name: "Icon",
    inline: true,
    summary: "The bundle's 43 icons, then the four sizes.",
    examples: [
      ...(Object.keys(ICONS) as IconName[]).map((name) => ({
        label: name,
        node: <Icon name={name} label={name} />,
      })),
      ...(["xs", "sm", "md", "lg"] as const).map((size) => ({
        label: `size ${size}`,
        node: <Icon name="book" size={size} label={`book ${size}`} />,
      })),
    ],
  },
  {
    name: "Prose",
    summary: "Course Markdown: callouts, table, code, quiz.",
    examples: [
      { label: "sample lesson", node: <Prose markdown={SAMPLE_COURSE} /> },
    ],
  },
];
