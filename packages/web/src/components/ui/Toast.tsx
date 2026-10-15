import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "./Button";
import { cssDurationMs } from "./css-duration";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export type ToastTone = "neutral" | "success" | "warning" | "danger" | "info";

/** The bundle's pairings; a neutral toast brings its own icon, if any. */
const TOAST_ICON: Partial<Record<ToastTone, IconName>> = {
  success: "check-circle",
  warning: "warning",
  danger: "alert-circle",
  info: "info",
};

export interface ToastInput {
  message: ReactNode;
  tone?: ToastTone;
  icon?: IconName;
  /** Undo / Retry. A toast with an action is held longer. */
  action?: { label: string; onClick: () => void };
}

interface ToastEntry extends ToastInput {
  id: number;
  leaving: boolean;
}

interface ToastApi {
  show: (toast: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast() needs a <ToastProvider> above it");
  return api;
}

/** Holds the toast list and renders the region they appear in. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((all) =>
      all.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((all) => [...all, { ...toast, id, leaving: false }]);
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={dismiss}
            onGone={remove}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

let warnedMissingToken = false;

function ToastItem({
  toast,
  onDismiss,
  onGone,
}: {
  toast: ToastEntry;
  /** Stable (useCallback) so a new toast never restarts this one's timer. */
  onDismiss: (id: number) => void;
  onGone: (id: number) => void;
}) {
  const { id } = toast;
  const tone = toast.tone ?? "neutral";
  const icon = TOAST_ICON[tone] ?? toast.icon;
  const [paused, setPaused] = useState(false);

  // Hold for the token's time, restarting after a pause (hover or focus), so
  // nobody loses a message they are reading or about to act on.
  useEffect(() => {
    if (toast.leaving || paused) return;
    const token = toast.action
      ? "--duration-toast-hold-action"
      : "--duration-toast-hold";
    const hold = cssDurationMs(token);
    if (hold === null) {
      if (!warnedMissingToken) {
        console.warn(`${token} is not set; toasts stay until dismissed`);
        warnedMissingToken = true;
      }
      return;
    }
    const timer = setTimeout(() => onDismiss(id), hold);
    return () => clearTimeout(timer);
  }, [id, toast.leaving, toast.action, paused, onDismiss]);

  // Leave with the exit animation, then unmount.
  useEffect(() => {
    if (!toast.leaving) return;
    const timer = setTimeout(
      () => onGone(id),
      cssDurationMs("--duration-toast-out") ?? 0,
    );
    return () => clearTimeout(timer);
  }, [id, toast.leaving, onGone]);

  return (
    // Pausing on hover or focus is a reading-time aid (WCAG 2.2.1), not an
    // interaction; the toast's buttons are the interactive parts.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above
    <div
      className={cx(
        "toast",
        tone !== "neutral" && `toast--${tone}`,
        toast.leaving && "is-leaving",
      )}
      role={tone === "danger" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {icon && <Icon name={icon} />}
      <span className="toast__text">{toast.message}</span>
      {toast.action && (
        <Button
          variant="ghost"
          tone="neutral"
          size="sm"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(id);
          }}
        >
          {toast.action.label}
        </Button>
      )}
      <Button
        variant="ghost"
        tone="neutral"
        size="sm"
        iconOnly
        icon="close"
        aria-label="Dismiss"
        onClick={() => onDismiss(id)}
      />
    </div>
  );
}
