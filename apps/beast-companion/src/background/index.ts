import type { PageContext, PanelSide, RuntimeMessage } from "@/types";
import { log, logError } from "@/utils/log";

/**
 * Background service worker — the single source of truth for panel state.
 *
 * The launcher never decides open-vs-close; it just forwards a TOGGLE. This SW
 * tracks which tabs currently have the panel open, learning the truth from
 * Chrome's native lifecycle events (onOpened / onClosed) rather than pagehide or
 * delayed storage. That means the native X, the toolbar icon, and the launcher
 * all keep the same authoritative state, so a toggle can never misfire.
 *
 * It NEVER disables the panel merely to close it — close() is the close path.
 */

const SIDE_PANEL_PATH = "sidepanel.html";

// ── Defensive facade over the newer sidePanel surface ────────────────────────
// close() is Chrome 141+, onOpened 141+, onClosed 142+, getLayout 140+. @types/chrome
// may not type all of these, so reach them through a cast and feature-detect.
type CloseOptions = { tabId?: number; windowId?: number };
type PanelLayout = { side?: PanelSide };
type PanelOpenedInfo = { path: string; tabId?: number; windowId: number };
type PanelClosedInfo = { path: string; tabId?: number; windowId: number };
type EventLike<T> = { addListener: (cb: (info: T) => void) => void };

type SidePanelExtra = {
  close?: (options: CloseOptions) => Promise<void>;
  getLayout?: () => Promise<PanelLayout>;
  onOpened?: EventLike<PanelOpenedInfo>;
  onClosed?: EventLike<PanelClosedInfo>;
};

const sidePanel = chrome.sidePanel as unknown as typeof chrome.sidePanel & SidePanelExtra;

const CAN_CLOSE = typeof sidePanel.close === "function";
const CAN_TRACK =
  Boolean(sidePanel.onOpened?.addListener) && Boolean(sidePanel.onClosed?.addListener);
const CAN_TOGGLE = CAN_CLOSE && CAN_TRACK;

// ── Authoritative open-state, keyed by tab (our panels are tab-specific) ─────
const openTabs = new Set<number>();
// Latest page context per tab (URL/site/section) — reported by the content script.
const contextByTab = new Map<number, PageContext>();

function enableActionOpen(): void {
  // Toolbar icon opens the panel — a 100%-reliable user gesture and the fallback
  // whenever the in-page launcher hits Chrome's post-manual-close gesture bug.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => logError("setPanelBehavior failed:", err));
}

chrome.runtime.onInstalled.addListener(enableActionOpen);
enableActionOpen(); // also on worker startup
log(
  `background ready — CAN_CLOSE=${CAN_CLOSE} CAN_TRACK=${CAN_TRACK} ` +
    `→ ${CAN_TOGGLE ? "native toggle" : "open-only fallback (native X to close)"}`,
);

// ── Learn the true state from Chrome's native lifecycle events ───────────────
if (CAN_TRACK) {
  sidePanel.onOpened!.addListener((info) => {
    if (typeof info.tabId === "number") openTabs.add(info.tabId);
    log(`native onOpened — tab=${info.tabId ?? "?"} window=${info.windowId} path=${info.path}`);
  });
  sidePanel.onClosed!.addListener((info) => {
    if (typeof info.tabId === "number") openTabs.delete(info.tabId);
    log(`native onClosed — tab=${info.tabId ?? "?"} window=${info.windowId} path=${info.path}`);
  });
}

// Housekeeping: forget tabs that go away.
chrome.tabs.onRemoved.addListener((tabId) => {
  openTabs.delete(tabId);
  contextByTab.delete(tabId);
});

// ── getLayout()-backed panel side (Chrome 140+), for launcher mirroring ──────
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

function ensureEnabledAndOpen(tabId: number): void {
  // Ensure this tab's panel is enabled with the correct path (idempotent).
  // Fire-and-forget so it doesn't insert an async gap before open() that would
  // cost us the user gesture.
  chrome.sidePanel
    .setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true })
    .catch((err) => logError("setOptions(enable) failed:", err));
  // Open synchronously to preserve the content-script user gesture. (@types/chrome
  // wrongly marks windowId required on OpenOptions; the runtime accepts tabId-only.)
  const open = chrome.sidePanel.open({ tabId } as unknown as chrome.sidePanel.OpenOptions);
  open
    .then(() => log(`open SUCCESS for tab ${tabId}`))
    .catch((err) =>
      logError(
        `open FAILURE for tab ${tabId} — use the toolbar icon as fallback. Full error:`,
        err,
        "| message:",
        (err as Error)?.message,
      ),
    );
}

function toggle(tabId: number): void {
  if (CAN_TOGGLE && openTabs.has(tabId)) {
    log(`TOGGLE tab ${tabId}: state=open → close()`);
    sidePanel
      .close!({ tabId })
      .then(() => {
        openTabs.delete(tabId); // optimistic; onClosed confirms
        log(`close SUCCESS for tab ${tabId}`);
      })
      .catch((err) => logError(`close FAILURE for tab ${tabId}:`, err));
    return;
  }
  // Closed (or we can't track/close) → open. In the open-only fallback this is
  // always an open; the native X remains the way to close.
  log(`TOGGLE tab ${tabId}: state=${CAN_TOGGLE ? "closed" : "unknown(fallback)"} → open()`);
  ensureEnabledAndOpen(tabId);
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
    return; // no response
  }

  if (message.type === "TOGGLE_PANEL") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      logError("TOGGLE_PANEL received without a tab id — ignoring");
      return;
    }
    toggle(tabId);
    return;
  }
});
