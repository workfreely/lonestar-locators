import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
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
    // Build-time flag mirroring the manifest injection below: --watch builds accept
    // the local CRM origin, production builds fold the branch away entirely so no
    // localhost string reaches the shipped bundle.
    define: { __LB_DEV__: JSON.stringify(watch) },
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
    define: { __LB_DEV__: JSON.stringify(watch) },
    // Relative asset paths so sidepanel.html works from the extension root.
    base: "./",
    build: {
      outDir: "dist",
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      watch: watch ? {} : null,
      // Drop Vite's module-preload polyfill. It only ever prefetches this
      // package's own bundle files, but it is the sole source of a `fetch(` call
      // in the output — and Beast Companion's Chrome Web Store position is that
      // the extension performs NO network operations of any kind. Removing it
      // makes that claim verifiable by grepping the build rather than by
      // explanation. Safe: the panel ships as one bundle with no dynamic chunks.
      modulePreload: { polyfill: false },
      rollupOptions: { input: { sidepanel: "sidepanel.html" } },
    },
  });
}

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

// Copy the manifest. In --watch (DEV ONLY) also allow the local CRM origin so the
// theme-sync content script injects on the local CRM for testing.
// Production builds keep the manifest exactly as committed (no localhost, no extra
// permissions beyond what ships).
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
if (watch) {
  // Two DIFFERENT pattern shapes, and they must not be shared:
  //
  //   content_scripts.matches         — may carry a path, so injection stays
  //                                     scoped to the CRM's /admin/* routes.
  //   web_accessible_resources.matches — validated far more strictly: the path
  //                                     must be exactly /*, i.e. origin-only.
  //                                     "/admin/*" here is rejected with
  //                                     "Invalid match pattern" and the whole
  //                                     extension fails to load.
  //
  // Neither may carry a port — "http://localhost:3000/..." is invalid in both.
  // Without a port these match localhost on any port, which is what dev needs.
  const LOCAL_SCRIPTS = ["http://localhost/admin/*", "http://127.0.0.1/admin/*"];
  const LOCAL_ORIGINS = ["http://localhost/*", "http://127.0.0.1/*"];
  const allow = (arr, patterns) => {
    if (!Array.isArray(arr)) return;
    for (const m of patterns) if (!arr.includes(m)) arr.push(m);
  };
  allow(manifest.content_scripts?.[0]?.matches, LOCAL_SCRIPTS);
  // Without this the launcher's packaged icon is blocked by chrome.runtime.getURL
  // on localhost and the tab renders empty — the content script injects, but its
  // image never loads.
  for (const entry of manifest.web_accessible_resources ?? []) allow(entry.matches, LOCAL_ORIGINS);
}
writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2));
cpSync("public/icons", "dist/icons", { recursive: true });

await buildSidePanel();
await bundleIife("src/content/index.ts", "content.js");
await bundleIife("src/background/index.ts", "background.js");

if (!watch) {
  console.log("\n✓ Built dist/ — sidepanel.html, content.js, background.js, manifest.json, icons/");
}
