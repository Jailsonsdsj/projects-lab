import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** Compact title in the bar; omit when the bar holds the LabSwitcher. */
  title?: ReactNode;
  /** The title is the screen's heading (h1) unless the content brings its own
   *  (a course has its H1), where it's a plain label, as the bundle's reader. */
  titleIsHeading?: boolean;
  /** Leading control: a back button or the LabSwitcher. */
  leading?: ReactNode;
  actions?: ReactNode;
}

/** The screen's top bar (`.phead`). */
export function PageHeader({
  title,
  titleIsHeading = true,
  leading,
  actions,
}: PageHeaderProps) {
  return (
    <header className="phead">
      {leading}
      {title &&
        (titleIsHeading ? (
          <h1 className="phead__title">{title}</h1>
        ) : (
          <span className="phead__title">{title}</span>
        ))}
      {actions && <div className="phead__actions">{actions}</div>}
    </header>
  );
}

export interface PageTitleProps {
  title: ReactNode;
  subtitle?: ReactNode;
}

/** The large title at the top of a screen's content (`.phead__large`). */
export function PageTitle({ title, subtitle }: PageTitleProps) {
  return (
    <div className="phead__large">
      <h1>{title}</h1>
      {subtitle && <span className="phead__sub">{subtitle}</span>}
    </div>
  );
}
