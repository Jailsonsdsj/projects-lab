import { useEffect, useRef, useState } from "react";
import { cssDurationMs } from "./css-duration";

/**
 * Drives a native <dialog> as a modal from a controlled `open` prop:
 * showModal() puts it in the top layer; Escape (the dialog's `cancel` event)
 * asks the parent to close instead of closing at once; closing plays the exit
 * animation for `exitToken` before close(), then returns focus to whatever
 * opened it.
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
  exitToken: `--duration-${string}`,
) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      setClosing(false);
      if (!dialog.open) {
        opener.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        dialog.showModal();
      }
      return;
    }
    if (!dialog.open) return;
    setClosing(true);
    const timer = setTimeout(() => {
      dialog.close();
      setClosing(false);
      opener.current?.focus();
      opener.current = null;
    }, cssDurationMs(exitToken) ?? 0);
    return () => clearTimeout(timer);
  }, [open, exitToken]);

  // Closing on unmount too, so the top layer never keeps an orphan.
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return { ref, closing };
}
