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

  // IMPORTANT: we deliberately do NOT tear down on `pagehide`.
  //
  // Smart Apartment Data is an ASP.NET app that redirects (root → app.) and does
  // full-page postbacks; each of those fires `pagehide`. Tearing down there made
  // the tab "flash then disappear". A real navigation destroys the page anyway
  // (and re-injects this script fresh), so no pagehide cleanup is needed — and
  // on bfcache restore we WANT the already-mounted tab to stay.
  //
  // We only clean up when the extension itself goes away (update/disable), so no
  // injected styles are ever left orphaned on the host page.
  try {
    chrome.runtime.connect().onDisconnect.addListener(teardown);
  } catch {
    // chrome.runtime may be unavailable in some edge contexts — non-fatal.
  }
}

init();
