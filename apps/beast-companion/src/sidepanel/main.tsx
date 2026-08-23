import { StrictMode, Suspense, lazy } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProductionPanel } from "./ProductionPanel";
import { ConsentGate } from "./ConsentGate";
import "./sidepanel.css";
import { applyTheme } from "./applyTheme";
import { log } from "@/utils/log";

/**
 * Side-panel entry point. Runs in the NATIVE Chrome side panel document, which
 * Chrome owns and never re-injects on host-page navigation (no flicker). Closing
 * is Chrome's native side-panel X; this document writes no panel state.
 *
 * Phase 3: production renders the real PanelApp (a non-loaded state — no live
 * data yet). The DEV-ONLY preview harness (fixtures / states / themes / widths)
 * is behind `import.meta.env.DEV`; in a production build that branch is `false`,
 * so the dynamic import to ./dev is eliminated and neither the harness nor the
 * sanitized fixtures ship.
 */

log("side panel: loaded");

// Fill in the full shared token set (Midnight default) so every --lb-* resolves.
// The pre-React inline paint in sidepanel.html already covers the first frame.
applyTheme();

const container = document.getElementById("root");
if (container) {
  // Idempotent mount: reuse the existing root if this entry module is ever
  // evaluated twice (HMR re-exec, an accidental duplicate <script>, or a
  // re-run side-panel document). Creating a SECOND createRoot() on #root would
  // mount a second, overlapping panel (two hamburgers / duplicated content) —
  // this makes that structurally impossible.
  const store = window as unknown as { __bcSidePanelRoot?: Root };
  const root = store.__bcSidePanelRoot ?? (store.__bcSidePanelRoot = createRoot(container));
  if (import.meta.env.DEV) {
    const DevHarness = lazy(() =>
      import("./dev/DevHarness").then((m) => ({ default: m.DevHarness })),
    );
    root.render(
      <StrictMode>
        <Suspense fallback={null}>
          <DevHarness />
        </Suspense>
      </StrictMode>,
    );
  } else {
    root.render(
      <StrictMode>
        <ConsentGate>
          <ProductionPanel />
        </ConsentGate>
      </StrictMode>,
    );
  }
}
