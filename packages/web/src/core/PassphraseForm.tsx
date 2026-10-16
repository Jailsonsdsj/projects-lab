import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Banner, Button, Icon, Input } from "../components/ui";
import type { FailureKind } from "./failure";

/** What one passphrase attempt came to, as both sign-in screens see it. */
export type PassphraseAttempt =
  | { ok: true }
  | {
      ok: false;
      reason: "wrong_passphrase" | "not_provisioned" | FailureKind;
    }
  | { ok: false; reason: "too_many_attempts"; retryAfterSeconds: number };

type Notice = Exclude<
  Extract<PassphraseAttempt, { ok: false }>["reason"],
  "wrong_passphrase"
>;

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/**
 * The bundle's passphrase form (login and Claude's sign-in): show/hide, wrong
 * passphrase, signing in, and the Banner for a rate limit (form locked until
 * the server's window ends), no owner, offline or error. The screen places
 * `banner` above its header and `form` below it.
 */
export function usePassphraseForm(
  attempt: (passphrase: string) => Promise<PassphraseAttempt>,
  onSuccess: () => void,
): { banner: ReactNode; form: ReactNode } {
  const [passphrase, setPassphrase] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lockedFor, setLockedFor] = useState(0); // seconds, from Retry-After

  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setTimeout(() => {
      setLockedFor(0);
      setNotice(null);
    }, lockedFor * 1000);
    return () => clearTimeout(timer);
  }, [lockedFor]);

  const locked = lockedFor > 0;
  const disabled = busy || locked;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || !passphrase) return;
    setBusy(true);
    setWrong(false);
    setNotice(null);
    const result = await attempt(passphrase);
    setBusy(false);
    if (result.ok) {
      onSuccess();
    } else if (result.reason === "wrong_passphrase") {
      setWrong(true);
    } else {
      setNotice(result.reason);
      if (result.reason === "too_many_attempts")
        setLockedFor(result.retryAfterSeconds);
    }
  }

  const banners: Record<Notice, ReactNode> = {
    too_many_attempts: (
      <Banner tone="danger">
        Too many attempts, try again in{" "}
        <span className="mono">{minutes(lockedFor)}</span>{" "}
        {minutes(lockedFor) === 1 ? "minute" : "minutes"}.
      </Banner>
    ),
    not_provisioned: (
      <Banner tone="danger" title="No owner yet.">
        Run <span className="mono">pnpm provision</span> to create one.
      </Banner>
    ),
    offline: (
      <Banner tone="offline" title="You're offline.">
        Signing in needs a connection.
      </Banner>
    ),
    error: (
      <Banner tone="danger" title="Couldn't sign in.">
        Try again in a moment.
      </Banner>
    ),
  };

  const form = (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
      <Input
        label="Passphrase"
        type={shown ? "text" : "password"}
        autoComplete="current-password"
        value={passphrase}
        onChange={(event) => {
          setPassphrase(event.target.value);
          setWrong(false);
        }}
        error={wrong ? "Wrong passphrase" : undefined}
        disabled={disabled}
        action={
          !disabled && (
            <button
              className="input__action"
              type="button"
              aria-label={shown ? "Hide passphrase" : "Show passphrase"}
              aria-pressed={shown}
              onClick={() => setShown((s) => !s)}
            >
              <Icon name={shown ? "eye-off" : "eye"} />
            </button>
          )
        }
      />
      <Button type="submit" size="lg" block loading={busy} disabled={locked}>
        {busy ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );

  return { banner: notice ? banners[notice] : null, form };
}
