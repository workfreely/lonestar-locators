import { sendToTab } from "@/services/messaging";

/**
 * Background service worker.
 *
 * Phase 1 responsibility is deliberately tiny: relay a click on the toolbar
 * icon to the active tab's content script so the user can toggle the panel from
 * the Chrome toolbar as well as from the docked tab. It holds NO business logic.
 *
 * This worker is the future home of anything that must run off the page and
 * survive navigations — the CRM auth session, token refresh, and proxied Smart
 * Apartment Data / API calls (so the content script never needs broad host
 * permissions). Keeping it minimal now means those can be added as isolated
 * handlers later without a rewrite.
 */

chrome.runtime.onInstalled.addListener(() => {
  // Placeholder for future first-run setup (e.g. opening an onboarding tab).
  // Intentionally empty in phase 1.
});

// Toolbar icon → toggle the panel in the tab the user clicked from. Only tabs
// running our content script (i.e. whitelisted sites) will receive this; on any
// other tab sendToTab no-ops.
chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id === "number") {
    sendToTab(tab.id, { type: "TOGGLE_PANEL" });
  }
});
