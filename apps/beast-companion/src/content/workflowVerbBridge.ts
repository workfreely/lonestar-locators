import { log, warn } from "@/utils/log";

/**
 * Phase 3 (Slice A) — Companion → CRM workflow-verb bridge. The CRM-PAGE end.
 *
 * This is the reverse of the Phase 2 active-client bridge. The side panel writes
 * a verb request to chrome.storage.local["lb-workflow-verb"]; this content script
 * (isolated world, same origin) relays it into the page via window.postMessage so
 * the authenticated CRM (DashboardClient) can run the SAME canonical workflow the
 * Lead Panel uses. The CRM re-posts the updated active client through the Phase 2
 * bridge, so Companion reflects the result with no manual refresh.
 *
 * The panel includes a fresh `nonce` on every request so chrome.storage.onChanged
 * fires even for an identical repeated verb (e.g. Text tapped twice).
 *
 * SECURITY: this only forwards the request to first-party CRM code, which
 * performs solely what the signed-in user can already do on that page.
 */

const STORAGE_KEY = "lb-workflow-verb";
const MSG_SOURCE = "lb-companion";

function isCrmPage(): boolean {
  const h = location.hostname;
  const onAdmin = location.pathname.startsWith("/admin");
  const isLb = h === "locatorbeast.com" || h === "www.locatorbeast.com";
  const isLocal = h === "localhost" || h === "127.0.0.1"; // dev only (see build.mjs)
  return onAdmin && (isLb || isLocal);
}

export function startWorkflowVerbBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("workflow-verb bridge: chrome.storage unavailable — verbs disabled");
    return;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    const verb = changes[STORAGE_KEY].newValue;
    if (!verb || typeof verb !== "object") return;
    window.postMessage({ source: MSG_SOURCE, type: "workflow-verb", payload: verb }, location.origin);
  });

  log("workflow-verb bridge active on", location.host + location.pathname);
}
