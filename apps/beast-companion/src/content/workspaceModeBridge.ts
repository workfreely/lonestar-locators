import { log, warn } from "@/utils/log";
import { isTrustedMessageEvent } from "@/utils/validate";

/**
 * Workspace-mode bridge — CRM Board|Map ⇄ Companion tab default (both ways).
 *
 * The main CRM view and the Companion's tab track each other so the agent never
 * sees duplicate property info. Map is a property-research context (Current
 * Property, Recommendations, Beast Suggestions all live in the Companion's
 * Properties tab); Board/Workspace already shows Recommended/Favorite Properties
 * itself, so the Companion is most useful on Client there.
 *
 * This is a CONTEXTUAL DEFAULT, not a mode lock. The panel reuses its existing
 * `activeView` tab state — there is no second tab state for Property Explorer —
 * and it only consumes a genuinely NEW transition:
 *
 *   • Board → Map            → panel switches to Properties (once)
 *   • Map   → Board          → panel switches to Client (once)
 *   • agent then picks the other tab → respected; nothing switches it back until
 *     the NEXT main-view change
 *   • rerender / search / pin hover / pin click → no transition, no message
 *
 * The mechanism is deliberately the same as the theme bridge: the page posts a
 * window message, this content script validates it and writes a non-sensitive
 * chrome.storage.local key, and the panel reacts via storage.onChanged. Nothing
 * here carries client data, so it uses plain local storage rather than the
 * sensitive store.
 *
 * Each direction has its OWN monotonically increasing counter, not a mode string.
 * A counter is what makes "the agent switched into Map AGAIN" distinguishable
 * from "the map re-rendered": only a changed number is a transition, and a value
 * the panel has already seen can never re-fire. Two separate counters keep the
 * two directions independent — entering Map never looks like leaving it.
 */

const MODE_TO_KEY: Record<string, string> = {
  map: "lb-map-entered",         // board → map   transition counter → Properties
  workspace: "lb-workspace-entered", // map → board transition counter → Client
};
const MSG_SOURCE = "lb-companion";      // shares the CRM's existing envelope tag
const MSG_TYPE = "workspace-mode";

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

export function startWorkspaceModeBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("workspace-mode bridge: chrome.storage unavailable — sync disabled");
    return;
  }

  window.addEventListener("message", (e: MessageEvent) => {
    // Exact origin + same-window source, before the payload is inspected at all.
    if (!isTrustedMessageEvent(e)) return;
    const d = e.data;
    if (!d || d.source !== MSG_SOURCE || d.type !== MSG_TYPE) return;
    // Schema: the ONLY accepted values are the two known transitions ("map",
    // "workspace"). Anything else is ignored, so a forged message can at worst
    // select one of the two tabs — it can never carry data or lock a mode.
    const key = typeof d.mode === "string" ? MODE_TO_KEY[d.mode] : undefined;
    if (!key) return;

    chrome.storage.local.get(key, (res) => {
      const prev = typeof res[key] === "number" ? (res[key] as number) : 0;
      chrome.storage.local.set({ [key]: prev + 1 });
    });
  });

  log("workspace-mode bridge active on", location.host + location.pathname);
}
