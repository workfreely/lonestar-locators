import type { PageContext, PanelSide, RuntimeMessage } from "@/types";
import { log, logError } from "@/utils/log";

/**
 * Background service worker — the single source of truth for panel state.
 *
 * ARCHITECTURE: one persistent Companion PER CHROME WINDOW (window-global, not
 * tab-specific). We rely on the manifest's `side_panel.default_path` (the global
 * panel) and open/close by `windowId`, so the same panel persists across tab
 * switches and navigation within a window.
 *
 * STATE DURABILITY (fixes the "stuck after N cycles" bug): the in-memory map is
 * only a cache. MV3 suspends this worker after ~30s idle and wipes globals, so
 * the authoritative open/closed state is mirrored to chrome.storage.session
 * (survives suspension, cleared on browser restart) and re-hydrated on startup.
 * State is learned from Chrome's native onOpened/onClosed events (not pagehide).
 *
 * CONCURRENCY: a per-window operation lock prevents a second toggle while open()
 * or close() is unresolved or Chrome is mid-transition. The lock is cleared by
 * the native lifecycle event, with a timeout fallback. It NEVER disables the
 * panel to close it — close() is the close path.
 */

const SIDE_PANEL_PATH = "sidepanel.html";
const STATE_KEY = "panelStateByWindow";
const LOCK_TIMEOUT_MS = 1500;

type PanelOpen = "open" | "closed";
const now = () => Math.round(performance.now());

// ── Defensive facade over the newer sidePanel surface ────────────────────────
// close() 141+, onOpened 141+, onClosed 142+, getLayout 140+. @types/chrome may
// not type all of these, so reach them through a cast and feature-detect.
type WindowOptions = { windowId?: number; tabId?: number };
type PanelLayout = { side?: PanelSide };
type PanelOpenedInfo = { path: string; tabId?: number; windowId: number };
type PanelClosedInfo = { path: string; tabId?: number; windowId: number };
type EventLike<T> = { addListener: (cb: (info: T) => void) => void };
type SidePanelExtra = {
  close?: (options: WindowOptions) => Promise<void>;
  getLayout?: () => Promise<PanelLayout>;
  onOpened?: EventLike<PanelOpenedInfo>;
  onClosed?: EventLike<PanelClosedInfo>;
};
const sidePanel = chrome.sidePanel as unknown as typeof chrome.sidePanel & SidePanelExtra;

const CAN_CLOSE = typeof sidePanel.close === "function";
const CAN_TRACK =
  Boolean(sidePanel.onOpened?.addListener) && Boolean(sidePanel.onClosed?.addListener);
const CAN_TOGGLE = CAN_CLOSE && CAN_TRACK;

// ── State (cache mirrored to storage.session) + per-window operation lock ────
const stateByWindow = new Map<number, PanelOpen>();
const contextByTab = new Map<number, PageContext>();
const locks = new Map<number, ReturnType<typeof setTimeout>>();

// Hydrate the cache from durable session storage as soon as the worker starts.
const hydrated: Promise<void> = chrome.storage.session
  .get(STATE_KEY)
  .then((o) => {
    const m = (o[STATE_KEY] ?? {}) as Record<string, PanelOpen>;
    for (const [w, s] of Object.entries(m)) stateByWindow.set(Number(w), s);
    log(`[${now()}] hydrated panel state from storage.session:`, JSON.stringify(m));
  })
  .catch((err) => logError("hydrate failed:", err));

function persist(): void {
  chrome.storage.session
    .set({ [STATE_KEY]: Object.fromEntries(stateByWindow) })
    .catch((err) => logError("persist failed:", err));
}
function setState(windowId: number, s: PanelOpen): void {
  stateByWindow.set(windowId, s);
  persist();
}
function getState(windowId: number): PanelOpen {
  return stateByWindow.get(windowId) ?? "closed";
}

function isLocked(windowId: number): boolean {
  return locks.has(windowId);
}
function acquireLock(windowId: number): void {
  // Timeout fallback: if no onOpened/onClosed arrives, force-release so the
  // launcher can't get permanently stuck.
  const timer = setTimeout(() => {
    if (locks.has(windowId)) {
      locks.delete(windowId);
      log(`[${now()}] lock released by TIMEOUT for window ${windowId}`);
    }
  }, LOCK_TIMEOUT_MS);
  locks.set(windowId, timer);
}
function releaseLock(windowId: number, reason: string): void {
  const timer = locks.get(windowId);
  if (timer === undefined) return;
  clearTimeout(timer);
  locks.delete(windowId);
  log(`[${now()}] lock released (${reason}) for window ${windowId}`);
}

