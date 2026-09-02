import { log, warn } from "@/utils/log";
import {
  ACTIVE_CLIENT_KEY,
  clearSensitive,
  gateAllowsWrite,
  writeSensitive,
} from "@/utils/sensitiveStore";
import {
  isKnownEnvelope,
  isTrustedMessageEvent,
  isValidActiveClientPayload,
  MSG_SOURCE,
} from "@/utils/validate";

/**
 * Phase 2 — active-client bridge (read-only). The CRM-PAGE end.
 *
 * Selecting a client in the CRM (Kanban/Agenda → workspace) makes it Beast
 * Companion's active client. The CRM is already authenticated (web session) and
 * holds the lead in memory, so it builds a read-only LeadSummaryDTO and posts it
 * to the page:  window.postMessage({ source:"lb-companion", type:"active-client",
 * payload }). This content script (isolated world, same origin) relays that
 * payload into chrome.storage.local["lb-active-client"], the panel's canonical
 * source. The panel reads it on mount and via chrome.storage.onChanged.
 *
 * Persistence + lifecycle: chrome.storage.local survives the side panel being
 * closed/reopened, and the CRM never posts a "clear" — closing the workspace
 * leaves the last active client in place. Compare-before-write avoids redundant
 * onChanged churn.
 *
 * NOTE: this is the interim, CRM-supplied read path. When the extension gains its
 * own auth token, the bridge can shrink to a leadId and the panel can refetch the
 * authorized detail server-side; the storage key + panel consumer stay the same.
 */


function isCrmPage(): boolean {
  const h = location.hostname;
  const onAdmin = location.pathname.startsWith("/admin");
  const isLb = h === "locatorbeast.com" || h === "www.locatorbeast.com";
  // Local development only. __LB_DEV__ is inlined as `false` by production builds,
  // so this branch — and the localhost strings in it — are removed from the shipped
  // extension, while a --watch build (whose manifest DOES inject on localhost) can
  // still drive the local CRM.
  const isLocal = __LB_DEV__ && (h === "localhost" || h === "127.0.0.1");
  return onAdmin && (isLb || isLocal);
}

export function startActiveClientBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("active-client bridge: chrome.storage unavailable — sync disabled");
    return;
  }

  // Register this tab as the CRM tab on MOUNT — before any (consent-gated) publish —
  // so the replay handshake can route REQUEST_CURRENT_STATE here even when the first
  // active-client write was dropped by the consent gate. Best-effort; also re-sent
  // after a successful write below.
  chrome.runtime?.sendMessage?.({ type: "REPORT_CRM_TAB" }).catch(() => {
    /* background asleep / no receiver — non-fatal */
  });

  // Replay handshake (Background → this content script → the page). The background
  // relays the panel's REQUEST_CURRENT_STATE here; we ask the page to re-publish its
  // current synchronized state. DashboardClient listens for this and re-posts
  // active-client + Current Property through the EXISTING bridge (window → this
  // content script → chrome.storage → panel onChanged). We only forward the request;
  // no page data is read or written here.
  chrome.runtime?.onMessage?.addListener((message: { type?: string }) => {
    if (message?.type !== "REQUEST_CURRENT_STATE") return;
    window.postMessage({ source: MSG_SOURCE, type: "request-current-state" }, location.origin);
  });

  // Last value THIS bridge wrote — a synchronous compare source. Using an async
  // chrome.storage.local.get to read `prev` created a race: during the rapid
  // re-render bursts around Call/Text (each setLocalLeads/NextActions re-fires the
  // CRM broadcast), an in-flight get could read a STALE `prev` and drop the new
  // selection's write, leaving Companion on the previously-shown lead. Comparing
  // synchronously against what we last wrote removes that race entirely while
  // still skipping genuinely-unchanged payloads (no onChanged churn).
  let lastWritten: string | null = null;

  window.addEventListener("message", (e: MessageEvent) => {
    // 1. TRUST — exact origin match plus same-window source. Both must pass
    //    before the payload is even inspected.
    if (!isTrustedMessageEvent(e)) return;

    // 2. ENVELOPE — a known source and a known type. Unknown types are dropped.
    const d = e.data;
    if (!isKnownEnvelope(d)) return;

    // A sign-out broadcast erases everything sensitive immediately, rather than
    // waiting for the owner mismatch or the TTL to catch it later.
    if (d.type === "signed-out") {
      lastWritten = null;
      void clearSensitive();
      log("active-client bridge: signed-out — sensitive storage cleared");
      return;
    }
    if (d.type !== "active-client") return;

    // 3. SCHEMA — identifiable, attributable, size-bounded.
    const payload = d.payload;
    if (!isValidActiveClientPayload(payload)) return;

    const serialized = JSON.stringify(payload);
    if (serialized === lastWritten) return; // genuinely unchanged — skip

    // 4. CONSENT — the gate is on the BRIDGE. Before acceptance nothing is
    //    written at all, so there is no stored-but-hidden client data.
    void (async () => {
      if (!(await gateAllowsWrite())) return;
      const ok = await writeSensitive(ACTIVE_CLIENT_KEY, payload.owner, payload);
      if (!ok) return;
      lastWritten = serialized;

      // This tab supplied the active client — remember it as the "← Back to CRM"
      // target. Best-effort; the panel falls back to a URL-pattern query.
      chrome.runtime?.sendMessage?.({ type: "REPORT_CRM_TAB" }).catch(() => {
        /* background asleep / no receiver — non-fatal */
      });
    })();
  });

  log("active-client bridge active on", location.host + location.pathname);
}
