import { useNavigate } from "react-router";
import {
  Button,
  EmptyState,
  ErrorState,
  type IconName,
  LabCard,
  type LabCardState,
  PageTitle,
} from "../components/ui";
import { ConnectionsScreen } from "./ConnectionsScreen";
import {
  type LabDefinition,
  type LabHome,
  labsOnly,
  useLabs,
} from "./lab-registry";
import { useRead } from "./read";
import { SettingsScreen } from "./SettingsScreen";

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
  if (!lab.home) return null;
  return <HomeCardLoader lab={lab} home={lab.home} />;
}

function HomeCardLoader({ lab, home }: { lab: LabDefinition; home: LabHome }) {
  const navigate = useNavigate();
  const { state: read, retry } = useRead(home.load);
  // LabCard has no offline variant: offline shows as the error card until the
  // Banner arrives (D-05).
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
      label: "Settings",
      icon: "settings",
      path: "/settings",
      screen: <SettingsScreen />,
    },
  ],
};
