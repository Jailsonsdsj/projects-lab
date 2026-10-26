import { PASSPHRASE_MIN_LENGTH } from "@projects-lab/shared";
import { type FormEvent, useRef, useState } from "react";
import { Banner, Button, Icon, Input, Slide, useToast } from "../components/ui";
import {
  type ChangePassphraseResult,
  changePassphrase,
} from "./change-passphrase";

type Failure = Exclude<
  Extract<ChangePassphraseResult, { ok: false }>["reason"],
  "wrong_passphrase" | "session_ended"
>;

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/** The bundle's "Change passphrase" card on Settings (F-11). Its fields stay
 *  closed until the title is tapped; closing (or a change that went through)
 *  clears them, so no passphrase lingers on screen. */
export function ChangePassphraseCard() {
  const { show } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [checked, setChecked] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  // One key per change: kept across a retry that got no answer, so a change
  // that went through is replayed; dropped on any answer or edit.
  const idempotencyKey = useRef<string | null>(null);

  const tooShort = next.length < PASSPHRASE_MIN_LENGTH;
  const mismatch = confirm !== next;

  /** Empties the form and closes it. */
  const close = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setChecked(false);
    setWrong(false);
    setFailure(null);
    idempotencyKey.current = null;
  };

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setWrong(false);
    idempotencyKey.current = null;
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setChecked(true);
    if (saving || !current || tooShort || mismatch) return;
    setSaving(true);
    setWrong(false);
    setFailure(null);
    idempotencyKey.current ??= crypto.randomUUID();
    const result = await changePassphrase(
      current,
      next,
      idempotencyKey.current,
    );
    setSaving(false);
    if (!result.ok && result.reason === "offline") return setFailure("offline");
    idempotencyKey.current = null;

    if (result.ok) {
      close();
      show({
        tone: "success",
        message: "Passphrase changed. Use it next time you sign in.",
      });
    } else if (result.reason === "wrong_passphrase") {
      setWrong(true);
    } else if (result.reason === "too_many_attempts") {
      setRetryAfter(result.retryAfterSeconds);
      setFailure("too_many_attempts");
    } else if (result.reason === "error") {
      setFailure("error");
    }
    // session_ended: the session gate is already on its way to /login.
  }

  return (
    <form
      className="card"
      aria-labelledby="settings-passphrase"
      onSubmit={submit}
      noValidate
    >
      <h2 id="settings-passphrase">
        <button
          type="button"
          className="disclosure"
          aria-expanded={open}
          aria-controls="settings-passphrase-fields"
          disabled={saving}
          onClick={() => (open ? close() : setOpen(true))}
        >
          Change passphrase
          <Icon name="chevron-down" />
        </button>
      </h2>
      <Slide id="settings-passphrase-fields" open={open}>
        {failure === "too_many_attempts" && (
          <Banner tone="danger">
            Too many attempts, try again in{" "}
            <span className="mono">{minutes(retryAfter)}</span>{" "}
            {minutes(retryAfter) === 1 ? "minute" : "minutes"}.
          </Banner>
        )}
        {failure === "offline" && (
          <Banner tone="offline" title="You're offline.">
            Changing the passphrase needs a connection. Save again when you're
            back.
          </Banner>
        )}
        {failure === "error" && (
          <Banner tone="danger" title="Couldn't change the passphrase.">
            Nothing changed. Try again in a moment.
          </Banner>
        )}
        <Input
          label="Current passphrase"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => edit(setCurrent)(e.target.value)}
          error={
            wrong
              ? "Wrong passphrase"
              : checked && !current
                ? "Enter your current passphrase."
                : undefined
          }
          disabled={saving}
        />
        <Input
          label="New passphrase"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => edit(setNext)(e.target.value)}
          hint="A few unrelated words is easier to type and harder to guess."
          error={
            checked && tooShort
              ? `Use at least ${PASSPHRASE_MIN_LENGTH} characters.`
              : undefined
          }
          disabled={saving}
        />
        <Input
          label="Confirm new passphrase"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => edit(setConfirm)(e.target.value)}
          error={
            checked && !tooShort && mismatch
              ? "The passphrases don't match."
              : undefined
          }
          disabled={saving}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving}>
            {saving ? "Saving" : "Save passphrase"}
          </Button>
          <Button
            variant="ghost"
            tone="neutral"
            disabled={saving}
            onClick={close}
          >
            Cancel
          </Button>
        </div>
      </Slide>
    </form>
  );
}
