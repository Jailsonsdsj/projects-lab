import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { Banner } from "../components/ui";
import { usePassphraseForm } from "./PassphraseForm";
import type { LoginState } from "./RequireSession";
import { endSession, isExpired, useSessionToken } from "./session";
import { signIn } from "./sign-in";

/**
 * The bundle's login screen: default, session expired, wrong passphrase,
 * rate-limited, signing in. The KDF runs here, in the browser.
 */
export function LoginScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { from, expired } = (location.state ?? {}) as LoginState;
  const token = useSessionToken();
  const { banner, form } = usePassphraseForm(signIn, () =>
    navigate(from ?? "/", { replace: true }),
  );

  useEffect(() => {
    document.documentElement.dataset.lab = "platform";
  }, []);

  // A token that expired while the app was closed: drop it (and its cache).
  useEffect(() => {
    if (token && isExpired(token)) endSession("expired");
  }, [token]);

  if (token && !isExpired(token)) return <Navigate to={from ?? "/"} replace />;

  return (
    <div className="mx-auto w-full max-w-(--size-form)">
      {(banner || expired) && (
        <div className="px-4 pt-4">
          {banner ?? (
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
        {form}
      </main>
    </div>
  );
}
