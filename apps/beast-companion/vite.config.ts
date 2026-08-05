import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// @crxjs/vite-plugin turns this into a valid MV3 bundle:
//  - transpiles the background service worker and the content script (incl. TSX),
//  - rewrites the src/* paths in manifest.json to the built output,
//  - manages web_accessible_resources for the content script's code-split chunks.
// We deliberately keep the manifest tiny (see manifest.json) so Chrome only ever
// injects on the whitelisted domain and only "storage" permission is requested.
export default defineConfig({
  // Mirror the tsconfig `@/*` path alias for Rollup/Vite resolution.
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  css: {
    // Isolate from the parent Next.js app's PostCSS/Tailwind config — this
    // extension is standalone and its CSS is plain, hand-written, and
    // Shadow-DOM-scoped. An explicit (empty) config stops PostCSS from walking
    // up the tree and applying the root project's Tailwind pipeline.
    postcss: { plugins: [] },
  },
  plugins: [react(), crx({ manifest })],
  server: {
    // A stable port keeps the dev HMR websocket predictable for MV3.
    port: 5175,
    strictPort: true,
    hmr: { port: 5175 },
  },
  build: {
    // Chrome Web Store rejects sourcemaps referencing eval; emit clean output.
    sourcemap: false,
    outDir: "dist",
    emptyOutDir: true,
  },
});
