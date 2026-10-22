// A wait nothing may interrupt (an exam being written or graded): a native
// modal <dialog> over the whole screen, sheets included, with a spinner and
// what's happening. The page behind is inert; Escape is ignored. It closes
// when `open` turns false.
import { type ReactNode, useEffect, useId, useRef } from "react";

export interface BusyOverlayProps {
  open: boolean;
  /** What's happening, e.g. "Writing your exam…". */
  title: ReactNode;
  /** How long, or what to do meanwhile. */
  children?: ReactNode;
}

export function BusyOverlay({ open, title, children }: BusyOverlayProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Escape asks a modal dialog to close: this one can't be.
    const hold = (event: Event) => event.preventDefault();
    dialog.addEventListener("cancel", hold);
    return () => {
      dialog.removeEventListener("cancel", hold);
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="busy"
      aria-labelledby={titleId}
      aria-busy="true"
    >
      <div className="busy__panel">
        <span className="spinner busy__spinner" aria-hidden="true" />
        <p id={titleId} className="busy__title" role="status">
          {title}
        </p>
        {children && <p className="busy__body">{children}</p>}
      </div>
    </dialog>
  );
}
