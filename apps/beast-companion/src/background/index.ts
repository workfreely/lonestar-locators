import type { RuntimeMessage } from "@/types";
import { log, logError } from "@/utils/log";

/**
 * Background service worker.
 *
 * Owns opening the native side panel (a privileged, gesture-sensitive action
 * content scripts can't call directly) and the toolbar-icon fallback. It will
 * later host CRM auth/session and property-context relaying between the content
 * scripts and the panel.
 */

// Toolbar icon → open the side panel. This path is a 100%-reliable user gesture,
// so it always works even if the in-page launcher hits Chrome's known
// open-after-manual-close gesture bug.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => logError("setPanelBehavior failed:", err));
});
// Also set it on worker startup (onInstalled only fires on install/update).
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => logError("setPanelBehavior failed:", err));

// Launcher → open the native panel for the tab the click came from. Calling
// open() synchronously in the message handler preserves the content-script user
// gesture on Chrome versions that allow it.
chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
  if (message.type === "OPEN_PANEL") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") return;
    chrome.sidePanel
      .open({ tabId })
      .then(() => log("side panel opened for tab", tabId))
      .catch((err) =>
        logError("sidePanel.open() failed (use the toolbar icon as fallback):", err),
      );
  }
  // CLOSE_PANEL is handled by the side-panel page itself (window.close()).
});
