import { type ReactNode, useId } from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { useModalDialog } from "./useModalDialog";

export interface SheetProps {
  open: boolean;
  /** Called for the close button and Escape; the parent sets `open` to false. */
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Actions pinned under the body; each Button stretches. */
  footer?: ReactNode;
  closeLabel?: string;
}

/** A bottom sheet on a native modal <dialog> (top layer, ::backdrop scrim). */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = "Close",
}: SheetProps) {
  const titleId = useId();
  const { ref, closing } = useModalDialog(
    open,
    onClose,
    "--duration-sheet-out",
  );

  return (
    <dialog
      ref={ref}
      className={cx("sheet", closing && "is-closing")}
      aria-labelledby={titleId}
    >
      <div className="sheet__grabber" aria-hidden="true" />
      <div className="sheet__header">
        <h2 className="sheet__title" id={titleId}>
          {title}
        </h2>
        <Button
          variant="ghost"
          tone="neutral"
          iconOnly
          icon="close"
          aria-label={closeLabel}
          onClick={onClose}
        />
      </div>
      <div className="sheet__body">{children}</div>
      {footer && <div className="sheet__footer">{footer}</div>}
    </dialog>
  );
}
