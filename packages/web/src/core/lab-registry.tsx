// What a lab registers with the shell (docs/prd/00-platform.md). The app's entry
// assembles the list and provides it; core reads it and never imports a lab.
import { createContext, type ReactNode, useContext } from "react";
import type { IconName } from "../components/ui";

export type LabId = "platform" | "study" | "career";

export interface LabTab {
  label: string;
  icon: IconName;
  /** Absolute path; the lab's first tab is its root, e.g. "/study". */
  path: string;
  screen: ReactNode;
}

export interface LabDefinition {
  id: LabId;
  /** "Study Lab". */
  name: string;
  /** The rail's kicker, "Study". */
  shortName: string;
  /** One line in the LabSwitcher, "Backlog, courses, grades". */
  description: string;
  icon: IconName;
  /** In order; the first is where switching to this lab lands. */
  tabs: readonly LabTab[];
}

export const SETTINGS_PATH = "/settings";

const LabsContext = createContext<readonly LabDefinition[] | null>(null);

export function LabsProvider({
  labs,
  children,
}: {
  labs: readonly LabDefinition[];
  children: ReactNode;
}) {
  return <LabsContext.Provider value={labs}>{children}</LabsContext.Provider>;
}

export function useLabs(): readonly LabDefinition[] {
  const labs = useContext(LabsContext);
  if (!labs) throw new Error("useLabs() needs a <LabsProvider> above it");
  return labs;
}

/** The lab that owns `pathname`: the one whose first tab is its first segment, else platform. */
export function labForPath(
  labs: readonly LabDefinition[],
  pathname: string,
): LabDefinition {
  const segment = `/${pathname.split("/")[1] ?? ""}`;
  const platform = labs.find((lab) => lab.id === "platform");
  const owner = labs.find(
    (lab) => lab.id !== "platform" && lab.tabs[0]?.path === segment,
  );
  const found = owner ?? platform;
  if (!found) throw new Error("the lab registry has no platform entry");
  return found;
}

/** Labs proper, without the platform: what Home summarises. */
export function labsOnly(labs: readonly LabDefinition[]): LabDefinition[] {
  return labs.filter((lab) => lab.id !== "platform");
}
