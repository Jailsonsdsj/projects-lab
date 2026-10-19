import {
  API_CACHE,
  API_NETWORK_TIMEOUT_SECONDS,
  CONTENT_CACHE,
  LAZY_ASSET_CACHE,
} from "@projects-lab/shared";
import type { VitePWAOptions } from "vite-plugin-pwa";
import { describe, expect, it } from "vitest";
import wrangler from "../../api/wrangler.jsonc?raw";
import favicon from "../public/favicon.svg?raw";
import {
  mermaidOnlyFiles,
  pwaOptions,
  themeColorTags,
  tokenColour,
  WORKER_FIRST,
} from "../pwa.config";
import tokens from "./styles/tokens.css?raw";

const options = pwaOptions(tokens);
const workbox = options.workbox ?? {};
const manifest = options.manifest || {};
const light = (name: string) => tokenColour(tokens, name, "light");

type RuntimeCaching = NonNullable<
  NonNullable<VitePWAOptions["workbox"]>["runtimeCaching"]
>[number];

const ORIGIN = "https://lab.example";

/** The first runtime rule that takes a GET of `path`, as the service worker
 *  sees it. Each matcher is rebuilt from its source text first: that's the
 *  form it runs in, so one that leans on this module fails here. */
function ruleFor(path: string, origin = ORIGIN): RuntimeCaching | undefined {
  const url = new URL(path, origin);
  return (workbox.runtimeCaching ?? []).find((rule) => {
    const source = String(rule.urlPattern);
    const match = new Function(`return (${source})`)() as (context: {
      url: URL;
      sameOrigin: boolean;
    }) => boolean;
    return (
      (rule.method ?? "GET") === "GET" &&
      match({ url, sameOrigin: url.origin === ORIGIN })
    );
  });
}

const leftToWorker = (path: string) =>
  (workbox.navigateFallbackDenylist ?? []).some((pattern) =>
    pattern.test(path),
  );

describe("service worker", () => {
  it("leaves the Worker's paths alone: the same list as wrangler.jsonc run_worker_first", () => {
    const listed = wrangler.match(/"run_worker_first":\s*(\[[^\]]*\])/)?.[1];
    expect(listed, "run_worker_first in wrangler.jsonc").toBeDefined();
    expect(WORKER_FIRST).toEqual(JSON.parse(listed ?? "[]"));
  });

  it("never answers a navigation to a Worker path with the app's index.html", () => {
    for (const path of [
      "/api/study/backlog",
      "/mcp",
      "/mcp?session=1",
      "/oauth/authorize?client_id=x&state=y",
      "/.well-known/oauth-authorization-server",
    ])
      expect(leftToWorker(path), path).toBe(true);
    for (const path of ["/", "/study/grades", "/mcp-notes", "/apiary"])
      expect(leftToWorker(path), path).toBe(false);
    expect(workbox.navigateFallback).toBe("/index.html");
  });

  it("reads /api network-first, falling back to the cache after the shared timeout", () => {
    const rule = ruleFor("/api/career/summary");
    expect(rule?.handler).toBe("NetworkFirst");
    expect(rule?.options?.networkTimeoutSeconds).toBe(
      API_NETWORK_TIMEOUT_SECONDS,
    );
    expect(API_NETWORK_TIMEOUT_SECONDS).toBe(3);
    expect(rule?.options?.cacheName).toBe(API_CACHE);
    expect(rule?.options?.cacheableResponse?.statuses).toEqual([200]);
  });

  it("serves course content by SHA cache-first", () => {
    const rule = ruleFor("/api/study/content/3f2a9c");
    expect(rule?.handler).toBe("CacheFirst");
    expect(rule?.options?.cacheName).toBe(CONTENT_CACHE);
  });

  it("caches only same-origin GETs: writes and other origins pass through", () => {
    expect(ruleFor("/api/x", "https://elsewhere.example")).toBeUndefined();
    for (const rule of workbox.runtimeCaching ?? [])
      expect(rule.method).toBe("GET");
  });

  it("keeps Mermaid's chunks out of the precache, but not the app's lazy chunks", () => {
    const MERMAID =
      "../../node_modules/.pnpm/mermaid@12.1.0/node_modules/mermaid/dist/mermaid.core.mjs";
    const skip = mermaidOnlyFiles({
      "index.html": {
        file: "assets/index.js",
        imports: ["_shared.js"],
        dynamicImports: ["src/dev/KitchenSink.tsx", MERMAID],
      },
      "_shared.js": { file: "assets/shared.js" },
      "src/dev/KitchenSink.tsx": {
        file: "assets/KitchenSink.js",
        imports: ["index.html"],
      },
      [MERMAID]: {
        file: "assets/mermaid.core.js",
        imports: ["index.html", "_shared.js", "_d3.js"],
        dynamicImports: ["flow.mjs"],
      },
      "flow.mjs": {
        file: "assets/flowDiagram.js",
        imports: ["_d3.js", "index.html"],
      },
      "_d3.js": { file: "assets/d3.js" },
    });
    expect([...skip].sort()).toEqual([
      "assets/d3.js",
      "assets/flowDiagram.js",
      "assets/mermaid.core.js",
    ]);
    expect(workbox.manifestTransforms).toHaveLength(1);
  });

  it("caches a lazy chunk the first time it loads, cache-first", () => {
    const rule = ruleFor("/assets/flowDiagram-OXPTDLAJ-epmHtk44.js");
    expect(rule?.handler).toBe("CacheFirst");
    expect(rule?.options?.cacheName).toBe(LAZY_ASSET_CACHE);
    expect(ruleFor("/assets/index-x.css")?.options?.cacheName).not.toBe(
      LAZY_ASSET_CACHE,
    );
  });

  it("precaches the shell, its chunks and the Latin fonts", () => {
    expect(workbox.globPatterns).toEqual(
      expect.arrayContaining([
        expect.stringContaining("js"),
        expect.stringContaining("woff2"),
      ]),
    );
  });
});

describe("manifest and icons", () => {
  it("installs standalone, in any orientation, at the root", () => {
    expect(manifest).toMatchObject({
      display: "standalone",
      orientation: "any",
      start_url: "/",
      scope: "/",
    });
  });

  it("takes its colours from the tokens", () => {
    expect(manifest.theme_color).toBe(light("--color-ground"));
    expect(manifest.background_color).toBe(light("--color-ground"));
    expect(themeColorTags(tokens).map((tag) => tag.attrs)).toEqual([
      expect.objectContaining({ content: light("--color-ground") }),
      expect.objectContaining({
        content: tokenColour(tokens, "--color-ground", "dark"),
      }),
    ]);
    expect(() => tokenColour(tokens, "--color-nope", "light")).toThrow(
      "--color-nope",
    );
  });

  it("draws the icon in the platform accent from the tokens", () => {
    const fills = [...favicon.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]+)"/g)]
      .map((m) => m[1]?.toUpperCase())
      .sort();
    expect(fills).toEqual(
      [light("--color-on-platform"), light("--color-platform")]
        .map((c) => c.toUpperCase())
        .sort(),
    );
  });

  it("renders phone and tablet icons: 192, 512, maskable 512, Apple 180", () => {
    const preset = options.pwaAssets?.preset;
    if (!preset || typeof preset === "string")
      throw new Error("expected an inline icon preset");
    expect(preset.transparent.sizes).toEqual(
      expect.arrayContaining([192, 512]),
    );
    expect(preset.maskable.sizes).toEqual([512]);
    expect(preset.apple.sizes).toEqual([180]);
    expect(preset.maskable.resizeOptions?.background).toBe(
      light("--color-platform"),
    );
  });
});
