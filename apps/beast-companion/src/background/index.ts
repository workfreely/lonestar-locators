import type { RuntimeMessage } from "@/types";
import { log, logError } from "@/utils/log";

/**
 * Background service worker.
 *
 * Owns opening the native side panel. It NEVER disables the panel (closing is
 * Chrome's native X only), so the panel can't get stuck disabled.
 *
 * Opening trace is logged end-to-end: "OPEN_PANEL → enable → open SUCCESS/
 * FAILURE" with the complete Chrome runtime error, so a gesture rejection is
 * visible in the service-worker console.
 */

const SIDE_PANEL_PATH = "sidepanel.html";

function enableActionOpen(): void {
  // Toolbar icon opens the panel — a 100%-reliable user gesture and the fallback
  // whenever the in-page launcher hits Chrome's post-manual-close gesture bug.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => logError("setPanelBehavior failed:", err));
}

chrome.runtime.onInstalled.addListener(enableActionOpen);
enableActionOpen(); // also on worker startup

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
  if (message.type !== "OPEN_PANEL") return; // CLOSE_PANEL is handled by the panel page

  const tabId = sender.tab?.id;
  if (typeof tabId !== "number") {
    logError("OPEN_PANEL received without a tab id — ignoring");
    return;
  }

  log(`OPEN_PANEL for tab ${tabId} → ensure enabled → open`);

  // Ensure this tab's panel is enabled with the correct path. Idempotent
  // (default_path already enables it globally). Fire-and-forget so it does NOT
  // insert an async gap before open() that would cost us the user gesture.
  chrome.sidePanel
    .setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true })
    .catch((err) => logError("setOptions(enable) failed:", err));

  // Open synchronously in this handler to preserve the content-script gesture.
  chrome.sidePanel
    .open({ tabId })
    .then(() => log(`open SUCCESS for tab ${tabId}`))
    .catch((err) =>
      logError(
        `open FAILURE for tab ${tabId} — use the toolbar icon as fallback. Full error:`,
        err,
        "| message:",
        (err as Error)?.message,
      ),
    );
});
