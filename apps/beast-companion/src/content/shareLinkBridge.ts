import { log, warn } from "@/utils/log";
import { isTrustedMessageEvent, isKnownEnvelope, isValidShareLinkResultPayload } from "@/utils/validate";

/**
 * Client-share link bridge — the CRM-PAGE end of a request/response round trip that
 * lets the Send List step obtain the immutable snapshot's stable client URL WITHOUT
 * the side panel ever holding the CRM's authenticated session.
 *
 *   • REQUEST  (Companion → CRM): the side panel writes {nonce, leadId} to
 *     chrome.storage.local["lb-share-request"]; this content script relays it into
 *     the page so DashboardClient (which carries the agent's Supabase session) can
 *     reuse-or-mint the snapshot via /api/admin/client-shares and resolve the URL
 *     through the encrypted-token retrieval path.
 *   • RESULT   (CRM → Companion): DashboardClient posts back {nonce, leadId, shareId,
 *     url, listNumber, reused, error}; this script writes it to
 *     chrome.storage.local["lb-share-result"] for the panel to read.
 *
 * The payload carries NO client PII — only a lead id and the snapshot's own /r/<token>
 * URL — so it uses plain local storage (like the workflow-verb and enrichment
 * bridges), not the sensitive store. SECURITY: the result is accepted only after the
 * exact-origin + same-window trust check and the shared envelope/schema validation
 * (which rejects any non-http(s) URL), so a forged page script cannot inject a link.
 */

const REQUEST_KEY = "lb-share-request";
const RESULT_KEY = "lb-share-result";
const MSG_SOURCE = "lb-companion";

function isCrmPage(): boolean {
  const h = location.hostname;
  const onAdmin = location.pathname.startsWith("/admin");
  const isLb = h === "locatorbeast.com" || h === "www.locatorbeast.com";
  // Local development only. __LB_DEV__ is inlined as `false` by production builds.
  const isLocal = __LB_DEV__ && (h === "localhost" || h === "127.0.0.1");
  return onAdmin && (isLb || isLocal);
}

export function startShareLinkBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("share-link bridge: chrome.storage unavailable — share links disabled");
    return;
  }

  // Companion → CRM: relay a share-link request into the page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[REQUEST_KEY]) return;
    const req = changes[REQUEST_KEY].newValue;
    if (!req || typeof req !== "object") return;
    window.postMessage({ source: MSG_SOURCE, type: "share-link-request", payload: req }, location.origin);
  });

  // CRM → Companion: the resolved share URL comes back as a window message.
  window.addEventListener("message", (e: MessageEvent) => {
    if (!isTrustedMessageEvent(e)) return;
    const d = e.data;
    if (!isKnownEnvelope(d)) return;
    if (d.type !== "share-link-result") return;
    if (!isValidShareLinkResultPayload(d.payload)) return;
    void chrome.storage.local.set({ [RESULT_KEY]: d.payload });
  });

  log("share-link bridge active on", location.host + location.pathname);
}
