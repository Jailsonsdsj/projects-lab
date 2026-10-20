// Jobs → Openings (docs/prd/23-career-job-search.md § Screens): what the weekly
// routine saved, new first, stale ones marked; each opens a sheet to keep or
// dismiss it, read its excerpt, or copy a prompt for Claude to track it. The
// list pages (50 at a time) since openings grow every week.
import {
  type Opening,
  openingsResponseSchema,
} from "@projects-lab/shared/career";
import { useCallback, useState } from "react";
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  Group,
  ListRow,
  Sheet,
  Skeleton,
  useToast,
} from "../../components/ui";
import { apiFetch } from "../../core/api";
import { failureKind } from "../../core/failure";
import { ReadView } from "../../core/ReadView";
import { send } from "./FormSheet";

type Page = { openings: Opening[]; nextCursor?: string };

async function fetchPage(signal: AbortSignal, cursor?: string): Promise<Page> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await apiFetch(`/api/career/openings${query}`, { signal });
  if (!response.ok)
    throw new Error(`GET /api/career/openings: ${response.status}`);
  return openingsResponseSchema.parse(await response.json());
}

const STATUS: Record<Opening["status"], { label: string; tone: BadgeTone }> = {
  new: { label: "New", tone: "info" },
  kept: { label: "Kept", tone: "success" },
  tracked: { label: "Tracked", tone: "accent" },
  dismissed: { label: "Dismissed", tone: "neutral" },
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** "posted 5 days ago" from the posting date, else from when it was saved. */
function age(opening: Opening, now: number): string {
  const from = Date.parse(opening.postedOn ?? opening.createdAt);
  const days = Math.max(0, Math.floor((now - from) / DAY_MS));
  const when =
    days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  return `${opening.postedOn ? "posted" : "saved"} ${when}`;
}

/** What "Track" copies: Claude maps the posting and links the opening. */
export const trackPrompt = (o: Opening) =>
  `Track this opening as a job with career_add_job (openingId ${o.id}): ${o.role} at ${o.company}, ${o.url}. Map the posting, score the fit, and tell me if it's a skip.`;

function OpeningSheet({
  opening,
  open,
  onClose,
  onChanged,
}: {
  opening: Opening;
  open: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<"kept" | "dismissed" | null>(null);

  async function decide(status: "kept" | "dismissed") {
    setBusy(status);
    try {
      const response = await send(
        "PATCH",
        `/api/career/openings/${opening.id}`,
        { status },
      );
      if (!response.ok) throw new Error(String(response.status));
      onChanged(status === "kept" ? "Kept" : "Dismissed");
    } catch (error) {
      toast.show({
        tone: failureKind(error) === "offline" ? "warning" : "danger",
        message:
          failureKind(error) === "offline"
            ? "You're offline: try again once you're back online."
            : "Couldn't change it. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  const tracked = opening.status === "tracked";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${opening.role} · ${opening.company}`}
      footer={
        tracked ? undefined : (
          <>
            {opening.status !== "dismissed" && (
              <Button
                variant="ghost"
                tone="neutral"
                loading={busy === "dismissed"}
                onClick={() => decide("dismissed")}
              >
                Dismiss
              </Button>
            )}
            {opening.status !== "kept" && (
              <Button
                variant="soft"
                loading={busy === "kept"}
                onClick={() => decide("kept")}
              >
                Keep
              </Button>
            )}
            <Button
              icon="copy"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(trackPrompt(opening));
                  toast.show({
                    tone: "success",
                    message: "Prompt copied: paste it to Claude to track it",
                  });
                } catch {
                  toast.show({
                    tone: "danger",
                    message: "Couldn't copy: select the text instead.",
                  });
                }
              }}
            >
              Track
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-ink-secondary">
          {[
            opening.lane,
            opening.rateText || "Rate not posted",
            age(opening, Date.now()),
          ].join(" · ")}
        </p>
        <p>{opening.why}</p>
        <a
          className="text-(--color-lab-accent) break-all"
          href={opening.url}
          target="_blank"
          rel="noreferrer"
        >
          {opening.url}
        </a>
        {tracked && (
          <p className="text-sm text-ink-muted">
            Tracked as a job: it follows that job now.
          </p>
        )}
        <details className="group p-4">
          <summary className="font-medium">Posting excerpt</summary>
          <p className="pt-2 whitespace-pre-wrap text-ink-secondary">
            {opening.posting}
          </p>
        </details>
      </div>
    </Sheet>
  );
}

function Openings({
  first,
  onChanged,
}: {
  first: Page;
  onChanged: (message: string) => void;
}) {
  const [pages, setPages] = useState<Page[]>([first]);
  // A new first page (a read after a change) starts the list again.
  const [shownFirst, setShownFirst] = useState(first);
  if (first !== shownFirst) {
    setShownFirst(first);
    setPages([first]);
  }
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState<Opening | null>(null);
  const [last, setLast] = useState<Opening | null>(null);
  if (opened && opened !== last) setLast(opened);
  const toast = useToast();
  const openings = pages.flatMap((p) => p.openings);
  const next = pages.at(-1)?.nextCursor;
  const now = Date.now();

  return (
    <>
      <Group title="Openings" count={openings.length}>
        {openings.map((o) => (
          <ListRow
            key={o.id}
            title={o.role}
            meta={[
              o.company,
              o.lane,
              o.rateText || "Rate not posted",
              age(o, now),
            ].join(" · ")}
            tags={
              <>
                <Badge tone={STATUS[o.status].tone} size="sm">
                  {STATUS[o.status].label}
                </Badge>
                {o.stale && (
                  <Badge tone="neutral" size="sm">
                    Stale
                  </Badge>
                )}
              </>
            }
            onClick={() => setOpened(o)}
          />
        ))}
      </Group>
      {next && (
        <Button
          variant="outline"
          tone="neutral"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              const page = await fetchPage(new AbortController().signal, next);
              setPages((all) => [...all, page]);
            } catch {
              toast.show({
                tone: "danger",
                message: "Couldn't load more. Try again.",
              });
            } finally {
              setLoading(false);
            }
          }}
        >
          Show more
        </Button>
      )}
      {last && (
        <OpeningSheet
          key={last.id}
          opening={last}
          open={opened !== null}
          onClose={() => setOpened(null)}
          onChanged={(message) => {
            setOpened(null);
            onChanged(message);
          }}
        />
      )}
    </>
  );
}

export function OpeningsPanel() {
  const toast = useToast();
  const [refresh, setRefresh] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => {
    const page = await fetchPage(signal);
    return page.openings.length ? page : null;
  }, []);
  return (
    <ReadView
      load={load}
      refresh={refresh}
      skeleton={
        <div className="flex flex-col gap-3">
          <Skeleton shape="block" />
          <Skeleton shape="block" />
        </div>
      }
      empty={
        <EmptyState icon="search" title="No openings yet">
          The weekly job search saves openings that pass your search criteria
          here, and emails you a digest.
        </EmptyState>
      }
    >
      {(page) => (
        <Openings
          first={page}
          onChanged={(message) => {
            toast.show({ tone: "success", message });
            setRefresh((n) => n + 1);
          }}
        />
      )}
    </ReadView>
  );
}
