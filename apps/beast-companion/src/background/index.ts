import type { PageContext, PanelSide, RuntimeMessage } from "@/types";
import { log, logError } from "@/utils/log";

/**
 * Background service worker — OPEN-ONLY lifecycle.
 *
 * Evidence-backed pattern (matches Apollo's native side-panel usage: it calls
 * open() but never close()): the launcher only ever OPENS the panel; Chrome's
 * native X is the sole close control; the toolbar icon is a fallback opener via
 * openPanelOnActionClick. There is NO toggle, NO programmatic close(), and NO
 * open/closed state to track — so there is nothing to desync and no stuck state.
 *
 * One GLOBAL native panel per Chrome window (manifest side_panel.default_path +
 * open({windowId})), so the same panel persists across tab switches, refresh,
 * and navigation within a window.
 *
 * CRITICAL: open() must be called SYNCHRONOUSLY in the message handler (no await
 * before it) or Chrome rejects it for losing the user gesture.
 */

const SIDE_PANEL_PATH = "sidepanel.html";

// getLayout() is Chrome 140+; @types/chrome may not type it, so reach it via a
// cast and feature-detect (fallback "right").
type PanelLayout = { side?: PanelSide };
const sidePanel = chrome.sidePanel as unknown as typeof chrome.sidePanel & {
  getLayout?: () => Promise<PanelLayout>;
};

// Latest page context per tab (URL/site/section) — reported by the content
// script. This is NOT panel state; it's the context-reporting pipe.
const contextByTab = new Map<number, PageContext>();

function enablePanel(): void {
  // Enable the GLOBAL panel (no tabId) and make the toolbar icon a reliable
  // fallback opener. Neither is in the click path, so no user-gesture concern.
  chrome.sidePanel
    .setOptions({ path: SIDE_PANEL_PATH, enabled: true })
    .catch((err) => logError("setOptions(global enable) failed:", err));
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => logError("setPanelBehavior failed:", err));
}
chrome.runtime.onInstalled.addListener(enablePanel);
enablePanel(); // also on worker startup
log("background ready — OPEN-ONLY; native X closes; toolbar icon is the fallback opener");

// chrome.storage key holding { tabId, windowId } of the CRM tab that most
// recently supplied the Companion active client — the "← Back to CRM" target.
const CRM_TAB_KEY = "lb-crm-tab";

// Housekeeping only (context cache); no panel state is kept. Also drop the stored
// CRM tab if that exact tab closes, so "← Back to CRM" falls back to the URL query
// instead of trying to activate a tab that no longer exists.
chrome.tabs.onRemoved.addListener((tabId) => {
  contextByTab.delete(tabId);
  chrome.storage.local.get(CRM_TAB_KEY, (res) => {
    if (res?.[CRM_TAB_KEY]?.tabId === tabId) chrome.storage.local.remove(CRM_TAB_KEY);
  });
});

async function getPanelSide(): Promise<PanelSide> {
  try {
    if (typeof sidePanel.getLayout !== "function") return "right";
    const layout = await sidePanel.getLayout();
    return layout?.side === "left" ? "left" : "right";
  } catch (err) {
    logError("getLayout() failed — defaulting to right:", err);
    return "right";
  }
}

function openPanel(windowId: number): void {
  // Synchronous open — preserves the content-script user gesture. Global panel,
  // keyed by window. (@types/chrome wrongly marks windowId required on the type.)
  chrome.sidePanel
    .open({ windowId } as unknown as chrome.sidePanel.OpenOptions)
    .then(() => log(`open SUCCESS for window ${windowId}`))
    .catch((err) =>
      logError(
        `open FAILURE for window ${windowId} — use the toolbar icon as fallback. Full error:`,
        err,
        "| message:",
        (err as Error)?.message,
      ),
    );
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (message.type === "GET_PANEL_SIDE") {
    getPanelSide().then((side) => sendResponse({ side }));
    return true; // async sendResponse — keep the channel open
  }

  if (message.type === "REPORT_CONTEXT") {
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") contextByTab.set(tabId, message.context);
    log(
      `context — tab=${tabId ?? "?"} site=${message.context.site} ` +
        `${message.context.host}${message.context.path}`,
    );
    return;
  }

  if (message.type === "REPORT_CRM_TAB") {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (typeof tabId === "number" && typeof windowId === "number") {
      chrome.storage.local.set({ [CRM_TAB_KEY]: { tabId, windowId } });
      log(`crm-tab — remembered tab=${tabId} window=${windowId} for ← Back to CRM`);
    }
    return;
  }

  if (message.type === "OPEN_PANEL") {
    const windowId = sender.tab?.windowId;
    if (typeof windowId !== "number") {
      logError("OPEN_PANEL received without a window id — ignoring");
      return;
    }
    openPanel(windowId); // synchronous — no await before open()
    return;
  }
});
