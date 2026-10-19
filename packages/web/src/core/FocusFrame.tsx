// The frame for a lab's full-screen routes (LabDefinition.focus): no rail, no
// bottom tabs, but the lab's accent still comes from the URL.
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { labForPath, useLabs } from "./lab-registry";

export function FocusFrame() {
  const labs = useLabs();
  const { pathname } = useLocation();
  const lab = labForPath(labs, pathname);

  useEffect(() => {
    document.documentElement.dataset.lab = lab.id;
  }, [lab.id]);

  return (
    <div className="focus">
      <Outlet />
    </div>
  );
}
