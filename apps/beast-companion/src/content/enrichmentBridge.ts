import { log, warn } from "@/utils/log";
import { isTrustedMessageEvent, isKnownEnvelope, isValidEnrichResultPayload } from "@/utils/validate";

/**
 * the external site property enrichment bridge — the CRM-PAGE end of a request/response round trip
 * that gives a the external property site Current Property the SAME catalog enrichment a
 * Map property gets, without any server-side Google key.
 *
 *   • REQUEST  (Companion → CRM): the side panel writes {nonce, name, address, externalPropertyId}
 *     to chrome.storage.local["lb-enrich-request"]; this content script relays it
 *     into the page so DashboardClient can resolve the place_id with the ALREADY
 *     loaded browser Google Places library and look up property_catalog.
 *   • RESULT   (CRM → Companion): DashboardClient posts back the catalog-only answer
 *     {nonce, placeId, googleRating, propertyImageUrl, websiteUrl}; this script writes
 *     it to chrome.storage.local["lb-enrich-result"] for the panel to merge.
 *
 * The payload carries NO client PII — only a property's own name/address and the
 * public catalog fields — so it uses plain local storage (like the workflow-verb
 * bridge), not the sensitive store. SECURITY: the result is accepted only after the
 * exact-origin + same-window trust check and the shared envelope/schema validation,
 * so a forged page script cannot inject a rating.
 */

const REQUEST_KEY = "lb-enrich-request";
const RESULT_KEY = "lb-enrich-result";
const MSG_SOURCE = "lb-companion";

function isCrmPage(): boolean {
  const h = location.hostname;
  const onAdmin = location.pathname.startsWith("/admin");
  const isLb = h === "locatorbeast.com" || h === "www.locatorbeast.com";
  // Local development only. __LB_DEV__ is inlined as `false` by production builds.
  const isLocal = __LB_DEV__ && (h === "localhost" || h === "127.0.0.1");
  return onAdmin && (isLb || isLocal);
}

export function startEnrichmentBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("enrichment bridge: chrome.storage unavailable — enrichment disabled");
    return;
  }

  // Companion → CRM: relay an enrichment request into the page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[REQUEST_KEY]) return;
    const req = changes[REQUEST_KEY].newValue;
    if (!req || typeof req !== "object") return;
    window.postMessage({ source: MSG_SOURCE, type: "enrich-property-request", payload: req }, location.origin);
  });

  // CRM → Companion: the resolved catalog enrichment comes back as a window message.
  window.addEventListener("message", (e: MessageEvent) => {
    if (!isTrustedMessageEvent(e)) return;
    const d = e.data;
    if (!isKnownEnvelope(d)) return;
    if (d.type !== "enrich-property-result") return;
    if (!isValidEnrichResultPayload(d.payload)) return;
    void chrome.storage.local.set({ [RESULT_KEY]: d.payload });
  });

  log("enrichment bridge active on", location.host + location.pathname);
}
