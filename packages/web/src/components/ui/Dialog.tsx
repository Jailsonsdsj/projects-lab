import { type ReactNode, useId } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import { useModalDialog } from "./useModalDialog";

export interface DialogProps {
  open: boolean;
  /** Called for Escape; actions call it too. The parent sets `open` to false. */
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  /** Buttons, safest first: the first one gets focus when the dialog opens. */
  actions: ReactNode;
  icon?: IconName;
  tone?: "accent" | "danger";
  /** Actions share the width equally (the bundle's phone layout). */
  stretchActions?: boolean;
}

/** A confirmation dialog on a native modal <dialog> (top layer, ::backdrop scrim). */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  icon,
  tone = "accent",
  stretchActions,
}: DialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const { ref, closing } = useModalDialog(
    open,
    onClose,
    "--duration-dialog-out",
  );

  return (
    <dialog
      ref={ref}
      className={cx(
        "dialog",
        tone === "danger" && "dialog--danger",
        closing && "is-closing",
      )}
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
    >
      {icon && (
        <span className="dialog__icon">
          <Icon name={icon} />
        </span>
      )}
      <h2 className="dialog__title" id={titleId}>
        {title}
      </h2>
      {children && (
        <div className="dialog__body" id={bodyId}>
          {children}
        </div>
      )}
      <div
        className={cx(
          "dialog__footer",
          stretchActions && "dialog__footer--stretch",
        )}
      >
        {actions}
      </div>
    </dialog>
  );
}
