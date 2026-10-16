import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import {
  BottomTabs,
  LabSwitcher,
  type NavItem,
  PageHeader,
  SideRail,
  useMinWidth,
} from "../components/ui";
import {
  type LabTab,
  labForPath,
  SETTINGS_PATH,
  useLabs,
} from "./lab-registry";

function toItem(tab: LabTab, pathname: string): NavItem {
  return {
    label: tab.label,
    icon: tab.icon,
    href: tab.path,
    current: pathname === tab.path,
  };
}

/**
 * Header, navigation and accent around every screen. The lab comes from the
 * URL, so a deep link opens in the right lab; switching lab is a client-side
 * navigation, and `data-lab` on <html> repaints every accent.
 */
export function Shell() {
  const labs = useLabs();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const lab = labForPath(labs, pathname);
  const tablet = useMinWidth("--breakpoint-tablet");
  const wideRail = useMinWidth("--breakpoint-landscape");

  useEffect(() => {
    document.documentElement.dataset.lab = lab.id;
  }, [lab.id]);

  const options = labs.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    icon: l.icon,
    href: l.tabs[0]?.path ?? "/",
  }));
  const settings = labs
    .flatMap((l) => l.tabs)
    .find((tab) => tab.path === SETTINGS_PATH);
  const tabs = lab.tabs.map((tab) => toItem(tab, pathname));

  return (
    <div className="shell">
      <SideRail
        label={lab.name}
        section={lab.shortName}
        compact={!wideRail}
        switcher={
          tablet && (
            <LabSwitcher
              labs={options}
              current={lab.id}
              variant="menu"
              block
              onNavigate={navigate}
            />
          )
        }
        items={tabs.filter((tab) => tab.href !== SETTINGS_PATH)}
        footItems={settings ? [toItem(settings, pathname)] : []}
        onNavigate={navigate}
      />
      <div className="shell__main">
        <div className="shell__header">
          <PageHeader
            leading={
              !tablet && (
                <LabSwitcher
                  labs={options}
                  current={lab.id}
                  variant="sheet"
                  onNavigate={navigate}
                />
              )
            }
          />
        </div>
        <main>
          <Outlet />
        </main>
      </div>
      <BottomTabs label={lab.name} items={tabs} onNavigate={navigate} />
    </div>
  );
}
