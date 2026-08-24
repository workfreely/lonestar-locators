import type { CurrentProperty } from "@/types";
import { log, warn } from "@/utils/log";
import {
  CURRENT_PROPERTY_KEY,
  gateAllowsWrite,
  getSessionOwner,
  writeSensitive,
} from "@/utils/sensitiveStore";
import {
  isKnownEnvelope,
  isTrustedMessageEvent,
  isValidCurrentPropertyPayload,
} from "@/utils/validate";

/**
 * Property Explorer → Current Property bridge. The CRM-PAGE end.
 *
 * Clicking a marker in Beast Property Explorer posts
 * `{ source:"lb-companion", type:"current-property", payload }` on the CRM page.
 * This content script (isolated world, same origin) relays it into
 * chrome.storage.local["lb-current-property"] — the SAME key the Smart Apartment
 * Data detector writes, read by the SAME panel consumer.
 *
 * WHY THE SAME KEY, AND WHY A SEPARATE FILE
 * Same key because "Current Property" is one idea: the property the agent is
 * looking at right now. Giving the map its own key would have produced two
 * Current Properties and forced the Properties tab, Location Fit and the
 * Recommendation verb to each decide which one wins.
 *
 * Separate file because the two SOURCES are genuinely different.
 * currentPropertyBridge is a passive DOM/URL detector that deliberately refuses
 * to write from a non-SAD tab — it would otherwise write null on every CRM page
 * and clobber a property detected in another tab. That guard is correct and is
 * left exactly as it is. This bridge is not detection: it fires only on an
 * explicit marker click, writes only a property, and never writes null. Folding
 * it into the detector would have meant weakening the detector's guard.
 *
 * CONSEQUENCE WORTH KNOWING: because both write one key, selecting a property on
 * the map replaces a SAD-detected one, and vice versa. That is what "one Current
 * Property" means; it is not a race between two systems.
 *
 * The owner is taken from the SESSION, never from the message. A page-supplied
 * owner would let anything running in the page attribute a record to someone
 * else; getSessionOwner() is the same source the SAD detector uses.
 *
 * Nothing here reaches Supabase, and nothing here calls Google. The payload is
 * data the map already loaded, so a selection costs no request and writes no row.
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

export function startMapPropertyBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("map-property bridge: chrome.storage unavailable — sync disabled");
    return;
  }

  // Last value THIS bridge wrote, compared synchronously — same reasoning as the
  // active-client bridge: an async read-before-write races with rapid selections
  // and can drop the newest one.
  let lastWritten: string | null = null;

  window.addEventListener("message", (e: MessageEvent) => {
    // 1. TRUST — exact origin match plus same-window source, before any payload
    //    is inspected. Identical to every other inbound bridge.
    if (!isTrustedMessageEvent(e)) return;

    // 2. ENVELOPE — known source, known type. Unknown types are dropped.
    const d = e.data;
    if (!isKnownEnvelope(d)) return;
    if (d.type !== "current-property") return;

    // 3. SCHEMA — identifiable, bounded, and coordinates that are real or absent.
    const payload = d.payload;
    if (!isValidCurrentPropertyPayload(payload)) return;

    const serialized = JSON.stringify(payload);
    if (serialized === lastWritten) return; // same property re-clicked — skip

    // 4. CONSENT — the gate is on the BRIDGE, so before acceptance nothing is
    //    written at all and there is no stored-but-hidden property data.
    void (async () => {
      if (!(await gateAllowsWrite())) return;
      const owner = await getSessionOwner();
      if (!owner) return;
      const cp = payload as unknown as CurrentProperty;
      const ok = await writeSensitive(CURRENT_PROPERTY_KEY, owner, cp);
      if (!ok) return;
      lastWritten = serialized;
      log("map-property bridge: current-property ←", cp.propertyName);
    })();
  });

  log("map-property bridge active on", location.host + location.pathname);
}
