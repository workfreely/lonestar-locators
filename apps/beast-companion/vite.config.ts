import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Shared Vite config (plugins, path alias, CSS isolation).
 *
 * We intentionally do NOT use a MV3 bundler plugin. Instead `scripts/build.mjs`
 * runs Vite's build() once per entry to emit two SELF-CONTAINED IIFE files —
 * `content.js` and `background.js`. That output is the simplest thing Chrome can
 * load unpacked: the content script is a single classic script listed directly
 * in the manifest, with NO loaders, NO dynamic imports, and NO
 * web_accessible_resources. Fewer moving parts = fewer ways for Chrome to reject
 * the extension.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Shared domain types / Zod contracts / design tokens (packages/companion-shared).
      "@bc/companion-shared": fileURLToPath(
        new URL("../../packages/companion-shared/src/index.ts", import.meta.url),
      ),
      "@bc": fileURLToPath(new URL("../../packages/companion-shared/src", import.meta.url)),
    },
  },
  css: {
    // Isolate from the parent Next.js app's PostCSS/Tailwind config.
    postcss: { plugins: [] },
  },
  plugins: [react()],
});
