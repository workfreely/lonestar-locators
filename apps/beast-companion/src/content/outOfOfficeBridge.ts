import { log, warn } from "@/utils/log";
import { isTrustedMessageEvent, isKnownEnvelope, isValidOooResultPayload } from "@/utils/validate";

/**
 * Out-of-Office bridge — the CRM-PAGE end of a request/response round trip, built
 * on exactly the same mechanism as the enrichment and share-link bridges.
 *
 *   • REQUEST (Companion → CRM): the side panel writes {nonce, op, enabled?, until?}
 *     to chrome.storage.local["lb-ooo-request"]; this content script relays it into
 *     the page so DashboardClient — which carries the agent's locatorbeast.com
 *     session cookie — can call the authenticated workspace route.
 *   • RESULT  (CRM → Companion): DashboardClient posts back the STORED state
 *     {nonce, enabled, until, slug, previewUrl, error}; this script writes it to
 *     chrome.storage.local["lb-ooo-result"] for the panel to render.
 *
 * WHY A ROUND TRIP AND NOT A DIRECT CALL: the panel runs on a different origin and
 * holds no locatorbeast.com session, and the extension requests no host permission
 * for it — so it genuinely cannot reach the API. Routing through the CRM page keeps
 * that true: the extension gains no new network reach, and the write is performed
 * by first-party code doing only what the signed-in agent could already do.
 *
 * WHY THE PANEL IS NEVER THE AUTHORITY: the result is the state as re-read from the
 * database, not the value the panel asked for. A failed or partial write therefore
 * shows the truth instead of the optimistic guess — important for a control whose
 * whole purpose is to answer "am I currently away?".
 *
 * The payload carries no client PII (a workspace's own away state and public slug),
 * so this uses plain local storage like the other two, not the sensitive store.
 */

const REQUEST_KEY = "lb-ooo-request";
const RESULT_KEY = "lb-ooo-result";
const MSG_SOURCE = "lb-companion";

function isCrmPage(): boolean {
  const h = location.hostname;
  const onAdmin = location.pathname.startsWith("/admin");
  const isLb = h === "locatorbeast.com" || h === "www.locatorbeast.com";
  // Local development only. __LB_DEV__ is inlined as `false` by production builds.
  const isLocal = __LB_DEV__ && (h === "localhost" || h === "127.0.0.1");
  return onAdmin && (isLb || isLocal);
}

export function startOutOfOfficeBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("out-of-office bridge: chrome.storage unavailable — control disabled");
    return;
  }

  // Companion → CRM: relay a read or write request into the page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[REQUEST_KEY]) return;
    const req = changes[REQUEST_KEY].newValue;
    if (!req || typeof req !== "object") return;
    window.postMessage({ source: MSG_SOURCE, type: "out-of-office-request", payload: req }, location.origin);
  });

  // CRM → Companion: the stored state comes back as a window message.
  window.addEventListener("message", (e: MessageEvent) => {
    if (!isTrustedMessageEvent(e)) return;
    const d = e.data;
    if (!isKnownEnvelope(d)) return;
    if (d.type !== "out-of-office-result") return;
    if (!isValidOooResultPayload(d.payload)) return;
    void chrome.storage.local.set({ [RESULT_KEY]: d.payload });
  });

  log("out-of-office bridge active on", location.host + location.pathname);
}
