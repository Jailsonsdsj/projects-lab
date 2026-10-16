import { useEffect, useState } from "react";
import { Banner, Button, Icon, type IconName } from "../components/ui";
import {
  type DecisionResult,
  decide,
  leaveTo,
  readConsentPage,
  verifyOwner,
} from "./oauth-consent";
import { usePassphraseForm } from "./PassphraseForm";

const SCOPES: { icon: IconName; text: string }[] = [
  {
    icon: "check",
    text: "Read and update your study backlog, courses and grades",
  },
  {
    icon: "check",
    text: "Read and update your career profile, skills and tracked jobs",
  },
  { icon: "eye-off", text: "It can't see or change your passphrase" },
];

function Expired() {
  return (
    <main className="mx-auto flex w-full max-w-(--size-form) flex-col gap-5 px-6 pt-12">
      <span className="brandmark" aria-hidden="true">
        PL
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        This page expired
      </h1>
      <p className="text-ink-secondary">
        Sign-in pages work once, for ten minutes, in the browser that opened
        them. Start again from Claude.
      </p>
    </main>
  );
}

/**
 * Claude's sign-in at /oauth/authorize (F-14b), outside the shell and the
 * session gate: the passphrase first (checked by the Worker, KDF here), then
 * the bundle's consent. Client details come from whoever registered the
 * client, so they're rendered as text and the redirect host is always shown.
 */
export function AuthorizeScreen() {
  const [page] = useState(readConsentPage);
  const [authKey, setAuthKey] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"allow" | "deny" | null>(null);
  const [failure, setFailure] = useState<
    Extract<DecisionResult, { ok: false }>["reason"] | null
  >(null);
  const { banner, form } = usePassphraseForm(
    async (passphrase) => {
      if (!page) return { ok: false, reason: "error" };
      const result = await verifyOwner(passphrase, page.handle);
      if (result.ok && result.authKey) setAuthKey(result.authKey);
      return result;
    },
    () => {},
  );

  useEffect(() => {
    document.documentElement.dataset.lab = "platform";
  }, []);

  if (!page || failure === "consent_expired") return <Expired />;
  const name = page.clientName;

  async function choose(decision: "allow" | "deny") {
    if (!page) return;
    setDeciding(decision);
    setFailure(null);
    const result = await decide(decision, page.handle, authKey);
    if (result.ok) return leaveTo(result.redirectTo); // stays "Allowing" until gone
    setDeciding(null);
    if (result.reason === "wrong_passphrase") setAuthKey(null); // changed meanwhile
    setFailure(result.reason);
  }

  const marks = (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="brandmark">PL</span>
      <Icon name="chevron-right" />
      <span className="client">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    </div>
  );

  if (!authKey)
    return (
      <div className="mx-auto w-full max-w-(--size-form)">
        {banner && <div className="px-4 pt-4">{banner}</div>}
        <main className="flex flex-col gap-10 px-6 pt-12">
          <div className="flex flex-col gap-5">
            {marks}
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                Projects Lab
              </h1>
              <p className="text-ink-secondary">
                Sign in with your passphrase to connect{" "}
                <span className="font-semibold text-ink">{name}</span>.
              </p>
            </div>
          </div>
          {form}
        </main>
      </div>
    );

  return (
    <main className="flex justify-center tablet:items-center tablet:p-6 tablet:min-h-dvh">
      <section
        className="flex w-full flex-col gap-7 px-6 pt-6 consent-card tablet:max-w-(--size-form) tablet:gap-6 tablet:p-8"
        aria-labelledby="consent-title"
      >
        {marks}
        <div className="flex flex-col gap-2">
          <h1
            id="consent-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {name} wants to read and write your Projects Lab
          </h1>
          <p className="text-sm text-ink-secondary">
            {page.clientDomain ? (
              <>
                Requested by{" "}
                <span className="mono text-ink">{page.clientDomain}</span>
              </>
            ) : (
              "This app named itself; its name isn't verified"
            )}{" "}
            · you're signed in as the owner.
          </p>
          <p className="text-sm text-ink-secondary">
            Access goes to{" "}
            <span className="mono text-ink">{page.redirectHost}</span>.
          </p>
        </div>
        {page.redirectIsLoopback && (
          <Banner tone="warning" title="An app on this device.">
            Continue only if you just started connecting from it.
          </Banner>
        )}
        {failure === "offline" && (
          <Banner tone="offline" title="You're offline.">
            Connecting needs a connection.
          </Banner>
        )}
        {failure && failure !== "offline" && failure !== "wrong_passphrase" && (
          <Banner tone="danger" title="Couldn't connect.">
            Try again in a moment.
          </Banner>
        )}
        <div className="group">
          {SCOPES.map((scope) => (
            <div key={scope.text} className="scope">
              <Icon name={scope.icon} />
              <span>{scope.text}</span>
            </div>
          ))}
        </div>
        <p className="text-sm text-ink-muted">
          Revoke access any time in Settings › Connections.
        </p>
        <div className="flex flex-col gap-3 pb-6 tablet:flex-row-reverse tablet:pb-0">
          <Button
            size="lg"
            block
            loading={deciding === "allow"}
            disabled={deciding === "deny"}
            onClick={() => choose("allow")}
          >
            {deciding === "allow" ? "Allowing" : "Allow"}
          </Button>
          <Button
            size="lg"
            block
            variant="outline"
            tone="neutral"
            loading={deciding === "deny"}
            disabled={deciding === "allow"}
            onClick={() => choose("deny")}
          >
            Cancel
          </Button>
        </div>
      </section>
    </main>
  );
}
