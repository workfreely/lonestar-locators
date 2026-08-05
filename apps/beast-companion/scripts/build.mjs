import { cpSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { build } from "vite";

/**
 * Build orchestrator for the native-hybrid extension.
 *
 * Emits:
 *   dist/
 *     manifest.json
 *     sidepanel.html + assets/*   (the native side panel — a normal ESM page)
 *     content.js                  (single IIFE — the injected launcher tab)
 *     background.js               (single IIFE — the service worker)
 *     icons/*
 *
 * The side panel is a standard HTML/ESM Vite build. The content + background are
 * single self-contained IIFE files (classic scripts) so the injected part stays
 * tiny and has no loaders / web_accessible_resources.
 *
 * Run with --watch for local development.
 */

const watch = process.argv.includes("--watch");

/** Single-file IIFE bundle (content / background). */
async function bundleIife(input, outName) {
  await build({
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      watch: watch ? {} : null,
      rollupOptions: {
        input,
        output: {
          format: "iife",
          inlineDynamicImports: true,
          entryFileNames: outName,
        },
      },
    },
  });
}

/** The native side panel — a normal HTML page (ESM + emitted CSS). */
async function buildSidePanel() {
  await build({
    // Relative asset paths so sidepanel.html works from the extension root.
    base: "./",
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      watch: watch ? {} : null,
      rollupOptions: { input: { sidepanel: "sidepanel.html" } },
    },
  });
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");
cpSync("public/icons", "dist/icons", { recursive: true });

await buildSidePanel();
await bundleIife("src/content/index.ts", "content.js");
await bundleIife("src/background/index.ts", "background.js");

if (!watch) {
  console.log("\n✓ Built dist/ — sidepanel.html, content.js, background.js, manifest.json, icons/");
}
