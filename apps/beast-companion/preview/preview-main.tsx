import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "@/sidepanel/sidepanel.css";
import { applyTheme } from "@/sidepanel/applyTheme";
import { PreviewHarness } from "./PreviewHarness";

/**
 * Entry for the TEMPORARY Phase 3 preview extension. Always renders the preview
 * harness (this build is never production). No launcher, no network, no storage.
 */

applyTheme();

const container = document.getElementById("root");
if (container) {
  // Idempotent mount: reuse the root if this entry ever runs twice (HMR re-exec,
  // duplicate <script>, or a re-run side-panel document) so we never create a
  // second React root that renders a second, overlapping preview panel.
  const store = window as unknown as { __bcPreviewRoot?: Root };
  const root = store.__bcPreviewRoot ?? (store.__bcPreviewRoot = createRoot(container));
  root.render(
    <StrictMode>
      <PreviewHarness />
    </StrictMode>,
  );
}
