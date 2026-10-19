import type { MouseEvent, ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface ListRowProps {
  /** A record ID in the mono column ("FE-01"); omit for a row without one. */
  id?: string;
  title: ReactNode;
  /** The second line: level, dates, short facts. */
  meta?: ReactNode;
  /** Badges. On phone they lead the meta line; with `table`, they take their
   *  own columns from tablet up (the bundle's tablet backlog). */
  tags?: ReactNode;
  /** The trailing figure, e.g. a grade. */
  value?: ReactNode;
  /** Tablet columns for `tags` and `value` (the bundle's `.trow`). */
  table?: boolean;
  /** A link or a button when given; otherwise a static row with no chevron. */
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  current?: boolean;
}

/** One row of a Group (`.row`): ID, title and meta, then tags and a value. */
export function ListRow({
  id,
  title,
  meta,
  tags,
  value,
  table,
  href,
  onClick,
  current,
}: ListRowProps) {
  const interactive = href !== undefined || onClick !== undefined;
  const className = cx(
    "row",
    id === undefined && "row--no-id",
    table && "trow",
    !interactive && "row--static",
  );
  const body = (
    <>
      {id !== undefined && <span className="row__id">{id}</span>}
      <span className="row__main">
        <span className="row__title">{title}</span>
        {(meta || tags) && (
          <span className="row__meta">
            {tags && (
              <span className={cx("contents", table && "tablet:hidden")}>
                {tags}
              </span>
            )}
            {meta}
          </span>
        )}
      </span>
      {table && tags && <span className="hidden tablet:contents">{tags}</span>}
      <span className="row__trail">
        {value !== undefined && value !== null && (
          <span className="row__value">{value}</span>
        )}
      </span>
      {interactive && <Icon name="chevron-right" className="row__chev" />}
    </>
  );
  const ariaCurrent = current ? "true" : undefined;
  if (href !== undefined)
    return (
      <a
        className={className}
        href={href}
        onClick={onClick}
        aria-current={ariaCurrent}
      >
        {body}
      </a>
    );
  if (onClick)
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-current={ariaCurrent}
      >
        {body}
      </button>
    );
  return <div className={className}>{body}</div>;
}

export interface GroupProps {
  /** The group's kicker, e.g. an area name. */
  title: string;
  /** Shown beside the title, in mono. */
  count?: number;
  children: ReactNode;
}

/** A titled section of rows (`.group__title` over `.group`). */
export function Group({ title, count, children }: GroupProps) {
  return (
    <section aria-label={title}>
      <div className="group__title">
        <span className="kicker">{title}</span>
        {count !== undefined && <span className="kicker mono">{count}</span>}
      </div>
      <div className="group">{children}</div>
    </section>
  );
}
