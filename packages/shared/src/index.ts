// The package root carries what every lab may use: core and contracts. Lab
// code (src/study, src/career) is reached only by subpath, e.g.
// "@projects-lab/shared/study", so the Biome boundary patterns see it.

export * from "./contracts/study";
export * from "./core/auth";
export * from "./core/bytes";
export * from "./core/idempotency";
export * from "./core/kdf";
export * from "./core/lab";
export * from "./core/oauth";
export * from "./core/pwa";
