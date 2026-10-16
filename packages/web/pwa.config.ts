// The installed app (D-11): manifest, icons, service worker. Plain data, so a
// test can check it; vite.config.ts hands it to vite-plugin-pwa.
import type { HtmlTagDescriptor } from "vite";
import type { VitePWAOptions } from "vite-plugin-pwa";
// By path, not "@projects-lab/shared": Vite's config loader leaves packages to
// Node, which can't run shared's TypeScript. This file imports nothing.
import {
  API_CACHE,
  API_NETWORK_TIMEOUT_SECONDS,
  CONTENT_CACHE,
  CONTENT_CACHE_MAX_ENTRIES,
} from "../shared/src/core/pwa";

/**
 * The paths the Worker answers itself: wrangler.jsonc `run_worker_first`, which
 * a test keeps in step. The service worker must never answer a navigation to
 * one with the app's index.html, or OAuth consent breaks on an installed app.
 */
export const WORKER_FIRST = ["/api/*", "/mcp", "/oauth/*", "/.well-known/*"];

/** `/oauth/*` → /^\/oauth\//; `/mcp` → /mcp exactly (a query string allowed). */
export function workerFirstPattern(glob: string): RegExp {
  const prefix = glob.endsWith("/*") ? glob.slice(0, -1) : glob;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return new RegExp(`^${escaped}${glob.endsWith("/*") ? "" : "(?:[?#]|$)"}`);
}

/** A colour token's value in one scheme: `--color-ground: light-dark(#F5F5F2, #111214)`. */
export function tokenColour(
  tokensCss: string,
  name: string,
  scheme: "light" | "dark",
): string {
  const match = tokensCss.match(
    new RegExp(
      `${name}:\\s*light-dark\\(\\s*([^,\\s]+)\\s*,\\s*([^)\\s]+)\\s*\\)`,
    ),
  );
  const value = match?.[scheme === "light" ? 1 : 2];
  if (!value)
    throw new Error(`tokens.css has no light-dark() value for ${name}`);
  return value;
}

/** theme-color for each scheme, so the status bar matches the ground in both. */
export function themeColorTags(tokensCss: string): HtmlTagDescriptor[] {
  return (["light", "dark"] as const).map((scheme) => ({
    tag: "meta",
    attrs: {
      name: "theme-color",
      media: `(prefers-color-scheme: ${scheme})`,
      content: tokenColour(tokensCss, "--color-ground", scheme),
    },
    injectTo: "head",
  }));
}

export function pwaOptions(tokensCss: string): Partial<VitePWAOptions> {
  const ground = tokenColour(tokensCss, "--color-ground", "light");
  // The icon's own ground, so padded icons (maskable, Apple) have no seam.
  const iconGround = tokenColour(tokensCss, "--color-platform", "light");

  return {
    registerType: "prompt", // UpdatePrompt offers Reload; nothing reloads mid-read
    injectRegister: false, // registered by UpdatePrompt (virtual:pwa-register/react)
    manifest: {
      id: "/",
      name: "Projects Lab",
      short_name: "Projects Lab",
      description:
        "Study Lab and Career Lab: backlog, courses, grades, skills.",
      lang: "en",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "any",
      theme_color: ground,
      background_color: ground,
    },
    pwaAssets: {
      image: "public/favicon.svg",
      htmlPreset: "2023",
      includeHtmlHeadLinks: true,
      overrideManifestIcons: true,
      injectThemeColor: false, // themeColorTags: one per scheme
      preset: {
        transparent: { sizes: [64, 192, 512], favicons: [[48, "favicon.ico"]] },
        maskable: { sizes: [512], resizeOptions: { background: iconGround } },
        // iPhone and iPad both take the 180 px icon and scale it.
        apple: { sizes: [180], resizeOptions: { background: iconGround } },
      },
    },
    workbox: {
      // The shell, its lazy chunks and the Latin font subsets: what opens
      // offline. Other scripts' subsets still load online when text needs them.
      globPatterns: ["**/*.{js,css,html,svg,png,ico}", "**/*-latin-*.woff2"],
      navigateFallback: "/index.html",
      navigateFallbackDenylist: WORKER_FIRST.map(workerFirstPattern),
      cleanupOutdatedCaches: true,
      // First match wins. These functions are copied into the service worker
      // as source text, so they can't use anything from this module.
      runtimeCaching: [
        {
          urlPattern: ({ sameOrigin, url }) =>
            sameOrigin && url.pathname.startsWith("/api/study/content/"),
          method: "GET",
          handler: "CacheFirst",
          options: {
            cacheName: CONTENT_CACHE,
            expiration: { maxEntries: CONTENT_CACHE_MAX_ENTRIES },
            cacheableResponse: { statuses: [200] },
          },
        },
        {
          urlPattern: ({ sameOrigin, url }) =>
            sameOrigin && url.pathname.startsWith("/api/"),
          method: "GET",
          handler: "NetworkFirst",
          options: {
            cacheName: API_CACHE,
            networkTimeoutSeconds: API_NETWORK_TIMEOUT_SECONDS,
            cacheableResponse: { statuses: [200] },
          },
        },
      ],
    },
  };
}
