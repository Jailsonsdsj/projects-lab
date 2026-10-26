import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cx } from "./cx";

export interface SlideProps {
  open: boolean;
  /** For the control's aria-controls. */
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A body that slides open and shut (`.slide` in app-components.css): its
 * height animates to its content's, measured and kept current while open (a
 * banner appearing slides in too). Closed, it's hidden and inert: no taps, no
 * Tab, nothing read aloud. Not a grid row from 0fr to 1fr: WebKit applies the
 * fraction twice and leaves a gap below the content mid-slide.
 */
export function Slide({ open, id, className, children }: SlideProps) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    // No observer (an old browser, or jsdom): the height at mount stands.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      id={id}
      className={cx("slide", open && "is-open", className)}
      style={{ "--slide-height": `${height}px` } as CSSProperties}
      inert={!open}
      aria-hidden={!open || undefined}
    >
      <div ref={inner} className="slide__inner">
        {children}
      </div>
    </div>
  );
}
