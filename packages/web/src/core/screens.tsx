import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  EmptyState,
  type IconName,
  LabCard,
  type LabCardState,
  PageTitle,
} from "../components/ui";
import {
  type LabDefinition,
  type LabHome,
  labsOnly,
  useLabs,
} from "./lab-registry";

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five"];

/** Home (00-platform): one card per lab, each loading its own summary so one
 *  lab failing never blanks another. */
export function HomeScreen() {
  const labs = labsOnly(useLabs());
  const count = COUNT_WORDS[labs.length] ?? String(labs.length);
  return (
    <div className="home">
      <PageTitle title="Home" subtitle={`Your ${count} labs`} />
      {labs.map((lab) => (
        <HomeCard key={lab.id} lab={lab} />
      ))}
    </div>
  );
}

function HomeCard({ lab }: { lab: LabDefinition }) {
  // Retry remounts the loader, which starts a fresh read.
  const [attempt, setAttempt] = useState(0);
  if (!lab.home) return null;
  return (
    <HomeCardLoader
      key={attempt}
      lab={lab}
      home={lab.home}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

function HomeCardLoader({
  lab,
  home,
  onRetry,
}: {
  lab: LabDefinition;
  home: LabHome;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<LabCardState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    home.load(controller.signal).then(
      (summary) => {
        if (controller.signal.aborted) return;
        setState(
          summary
            ? { status: "loaded", data: summary }
            : { status: "empty", text: home.emptyText },
        );
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error", onRetry });
      },
    );
    return () => controller.abort();
  }, [home, onRetry]);

  return (
    <LabCard
      lab={lab.id}
      name={lab.name}
      icon={lab.icon}
      href={lab.tabs[0]?.path ?? "/"}
      state={state}
      onNavigate={navigate}
    />
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
      screen: (
        <ComingScreen
          title="Connections"
          icon="link"
          arrives="The list of Claude connections arrives with the OAuth work."
        />
      ),
    },
    {
      label: "Settings",
      icon: "settings",
      path: "/settings",
      screen: (
        <ComingScreen
          title="Settings"
          icon="settings"
          arrives="Change passphrase and log out arrive with F-10 and F-11."
        />
      ),
    },
  ],
};
