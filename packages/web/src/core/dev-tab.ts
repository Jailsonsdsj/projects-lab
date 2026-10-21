// A local run (pnpm dev on :5173, wrangler dev on :8787, or either opened from
// a phone by the Mac's IP address) marks its browser tab with the dev icon and
// a "Dev ·" title, so it's never mistaken for production. Decided by hostname
// at runtime: the same build serves both, and production is never an address.

const LOCAL_HOSTS = new Set(["localhost", "[::1]"]);
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
export const DEV_ICON = "/favicon-dev.svg";

export function markLocalTab(doc: Document, hostname: string): boolean {
  if (!LOCAL_HOSTS.has(hostname) && !IPV4.test(hostname)) return false;
  for (const link of doc.querySelectorAll<HTMLLinkElement>(
    'link[rel="icon"]',
  )) {
    link.href = DEV_ICON;
    link.type = "image/svg+xml";
    link.removeAttribute("sizes");
  }
  if (!doc.title.startsWith("Dev · ")) doc.title = `Dev · ${doc.title}`;
  return true;
}
