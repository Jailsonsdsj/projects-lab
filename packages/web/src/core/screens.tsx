import { backupDue } from "@projects-lab/shared";
import { useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  type IconName,
  LabCard,
  type LabCardState,
  PageTitle,
} from "../components/ui";
import { readBackupStatus } from "./BackupCard";
import { ConnectionsScreen } from "./ConnectionsScreen";
import { GuideScreen } from "./GuideScreen";
import {
  type LabDefinition,
  type LabHome,
  labsOnly,
  useLabs,
} from "./lab-registry";
import { useRead } from "./read";
import { SettingsScreen } from "./SettingsScreen";

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five"];

/** The browser's own idea of being online, kept current by its events. */
function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("online", onChange);
      window.addEventListener("offline", onChange);
      return () => {
        window.removeEventListener("online", onChange);
        window.removeEventListener("offline", onChange);
      };
    },
    () => navigator.onLine,
  );
}

/** Home (00-platform): one card per lab, each loading its own summary so one
 *  lab failing never blanks another. Offline, a banner says why the cards
 *  can't load (LabCard has no offline variant); they read again online. */
export function HomeScreen() {
  const labs = labsOnly(useLabs());
  const count = COUNT_WORDS[labs.length] ?? String(labs.length);
  const online = useOnline();
  return (
    <div className="home">
      <PageTitle title="Home" subtitle={`Your ${count} labs`} />
      {!online && (
        <Banner tone="offline" title="You're offline.">
          The labs' summaries load again when you're back online.
        </Banner>
      )}
      <BackupNudge />
      {labs.map((lab) => (
        <HomeCard key={lab.id} lab={lab} />
      ))}
    </div>
  );
}

/** Never backed up, or not for BACKUP_NUDGE_DAYS: a quiet reminder. A failed
 *  check says nothing (the cards already show the failure). */
function BackupNudge() {
  const navigate = useNavigate();
  const { state } = useRead(readBackupStatus);
  if (state.status !== "loaded") return null;
  const last = state.data.lastExportedAt;
  if (!backupDue(last, new Date().toISOString())) return null;
  return (
    <Banner
      tone="info"
      title={last ? "No backup in a while." : "No backup yet."}
      action={
        <Button variant="ghost" size="sm" onClick={() => navigate("/settings")}>
          Back up
        </Button>
      }
    >
      Download one from Settings: everything that's yours, in one file.
    </Banner>
  );
}

function HomeCard({ lab }: { lab: LabDefinition }) {
  if (!lab.home) return null;
  return <HomeCardLoader lab={lab} home={lab.home} />;
}

function HomeCardLoader({ lab, home }: { lab: LabDefinition; home: LabHome }) {
  const navigate = useNavigate();
  const { state: read, retry } = useRead(home.load);
  // LabCard has no offline variant: offline shows as the error card, under
  // HomeScreen's offline banner.
  const state: LabCardState =
    read.status === "loaded"
      ? { status: "loaded", data: read.data }
      : read.status === "empty"
        ? { status: "empty", text: home.emptyText }
        : read.status === "loading"
          ? read
          : { status: "error", onRetry: retry };

  return (
    <LabCard
      lab={lab.id}
      name={lab.name}
      icon={lab.icon}
      // A summary can point the card somewhere else (Study: the course to continue).
      href={
        (read.status === "loaded" ? read.data.href : undefined) ??
        lab.tabs[0]?.path ??
        "/"
      }
      state={state}
      onNavigate={navigate}
    />
  );
}

/** Any path no tab owns: inside the shell, never React Router's default 404. */
export function NotFoundScreen() {
  const navigate = useNavigate();
  return (
    <ErrorState
      title="Page not found"
      code="404"
      actions={<Button onClick={() => navigate("/")}>Go to Home</Button>}
    >
      Nothing lives at this address. The link may be wrong or out of date.
    </ErrorState>
  );
}

/** A screen whose content arrives with a later task; shown inside the real shell. */
export function ComingScreen({
  title,
  icon,
  arrives,
}: {
  title: string;
  icon: IconName;
  arrives: string;
}) {
  return (
    <>
      <PageTitle title={title} />
      <EmptyState icon={icon} title={`${title} is on its way`}>
        {arrives}
      </EmptyState>
    </>
  );
}

export const platformLab: LabDefinition = {
  id: "platform",
  name: "Home",
  shortName: "Platform",
  description: "Both labs at a glance",
  icon: "home",
  tabs: [
    { label: "Home", icon: "home", path: "/", screen: <HomeScreen /> },
    {
      label: "Connections",
      icon: "link",
      path: "/connections",
      screen: <ConnectionsScreen />,
    },
    {
      label: "Guide",
      icon: "book",
      path: "/guide",
      screen: <GuideScreen />,
    },
    {
      label: "Settings",
      icon: "settings",
      path: "/settings",
      screen: <SettingsScreen />,
    },
  ],
};
