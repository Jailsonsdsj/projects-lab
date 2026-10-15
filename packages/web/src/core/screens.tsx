import { EmptyState, type IconName, PageTitle } from "../components/ui";
import { type LabDefinition, labsOnly, useLabs } from "./lab-registry";

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five"];

/** Home: one card per lab arrives in D-05. */
export function HomeScreen() {
  const labs = labsOnly(useLabs());
  const count = COUNT_WORDS[labs.length] ?? String(labs.length);
  return <PageTitle title="Home" subtitle={`Your ${count} labs`} />;
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
