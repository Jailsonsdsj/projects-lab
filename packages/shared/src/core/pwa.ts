// The installed app's caches (docs/architecture.md §7). The web build reads
// these when it generates the service worker; log out (F-10) clears API_CACHE.

/** How long a GET /api read waits for the network before answering from cache. */
export const API_NETWORK_TIMEOUT_SECONDS = 3;

/** Cached /api reads (NetworkFirst). Holds session data: cleared on log out. */
export const API_CACHE = "api";

/** Course content by blob SHA (CacheFirst): immutable, so never revalidated. */
export const CONTENT_CACHE = "study-content";

/** Content entries kept for offline reading; the oldest go first. */
export const CONTENT_CACHE_MAX_ENTRIES = 200;
