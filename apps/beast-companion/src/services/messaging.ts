import type { RuntimeMessage } from "@/types";

/**
 * Typed helpers around chrome.runtime messaging.
 *
 * Today this only carries a "toggle panel" signal from the toolbar action to
 * the content script. It is the same channel that will later carry the CRM auth
 * handshake and Smart Apartment Data requests between the content script and the
 * background worker — so keeping it typed and centralized now pays off later.
 */

/** Send a message to a specific tab's content script (used by the background). */
export function sendToTab(tabId: number, message: RuntimeMessage): void {
  // Fire-and-forget: if the tab has no content script (i.e. it's not a
  // whitelisted site), this rejects harmlessly and we ignore it.
  void chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

/**
 * Listen for runtime messages in the content script. Returns an unsubscribe fn.
 */
export function onRuntimeMessage(cb: (message: RuntimeMessage) => void): () => void {
  const listener = (message: RuntimeMessage) => {
    cb(message);
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
