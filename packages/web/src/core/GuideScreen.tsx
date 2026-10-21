// The Guide tab: docs/user-guide.md in the app, one part per tab (`?view=`),
// with the file's own links working here (core/guide.ts).
import { useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { PageTitle, Prose, Tabs } from "../components/ui";
import { GUIDE, guidePath, resolveGuideLink } from "./guide";

/** Tab labels short enough for four on a phone; the part's heading keeps its title. */
const SHORT: Record<string, string> = {
  "using-the-app": "The app",
  "working-with-claude": "Claude",
  "developing-projects-lab": "Develop",
};

export function GuideScreen() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const first = GUIDE.parts[0];
  const part = GUIDE.parts.find((p) => p.id === params.get("view")) ?? first;

  // A link to a heading lands on it once its part is on screen.
  useEffect(() => {
    if (!part || !hash) return;
    document
      .getElementById(decodeURIComponent(hash.slice(1)))
      ?.scrollIntoView?.({ block: "start" });
  }, [part, hash]);

  if (!part) return <PageTitle title="Guide" />;
  return (
    <>
      <PageTitle
        title="Guide"
        subtitle="Using the app, working with Claude, and every command"
      />
      <Tabs
        className="px-3 tablet:mx-4 tablet:px-0"
        label="Guide parts"
        value={part.id}
        onChange={(id) => navigate(guidePath(id), { replace: true })}
        items={GUIDE.parts.map((p) => ({
          id: p.id,
          label: SHORT[p.id] ?? p.title,
        }))}
      />
      <div className="px-4 pt-4 pb-6">
        <Prose
          markdown={
            part === first
              ? `${GUIDE.intro}\n\n${part.markdown}`
              : part.markdown
          }
          headingLevels={["h2", "h3"]}
          resolveLink={resolveGuideLink}
          onNavigate={(path) => navigate(path)}
        />
      </div>
    </>
  );
}
