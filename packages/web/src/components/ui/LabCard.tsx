import { Button } from "./Button";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { linkClick, type Navigate } from "./nav";
import { Skeleton } from "./Skeleton";

export interface LabCardData {
  stats: readonly { value: string; label: string }[];
  foot?: { label: string; value: string };
}

export type LabCardState =
  | { status: "loading" }
  | { status: "loaded"; data: LabCardData }
  /** The lab has nothing yet: a normal card that says what to do next. */
  | { status: "empty"; text: string }
  /** The read failed: a muted card with Retry. Never shown for an empty lab. */
  | { status: "error"; onRetry: () => void };

export interface LabCardProps {
  /** Sets the card's data-lab, so it paints in that lab's accent on Home. */
  lab: string;
  name: string;
  icon: IconName;
  href: string;
  state: LabCardState;
  onNavigate?: Navigate;
}

function Head({
  name,
  icon,
  link,
}: {
  name: string;
  icon: IconName;
  link: boolean;
}) {
  return (
    <span className="labcard__head">
      <span className="labsw__mark" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="labcard__name">{name}</span>
      {link && <Icon name="chevron-right" className="labcard__chev" />}
    </span>
  );
}

/** Home's per-lab summary (`.labcard`), in loading, loaded, empty and error states. */
export function LabCard({
  lab,
  name,
  icon,
  href,
  state,
  onNavigate,
}: LabCardProps) {
  if (state.status === "loading") {
    return (
      <section
        className="labcard"
        data-lab={lab}
        aria-busy="true"
        aria-label={name}
      >
        <span className="labcard__head">
          <Skeleton shape="circle" size="var(--size-lab-mark)" />
          <Skeleton shape="title" width="40%" />
        </span>
        <span className="labcard__stats">
          {[0, 1, 2].map((i) => (
            <span key={i} className="labcard__stat">
              <Skeleton shape="title" width="50%" />
              <Skeleton shape="text" width="75%" />
            </span>
          ))}
        </span>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <div className="labcard is-muted" data-lab={lab}>
        <Head name={name} icon={icon} link={false} />
        <span className="field__error">
          <Icon name="alert-circle" />
          Couldn't load the summary.
        </span>
        <Button
          variant="outline"
          tone="neutral"
          size="sm"
          onClick={state.onRetry}
          className="labcard__retry"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <a
      className="labcard"
      data-lab={lab}
      href={href}
      onClick={linkClick(href, onNavigate)}
    >
      <Head name={name} icon={icon} link />
      {state.status === "empty" ? (
        <span className="labcard__lbl">{state.text}</span>
      ) : (
        <>
          <span className="labcard__stats">
            {state.data.stats.slice(0, 3).map((stat) => (
              <span key={stat.label} className="labcard__stat">
                <span className="labcard__num">{stat.value}</span>
                <span className="labcard__lbl">{stat.label}</span>
              </span>
            ))}
          </span>
          {state.data.foot && (
            <span className="labcard__foot">
              {state.data.foot.label} <b>{state.data.foot.value}</b>
            </span>
          )}
        </>
      )}
    </a>
  );
}
