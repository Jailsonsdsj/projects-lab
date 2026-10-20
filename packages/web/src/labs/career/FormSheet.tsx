// A sheet that edits one profile record: its fields, Save, and (for an
// existing record) Remove behind a confirmation. Every write carries its own
// Idempotency-Key. A refusal the API explains (400, 404, 409) shows its
// message; a failure or being offline keeps what was typed, under a banner.
import { IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import { type ReactNode, useState } from "react";
import { Banner, Button, Dialog, Sheet } from "../../components/ui";
import { apiFetch } from "../../core/api";
import { type FailureKind, failureKind } from "../../core/failure";

/** A write to /api/career with a fresh Idempotency-Key. */
export function send(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: BodyInit | object,
  contentType = "application/json",
): Promise<Response> {
  const raw =
    body === undefined ||
    typeof body === "string" ||
    body instanceof Blob ||
    body instanceof ArrayBuffer;
  return apiFetch(path, {
    method,
    headers: {
      [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID(),
      ...(body === undefined ? {} : { "Content-Type": contentType }),
    },
    ...(body === undefined
      ? {}
      : { body: raw ? (body as BodyInit) : JSON.stringify(body) }),
  });
}

/** The API's own words for a refusal ({ error, message }), if it gave some. */
async function refusal(response: Response): Promise<string | null> {
  if (![400, 404, 409].includes(response.status)) return null;
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  return typeof body?.message === "string" ? body.message : null;
}

export interface FormSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Runs the write; null means the form isn't ready (its fields say why). */
  onSave: () => Promise<Response> | null;
  /** After a write that worked: refresh and close. */
  onDone: (message: string) => void;
  /** Instead of onDone, when the caller needs the response (e.g. a new ID). */
  onSaved?: (response: Response) => void | Promise<void>;
  saveLabel?: string;
  /** For an existing record. */
  remove?: {
    label: string;
    confirm: string;
    detail?: string;
    run: () => Promise<Response>;
  };
  children: ReactNode;
}

export function FormSheet({
  open,
  title,
  onClose,
  onSave,
  onDone,
  onSaved,
  saveLabel = "Save",
  remove,
  children,
}: FormSheetProps) {
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [failed, setFailed] = useState<FailureKind | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(
    kind: "save" | "remove",
    write: () => Promise<Response> | null,
  ) {
    setFailed(null);
    setRefused(null);
    const pending = write();
    if (!pending) return;
    setBusy(kind);
    try {
      const response = await pending;
      if (response.ok)
        return kind === "save" && onSaved
          ? await onSaved(response)
          : onDone(kind === "save" ? "Saved" : "Removed");
      const message = await refusal(response);
      if (message) setRefused(message);
      else setFailed("error");
    } catch (error) {
      setFailed(failureKind(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {remove && (
            <Button
              variant="ghost"
              tone="danger"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              {remove.label}
            </Button>
          )}
          <Button loading={busy === "save"} onClick={() => run("save", onSave)}>
            {busy === "save" ? "Saving" : saveLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {refused && (
          <Banner tone="danger" title="Not saved.">
            {refused}
          </Banner>
        )}
        {failed === "error" && (
          <Banner tone="danger" title="Couldn't save it.">
            What you typed is still here. Try again in a moment.
          </Banner>
        )}
        {failed === "offline" && (
          <Banner tone="offline" title="You're offline.">
            What you typed is still here. Save it once you're back online.
          </Banner>
        )}
        {children}
      </div>
      {remove && (
        <Dialog
          open={confirming}
          onClose={() => setConfirming(false)}
          tone="danger"
          icon="trash"
          title={remove.confirm}
          actions={
            <>
              <Button
                variant="outline"
                tone="neutral"
                onClick={() => setConfirming(false)}
              >
                Keep it
              </Button>
              <Button
                tone="danger"
                loading={busy === "remove"}
                onClick={() => {
                  setConfirming(false);
                  void run("remove", remove.run);
                }}
              >
                {remove.label}
              </Button>
            </>
          }
        >
          {remove.detail}
        </Dialog>
      )}
    </Sheet>
  );
}
