/*
 * Minimal service worker for the TEMPORARY Phase 3 preview extension.
 * Its ONLY job is to make the toolbar action icon open the native side panel.
 * No content script, no messaging, no launcher, no network — so it cannot
 * conflict with the production Companion.
 */
function enable() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
}
chrome.runtime.onInstalled.addListener(enable);
enable();