// ── Enable the global panel + toolbar-icon open ──────────────────────────────
function enableGlobalPanel(): void {
  // Global (no tabId): one panel definition for every tab in the window.
  chrome.sidePanel
    .setOptions({ path: SIDE_PANEL_PATH, enabled: true })
    .catch((err) => logError("setOptions(global enable) failed:", err));
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => logError("setPanelBehavior failed:", err));
}
chrome.runtime.onInstalled.addListener(enableGlobalPanel);
enableGlobalPanel();
log(
  `[${now()}] background ready — CAN_CLOSE=${CAN_CLOSE} CAN_TRACK=${CAN_TRACK} ` +
    `→ ${CAN_TOGGLE ? "native window toggle" : "open-only fallback (native X to close)"}`,
);

// ── Learn the true state from Chrome's native lifecycle events ───────────────
if (CAN_TRACK) {
  sidePanel.onOpened!.addListener((info) => {
    setState(info.windowId, "open");
    releaseLock(info.windowId, "onOpened");
    log(`[${now()}] native onOpened — window=${info.windowId} tab=${info.tabId ?? "-"}`);
  });
  sidePanel.onClosed!.addListener((info) => {
    setState(info.windowId, "closed");
    releaseLock(info.windowId, "onClosed");
    log(`[${now()}] native onClosed — window=${info.windowId} tab=${info.tabId ?? "-"}`);
  });
}

// Housekeeping: forget windows/tabs that go away.
chrome.windows.onRemoved.addListener((windowId) => {
  stateByWindow.delete(windowId);
  releaseLock(windowId, "windowRemoved");
  persist();
});
chrome.tabs.onRemoved.addListener((tabId) => contextByTab.delete(tabId));

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

// ── The toggle ───────────────────────────────────────────────────────────────
async function toggle(windowId: number, tClick: number): Promise<void> {
  // Debounce: drop toggles while a transition is in flight for this window.
  if (isLocked(windowId)) {
    log(`[${now()}] TOGGLE window ${windowId} DROPPED — locked (transition in flight)`);
    return;
  }
  acquireLock(windowId); // sync, before any await — rapid clicks can't race
  await hydrated; // ensure state cache is restored after a cold worker start

  const state = getState(windowId);
  const wantOpen = state !== "open";
  log(
    `[${now()}] TOGGLE window ${windowId} — clickTs=${tClick} storedState=${state} ` +
      `→ requesting ${wantOpen ? "open()" : "close()"}`,
  );

  if (!wantOpen && !CAN_TOGGLE) {
    // Fallback build can't close programmatically — leave it to the native X.
    log(`[${now()}] no close() available — native X closes; releasing lock`);
    releaseLock(windowId, "no-close-fallback");
    return;
  }

  const op: Promise<void> = wantOpen
    ? chrome.sidePanel.open({ windowId } as unknown as chrome.sidePanel.OpenOptions)
    : sidePanel.close!({ windowId });

  op.then(() => {
    // Optimistic state on resolution (belt-and-suspenders with the event, which
    // is authoritative and also releases the lock).
    setState(windowId, wantOpen ? "open" : "closed");
    log(`[${now()}] ${wantOpen ? "open()" : "close()"} RESOLVED for window ${windowId}`);
    if (!CAN_TRACK) releaseLock(windowId, "op-resolved(no-events)");
  }).catch((err) => {
    logError(
      `[${now()}] ${wantOpen ? "open()" : "close()"} FAILED for window ${windowId} —`,
      err,
      "| message:",
      (err as Error)?.message,
    );
    releaseLock(windowId, "op-rejected");
  });
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
      `[${now()}] context — tab=${tabId ?? "?"} site=${message.context.site} ` +
        `${message.context.host}${message.context.path}`,
    );
    return;
  }

  if (message.type === "TOGGLE_PANEL") {
    const windowId = sender.tab?.windowId;
    const tClick = message.clickTs ?? now();
    if (typeof windowId !== "number") {
      logError("TOGGLE_PANEL received without a window id — ignoring");
      return;
    }
    void toggle(windowId, tClick);
    return;
  }
});
