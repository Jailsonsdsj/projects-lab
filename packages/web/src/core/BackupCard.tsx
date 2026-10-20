// Settings → Backup (H-02, docs/prd/90-services.md § Backup): one JSON file
// with every row that's the owner's and every file in R2. The Worker sends the
// rows and the file list; this card fetches each file and saves the whole as a
// download, then tells the server it's done. When the last backup was is the
// server's (user.last_exported_at), never kept in the browser.
import {
  type BackupFile,
  backupDataSchema,
  backupStatusSchema,
  bytesToBase64,
  IDEMPOTENCY_KEY_HEADER,
} from "@projects-lab/shared";
import { useCallback, useState } from "react";
import { Banner, Button, useToast } from "../components/ui";
import { apiFetch } from "./api";
import { type FailureKind, failureKind } from "./failure";
import { useRead } from "./read";

export async function readBackupStatus(signal: AbortSignal) {
  const response = await apiFetch("/api/backup", { signal });
  if (!response.ok) throw new Error(`GET /api/backup: ${response.status}`);
  return backupStatusSchema.parse(await response.json());
}

/** "20 Oct 2026 (today)", "3 Oct 2026 (17 days ago)". */
export function lastBackupText(iso: string | null, now = Date.now()): string {
  if (!iso) return "Never";
  const days = Math.floor((now - Date.parse(iso)) / (24 * 60 * 60 * 1000));
  const date = new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const ago =
    days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  return `${date} (${ago})`;
}

async function buildBackup(): Promise<BackupFile> {
  const response = await apiFetch("/api/backup/data");
  if (!response.ok) throw new Error(`GET /api/backup/data: ${response.status}`);
  const data = backupDataSchema.parse(await response.json());
  const files = [];
  for (const file of data.files) {
    const got = await apiFetch(
      `/api/backup/files/${file.key.split("/").map(encodeURIComponent).join("/")}`,
    );
    if (!got.ok) throw new Error(`GET ${file.key}: ${got.status}`);
    files.push({
      ...file,
      base64: bytesToBase64(new Uint8Array(await got.arrayBuffer())),
    });
  }
  return { ...data, files };
}

/** Saves the file through a temporary link: the browser's own download. */
function save(backup: BackupFile) {
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `projects-lab-backup-${backup.exportedAt.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function BackupCard() {
  const toast = useToast();
  const load = useCallback(readBackupStatus, []);
  const { state } = useRead(load);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<FailureKind | null>(null);

  const last =
    saved ?? (state.status === "loaded" ? state.data.lastExportedAt : null);

  async function download() {
    setBusy(true);
    setFailed(null);
    try {
      const backup = await buildBackup();
      save(backup);
      const done = await apiFetch("/api/backup/done", {
        method: "POST",
        headers: { [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID() },
      });
      if (!done.ok) throw new Error(`POST /api/backup/done: ${done.status}`);
      setSaved(backupStatusSchema.parse(await done.json()).lastExportedAt);
      toast.show({ tone: "success", message: "Backup downloaded" });
    } catch (error) {
      setFailed(failureKind(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="settings-backup">
      <h2 id="settings-backup">Backup</h2>
      <p className="text-sm text-ink-secondary">
        One file with everything that's yours: your profile and photo, jobs,
        documents' kits, interviews, the study backlog and grades. It includes
        your passphrase's hash, so keep it somewhere private.
      </p>
      <p className="text-sm">
        Last backup:{" "}
        <strong>
          {state.status === "loading"
            ? "…"
            : state.status === "loaded" || saved
              ? lastBackupText(last)
              : "unknown (couldn't check)"}
        </strong>
      </p>
      {failed === "error" && (
        <Banner tone="danger" title="Couldn't make the backup.">
          Nothing was saved. Try again in a moment.
        </Banner>
      )}
      {failed === "offline" && (
        <Banner tone="offline" title="You're offline.">
          A backup needs a connection. Try again once you're back online.
        </Banner>
      )}
      <Button
        variant="outline"
        tone="neutral"
        className="self-start"
        loading={busy}
        onClick={download}
      >
        {busy ? "Preparing" : "Download backup"}
      </Button>
    </section>
  );
}
