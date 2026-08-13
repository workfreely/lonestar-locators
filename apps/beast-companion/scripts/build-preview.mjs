import { cpSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { build } from "vite";

/**
 * Builds the TEMPORARY Phase 3 PREVIEW extension to an out-of-tree directory.
 * This is dev-only tooling — the artifact is NEVER production and is NOT committed
 * to the repo. It renders the sanitized lead panel + dev controls inside Chrome's
 * real native Side Panel, opened from its own toolbar icon (no injected launcher),
 * so it cannot conflict with the production Companion.
 *
 * Run: node scripts/build-preview.mjs   (from apps/beast-companion)
 */

const OUT = "/Users/jaymorris/beast-companion-phase3-preview-dist";
const TMP = ".preview-build";

// 1) Vite build of the preview HTML (uses this package's vite.config aliases).
rmSync(TMP, { recursive: true, force: true });
await build({
  base: "./", // relative asset paths so it loads from the extension root
  build: {
    outDir: TMP,
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    rollupOptions: { input: { preview: "preview/preview.html" } },
  },
});

// 2) Assemble the loadable extension dir.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(TMP, OUT, { recursive: true }); // preview/preview.html + assets/
copyFileSync("preview/manifest.json", `${OUT}/manifest.json`);
copyFileSync("preview/preview-background.js", `${OUT}/background.js`);
cpSync("public/icons", `${OUT}/icons`, { recursive: true });
rmSync(TMP, { recursive: true, force: true });

console.log(`\n✓ Phase 3 preview built → ${OUT}`);
console.log("  (temporary, sanitized, no network — load unpacked; NOT production)");
