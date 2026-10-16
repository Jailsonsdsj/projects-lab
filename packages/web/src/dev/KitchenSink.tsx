import { PageTitle } from "../components/ui";
import { CATALOG } from "./catalog";
import "./kitchen-sink.css";

const slug = (name: string) => `ks-${name.toLowerCase()}`;

/** /dev/ui: every component in every variant × state (D-06). Not in navigation. */
export function KitchenSink() {
  return (
    <div className="ks" data-sections={CATALOG.length}>
      <PageTitle
        title="UI kitchen sink"
        subtitle={`${CATALOG.length} components. Hover, press and tab through them for the interactive states.`}
      />
      <nav className="ks-toc" aria-label="Components">
        {CATALOG.map((entry) => (
          <a key={entry.name} href={`#${slug(entry.name)}`}>
            {entry.name}
          </a>
        ))}
      </nav>
      {CATALOG.map((entry) => (
        <section
          key={entry.name}
          id={slug(entry.name)}
          className="ks-section"
          aria-labelledby={`${slug(entry.name)}-h`}
        >
          <h2 id={`${slug(entry.name)}-h`}>{entry.name}</h2>
          <p className="muted">{entry.summary}</p>
          <div className="ks-grid">
            {entry.examples.map((example) => (
              <figure
                key={example.label}
                className={entry.inline ? "ks-cell ks-cell--inline" : "ks-cell"}
              >
                <figcaption className="kicker">{example.label}</figcaption>
                {example.node}
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
