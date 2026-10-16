import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Banner, Button, Icon, Input } from "../components/ui";
import type { LoginState } from "./RequireSession";
import { endSession, isExpired, useSessionToken } from "./session";
import { type SignInResult, signIn } from "./sign-in";

type Notice = Exclude<
  Extract<SignInResult, { ok: false }>["reason"],
  "wrong_passphrase"
>;

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

/**
 * The bundle's login screen: default, session expired, wrong passphrase,
 * rate-limited, signing in. The KDF runs here, in the browser.
 */
export function LoginScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { from, expired } = (location.state ?? {}) as LoginState;
  const token = useSessionToken();

  const [passphrase, setPassphrase] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lockedFor, setLockedFor] = useState(0); // seconds, from Retry-After

  useEffect(() => {
    document.documentElement.dataset.lab = "platform";
  }, []);

  // A token that expired while the app was closed: drop it (and its cache).
  useEffect(() => {
    if (token && isExpired(token)) endSession("expired");
  }, [token]);

  // Rate-limited: the form comes back when the server's window ends.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setTimeout(() => {
      setLockedFor(0);
      setNotice(null);
    }, lockedFor * 1000);
    return () => clearTimeout(timer);
  }, [lockedFor]);

  if (token && !isExpired(token)) return <Navigate to={from ?? "/"} replace />;

  const locked = lockedFor > 0;
  const disabled = busy || locked;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (disabled || !passphrase) return;
    setBusy(true);
    setWrong(false);
    setNotice(null);
    const result = await signIn(passphrase);
    setBusy(false);
    if (result.ok) {
      navigate(from ?? "/", { replace: true });
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

  return (
    <div className="mx-auto w-full max-w-(--size-form)">
      {(notice || expired) && (
        <div className="px-4 pt-4">
          {notice ? (
            banners[notice]
          ) : (
            <Banner tone="warning" title="Session expired.">
              Sign in again to pick up where you left off.
            </Banner>
          )}
        </div>
      )}
      <main className="flex flex-col gap-10 px-6 pt-12">
        <div className="flex flex-col gap-5">
          <span className="brandmark" aria-hidden="true">
            PL
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              Projects Lab
            </h1>
            <p className="text-ink-secondary">Sign in with your passphrase.</p>
          </div>
        </div>
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
          <Button
            type="submit"
            size="lg"
            block
            loading={busy}
            disabled={locked}
          >
            {busy ? "Signing in" : "Sign in"}
          </Button>
        </form>
      </main>
    </div>
  );
}
