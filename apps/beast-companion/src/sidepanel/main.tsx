import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { PanelApp } from "./PanelApp";
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
  const root = createRoot(container);
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
        <PanelApp />
      </StrictMode>,
    );
  }
}
