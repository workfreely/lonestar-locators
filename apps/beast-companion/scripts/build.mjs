import { cpSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { build } from "vite";

/**
 * Build orchestrator.
 *
 * Emits the simplest loadable MV3 extension:
 *   dist/
 *     manifest.json   (static, copied verbatim)
 *     content.js      (single self-contained IIFE — the whole sidebar UI)
 *     background.js    (single self-contained IIFE — the service worker)
 *     icons/*
 *
 * Each bundle is built via Vite's build() API (so vite.config.ts supplies the
 * React plugin, the "@" alias, and CSS isolation) with format "iife" +
 * inlineDynamicImports, guaranteeing ONE file per entry with everything inlined.
 *
 * Run with --watch for local development (rebuild-on-save; then hit the reload
 * icon on the extension card in chrome://extensions).
 */

const watch = process.argv.includes("--watch");

async function bundle(input, outName) {
  await build({
    // vite.config.ts is loaded automatically and merged with the options below.
    build: {
      outDir: "dist",
      emptyOutDir: false, // we clear dist ourselves so both bundles coexist
      sourcemap: false,
      minify: true,
      watch: watch ? {} : null,
      rollupOptions: {
        input,
        output: {
          format: "iife",
          inlineDynamicImports: true,
          entryFileNames: outName,
          // Content scripts are classic scripts; keep everything inline.
          assetFileNames: "[name][extname]",
        },
      },
    },
  });
}

// Fresh output + static assets first, then the two code bundles.
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");
cpSync("public/icons", "dist/icons", { recursive: true });

await bundle("src/content/index.tsx", "content.js");
await bundle("src/background/index.ts", "background.js");

if (!watch) {
  console.log("\n✓ Built dist/ — content.js, background.js, manifest.json, icons/");
}
