import { mountSidebar, type MountHandle } from "./mount";
import { teardownLayout } from "./pageShift";

/**
 * Content-script entry point.
 *
 * Reminder on security: this file only ever runs because manifest.json's
 * content_scripts.matches limited it to https://*.smartapartmentdata.com/*.
 * Chrome does not load it anywhere else, so there is no runtime domain check to
 * get wrong — on every other site this code simply does not exist on the page.
 *
 * Responsibilities: guard against double-injection, mount the Shadow-DOM UI, and
 * guarantee the host page is restored to its original layout when we unload.
 */

const INJECTED_FLAG = "__beastCompanionInjected";

declare global {
  interface Window {
    [INJECTED_FLAG]?: boolean;
  }
}

function init(): void {
  if (window[INJECTED_FLAG]) return; // idempotent — never mount twice
  window[INJECTED_FLAG] = true;

  // Diagnostic breadcrumb — lets you confirm injection in the page's DevTools
  // console (Smart Apartment Data tab). Harmless; kept intentionally.
  console.info("[Beast Companion] content script injected on", location.href);

  let handle: MountHandle | null = mountSidebar();
  console.info("[Beast Companion] sidebar mounted (look for the tab on the right edge)");

  const teardown = () => {
    // Restore the host page's layout and remove our UI. Safe to call twice.
    teardownLayout();
    handle?.unmount();
    handle = null;
  };

  // Clean up on navigation away / bfcache and on extension reload/disable.
  window.addEventListener("pagehide", teardown, { once: true });
  try {
    // When the extension is updated/disabled the port disconnects; we tear down
    // so no injected styles are left behind on the host page.
    chrome.runtime.connect().onDisconnect.addListener(teardown);
  } catch {
    // chrome.runtime may be unavailable in some edge contexts — non-fatal.
  }
}

init();
