import type { PanelState } from "@/types";

/**
 * Thin, typed wrapper over chrome.storage.local.
 *
 * Isolating chrome.* access behind a service keeps the React/UI layer testable
 * and makes it trivial to later swap persistence (e.g. sync storage, or a CRM-
 * backed preference) without touching components.
 */

const KEY_PANEL_STATE = "beast:panelState";

export async function getPanelState(): Promise<PanelState> {
  const result = await chrome.storage.local.get(KEY_PANEL_STATE);
  return result[KEY_PANEL_STATE] === "open" ? "open" : "closed";
}

export async function setPanelState(state: PanelState): Promise<void> {
  await chrome.storage.local.set({ [KEY_PANEL_STATE]: state });
}

/**
 * Subscribe to panel-state changes made in other tabs/contexts. Returns an
 * unsubscribe function so React effects can clean up.
 */
export function onPanelStateChanged(cb: (state: PanelState) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local" || !changes[KEY_PANEL_STATE]) return;
    cb(changes[KEY_PANEL_STATE].newValue === "open" ? "open" : "closed");
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
