import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Dialog, PageTitle } from "../components/ui";
import { ChangePassphraseCard } from "./ChangePassphraseCard";
import { signOut } from "./session";

/** Settings (00-platform): change passphrase (F-11) and the Session card. */
export function SettingsScreen() {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function logOut() {
    setLeaving(true);
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <>
      {/* PageTitle brings its own gutter; the cards line up with it. */}
      <PageTitle title="Settings" />
      <div className="flex flex-col gap-4 px-4 pb-6 tablet:gap-5">
        <ChangePassphraseCard />
        <section className="card" aria-labelledby="settings-session">
          <h2 id="settings-session">Session</h2>
          <p className="text-sm text-ink-secondary">
            You're signed in on this device. Logging out clears the offline copy
            on this device.
          </p>
          <Button
            variant="outline"
            tone="neutral"
            icon="log-out"
            className="self-start"
            onClick={() => setAsking(true)}
          >
            Log out
          </Button>
        </section>
        <Dialog
          open={asking}
          onClose={() => setAsking(false)}
          title="Log out of Projects Lab?"
          icon="log-out"
          actions={
            <>
              <Button
                variant="outline"
                tone="neutral"
                onClick={() => setAsking(false)}
              >
                Cancel
              </Button>
              <Button tone="neutral" loading={leaving} onClick={logOut}>
                Log out
              </Button>
            </>
          }
        >
          You'll need your passphrase to sign back in.
        </Dialog>
      </div>
    </>
  );
}
