// Interview videos are Google Drive links, never R2 (docs/prd/24, R2-13).
// Only two link shapes are accepted; the app stores the file ID alone.

/** The K-26 trigger checks the same shape (GLOB on these characters, 10..128). */
export const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,128}$/;

const FILE_PATH = /^\/file\/d\/([^/]+)(?:\/.*)?$/;

/** `https://drive.google.com/file/d/<id>/…` or `…/open?id=<id>` → `<id>`; null otherwise. */
export function driveFileId(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.host !== "drive.google.com") return null;
  const id =
    url.pathname === "/open"
      ? url.searchParams.get("id")
      : (FILE_PATH.exec(url.pathname)?.[1] ?? null);
  return id !== null && DRIVE_FILE_ID.test(id) ? id : null;
}

/** Drive's own player, embedded in a sandboxed iframe. */
export function drivePreviewUrl(fileId: string): string {
  if (!DRIVE_FILE_ID.test(fileId))
    throw new RangeError(`Not a Drive file ID: ${fileId}`);
  return `https://drive.google.com/file/d/${fileId}/preview`;
}
