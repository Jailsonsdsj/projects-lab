import {
  type Connection,
  connectionsResponseSchema,
  IDEMPOTENCY_KEY_HEADER,
} from "@projects-lab/shared";
import { useState } from "react";
import {
  Button,
  Dialog,
  EmptyState,
  PageTitle,
  Skeleton,
  useToast,
} from "../components/ui";
import { apiFetch } from "./api";
import { ReadView } from "./ReadView";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "2 hours ago", "yesterday", "just now". */
export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS)
    if (Math.abs(seconds) >= size)
      return format.format(Math.round(seconds / size), unit);
  return "just now";
}

/** "last used 2 hours ago" or "not used yet"; capitalised when it leads. */
function lastUsed(c: Connection, leading = true): string {
  const text = c.lastUsedAt
    ? `last used ${relativeTime(c.lastUsedAt)}`
    : "not used yet";
  return leading ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

async function loadConnections(signal: AbortSignal) {
  const response = await apiFetch("/api/connections", { signal });
  if (!response.ok) throw new Error(`GET /api/connections: ${response.status}`);
  const { connections } = connectionsResponseSchema.parse(
    await response.json(),
  );
  return connections.length > 0 ? connections : null;
}

function Rows({
  connections,
  onRevoke,
}: {
  connections: Connection[];
  onRevoke: (c: Connection) => void;
}) {
  return (
    <ul className="group">
      {connections.map((c) => (
        <li key={c.id} className="crow">
          <span className="client client--sm" aria-hidden="true">
            {c.clientName.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{c.clientName}</span>
            <span className="block text-sm text-ink-muted">
              {c.origin && <span className="mono">{c.origin}</span>}
              <span className="tablet:hidden">
                {c.origin ? ` · ${lastUsed(c, false)}` : lastUsed(c)}
              </span>
            </span>
          </span>
          <span className="hidden text-sm text-ink-secondary tablet:block">
            {lastUsed(c)}
          </span>
          <Button
            variant="soft"
            tone="danger"
            size="sm"
            aria-label={`Revoke ${c.clientName}`}
            onClick={() => onRevoke(c)}
          >
            Revoke
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** Connections (F-16): the Claude clients holding a grant, and Revoke. */
export function ConnectionsScreen() {
  const { show } = useToast();
  const [reads, setReads] = useState(0); // a new key reads the list again
  const [target, setTarget] = useState<Connection | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function revoke() {
    if (!target) return;
    setRevoking(true);
    setFailed(false);
    const response = await apiFetch(`/api/connections/${target.id}`, {
      method: "DELETE",
      headers: { [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID() },
    }).catch(() => null);
    setRevoking(false);
    // 404: already gone, which is what Revoke wanted.
    if (response && (response.ok || response.status === 404)) {
      show({ message: `${target.clientName} was revoked`, tone: "success" });
      setTarget(null);
      setReads((n) => n + 1);
    } else {
      setFailed(true);
    }
  }

  return (
    <>
      <PageTitle
        title="Connections"
        subtitle="Apps that can read and write your Projects Lab"
      />
      <div className="flex flex-col gap-4 px-4 pb-6">
        <ReadView
          key={reads}
          load={loadConnections}
          skeleton={<Skeleton shape="block" />}
          empty={
            <div className="group">
              <EmptyState icon="link" title="No connections">
                Connect Projects Lab from Claude and allow it here. It will show
                up in this list.
              </EmptyState>
            </div>
          }
        >
          {(connections) => (
            <>
              <Rows connections={connections} onRevoke={setTarget} />
              <p className="text-sm text-ink-muted">
                To add one, connect Projects Lab from Claude. You'll sign in
                here and see the Allow screen.
              </p>
            </>
          )}
        </ReadView>
      </div>
      <Dialog
        open={target !== null}
        onClose={() => !revoking && setTarget(null)}
        tone="danger"
        icon="trash"
        title={`Revoke ${target?.clientName ?? ""}?`}
        stretchActions
        actions={
          <>
            <Button
              variant="outline"
              tone="neutral"
              disabled={revoking}
              onClick={() => setTarget(null)}
            >
              Cancel
            </Button>
            <Button tone="danger" loading={revoking} onClick={revoke}>
              {revoking ? "Revoking" : "Revoke"}
            </Button>
          </>
        }
      >
        {failed
          ? "Couldn't revoke it. Check the connection and try again."
          : "It loses access to your Projects Lab straight away. You can reconnect from Claude at any time."}
      </Dialog>
    </>
  );
}
