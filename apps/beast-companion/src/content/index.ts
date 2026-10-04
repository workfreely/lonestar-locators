import { HOST_ID, createLauncher, type Launcher } from "./launcher";
import { startPersistenceGuard } from "./persistence";
import { detectSite, readPageContext } from "./context";
import { startThemeBridge } from "./themeBridge";
import { startWorkspaceModeBridge } from "./workspaceModeBridge";
import { startTourModeBridge } from "./tourModeBridge";
import { startActiveClientBridge } from "./activeClientBridge";
import { startWorkflowVerbBridge } from "./workflowVerbBridge";
import { startCommLaunchBridge } from "./commLaunchBridge";
import { startCardOpenBridge } from "./cardOpenBridge";
import { startCurrentPropertyBridge, syncCurrentProperty } from "./currentPropertyBridge";
import { startMapPropertyBridge } from "./mapPropertyBridge";
import { startEnrichmentBridge } from "./enrichmentBridge";
import { startShareLinkBridge } from "./shareLinkBridge";
import { startOutOfOfficeBridge } from "./outOfOfficeBridge";
import { log, logError } from "@/utils/log";
import type { PanelSide } from "@/types";

/**
 * Content-script entry (document_start).
 *
 * Injected only on the supported sites/paths declared in the manifest
 * (smartapartmentdata.com everywhere; locatorbeast.com ONLY under /admin/*, never
 * the public marketing pages).
 *
 * Jobs: paint the launcher tab, keep it attached, OPEN the native side panel on
 * click, mirror the launcher to the panel's docked side, and report lightweight
 * page context (URL/site/section — no client data).
 *
 * OPEN-ONLY: the launcher never toggles or closes. Chrome's native X is the sole
 * close control, so there is no open/closed state to track and nothing to desync.
 */

const INJECTED_FLAG = "__beastCompanionInjected";
declare global {
  interface Window {
    [INJECTED_FLAG]?: boolean;
  }
}

function requestOpen(): void {
  log("launcher click → requesting OPEN");
  // Ask the background to open the global native panel for this window. Sent
  // synchronously inside the click handler to preserve the user gesture.
  chrome.runtime.sendMessage({ type: "OPEN_PANEL" }).catch((err) => {
    logError("sendMessage(OPEN_PANEL) failed:", err);
  });
}

/** Ask the SW which side the panel is docked on and mirror the launcher to it. */
function syncSide(launcher: Launcher): void {
  chrome.runtime
    .sendMessage({ type: "GET_PANEL_SIDE" })
    .then((res: { side?: PanelSide } | undefined) => {
      const side = res?.side === "left" ? "left" : "right";
      launcher.setSide(side);
      log(`launcher mirrored to ${side} side`);
    })
    .catch((err) => logError("GET_PANEL_SIDE failed — keeping right:", err));
}

/** Report the current page context (URL/site/section) to the SW. */
function reportContext(): void {
  const context = readPageContext();
  chrome.runtime
    .sendMessage({ type: "REPORT_CONTEXT", context })
    .catch((err) => logError("REPORT_CONTEXT failed:", err));
}

/** Re-report context when an SPA route change swaps the URL under our feet. */
function startContextWatcher(): void {
  let lastUrl = location.href;
  const check = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    log("navigation detected →", lastUrl);
    reportContext();
    // Re-detect the the external property site property on every navigation (open A → B,
    // property → results, etc.) — reuses this one watcher, no extra polling.
    syncCurrentProperty();
  };
  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);
  // Next.js/SPA pushState navigations fire no event we can hear from the isolated
  // world, so poll cheaply as a backstop.
  setInterval(check, 1000);
}

function init(): void {
  try {
    log("content start (document_start) on", location.href, "— site:", detectSite(location.host));

    if (window[INJECTED_FLAG] || document.getElementById(HOST_ID)) {
      log("already injected — skipping");
      return;
    }
    window[INJECTED_FLAG] = true;

    const launcher = createLauncher(requestOpen);
    startPersistenceGuard(launcher.host);

    // Mirror to the panel's side now, and again whenever the user returns to the
    // tab (the only time they could have moved the panel left/right — there is no
    // onLayoutChanged event, so a focus re-query is the supported approach).
    syncSide(launcher);
    window.addEventListener("focus", () => syncSide(launcher));

    reportContext();
    startContextWatcher();

    // Local theme sync (Stage T1) — no-op on non-CRM pages; self-gated inside.
    startThemeBridge();

    // Board→Map contextual default for the Companion tab (no client data).
    startWorkspaceModeBridge();

    // Schedule Tour from a Workspace Favorite → Companion enters Tour Mode.
    startTourModeBridge();

    // Active-client bridge (Phase 2, read-only) — relays the CRM's selected
    // client into chrome.storage for the panel. Self-gated to CRM pages.
    startActiveClientBridge();

    // Workflow-verb bridge (Phase 3) — relays Companion action requests from
    // chrome.storage to the authenticated CRM page. Self-gated to CRM pages.
    startWorkflowVerbBridge();

    // Comm-launch bridge (Phase 3) — initiates tel:/sms: from the CRM page itself
    // so no protocol tab is created. Self-gated to CRM pages.
    startCommLaunchBridge();

    // Card-open bridge (Phase 3) — an intentional lead-card click opens the native
    // side panel, still inside the click gesture. Self-gated to CRM pages; distinct
    // from the passive active-client sync above.
    startCardOpenBridge();

    // Current Property bridge — detects the the external property site property-detail
    // page (URL propertyID primary) and relays it into chrome.storage for the
    // panel. Self-gated: writes null on any non-property page. Never persisted.
    startCurrentPropertyBridge();

    // Map-property bridge — a Beast Property Explorer marker click becomes the
    // Current Property, writing the SAME storage key the the external site detector above uses.
    // Self-gated to CRM pages, and never writes null: unlike detection, it acts
    // only on an explicit click, so it cannot clear a property found in a the external site tab.
    startMapPropertyBridge();

    // Enrichment bridge — relays a the external site Current Property's {name,address} to the CRM
    // for place_id resolution + property_catalog lookup, and writes the catalog-only
    // answer back for the panel to merge. Self-gated to CRM pages.
    startEnrichmentBridge();

    // Share-link bridge — relays a Send List share request {leadId} to the CRM, which
    // reuse-or-mints the snapshot and resolves its stable /r/<token> URL, then writes
    // the answer back for the panel's Preview / Copy Link. Self-gated to CRM pages.
    startShareLinkBridge();

    // Out-of-Office bridge — relays the Companion hamburger's read/write of the
    // workspace's away state to the CRM, which performs the authenticated call and
    // writes the STORED state back. Self-gated to CRM pages.
    startOutOfOfficeBridge();

    log("ready — launcher docked; click opens the native side panel (native X closes)");
  } catch (err) {
    logError("init failed:", err);
  }
}

init();
