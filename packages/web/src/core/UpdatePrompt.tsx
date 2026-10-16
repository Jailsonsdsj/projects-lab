import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { useToast } from "../components/ui";

/**
 * Registers the service worker. A new version waits until the owner chooses
 * Reload in the toast, so nothing reloads in the middle of a read; if the toast
 * goes unanswered, the new version takes over at the next launch.
 */
export function UpdatePrompt() {
  const { show } = useToast();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh) return;
    show({
      message: "A new version of Projects Lab is ready.",
      tone: "info",
      action: { label: "Reload", onClick: () => updateServiceWorker(true) },
    });
  }, [needRefresh, show, updateServiceWorker]);

  return null;
}
