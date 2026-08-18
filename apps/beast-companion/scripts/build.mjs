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

// Copy the manifest. In --watch (DEV ONLY) also allow the local CRM origin so the
// theme-sync content script injects on http://localhost:3000/admin/* for testing.
// Production builds keep the manifest exactly as committed (no localhost, no extra
// permissions beyond what ships).
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
if (watch) {
  const matches = manifest.content_scripts?.[0]?.matches;
  if (Array.isArray(matches)) {
    for (const m of ["http://localhost:3000/admin/*", "http://127.0.0.1:3000/admin/*"]) {
      if (!matches.includes(m)) matches.push(m);
    }
  }
}
writeFileSync("dist/manifest.json", JSON.stringify(manifest, null, 2));
cpSync("public/icons", "dist/icons", { recursive: true });

await buildSidePanel();
await bundleIife("src/content/index.ts", "content.js");
// MAIN-world shim (SAD only) — hooks ASP.NET AJAX PageRequestManager endRequest so
// the isolated content script is notified when a SAD Prev/Next async postback lands.
await bundleIife("src/content/sadNavMain.ts", "sadNavMain.js");
await bundleIife("src/background/index.ts", "background.js");

if (!watch) {
  console.log("\n✓ Built dist/ — sidepanel.html, content.js, background.js, manifest.json, icons/");
}
