import { log, warn } from "@/utils/log";
import { isTrustedMessageEvent } from "@/utils/validate";

/**
 * Workspace-mode bridge — CRM Board|Map → Companion tab default.
 *
 * Map mode is a property-research context: Current Property, Recommendations and
 * (later) Beast Suggestions all live in the Companion's Properties tab. So when
 * the agent switches the CRM from Board to Map, an OPEN Companion should already
 * be showing Properties rather than making them click twice.
 *
 * This is a CONTEXTUAL DEFAULT, not a mode lock. The panel reuses its existing
 * `activeView` tab state — there is no second tab state for Property Explorer —
 * and it only consumes a genuinely NEW transition:
 *
 *   • Board → Map            → panel switches to Properties (once)
 *   • agent then picks Client → respected; nothing switches them back
 *   • Map  → Board           → nothing is posted, so Client is never forced
 *   • rerender / search / pin hover / pin click → no transition, no message
 *
 * The mechanism is deliberately the same as the theme bridge: the page posts a
 * window message, this content script validates it and writes a non-sensitive
 * chrome.storage.local key, and the panel reacts via storage.onChanged. Nothing
 * here carries client data, so it uses plain local storage rather than the
 * sensitive store.
 *
 * The stored value is a monotonically increasing counter, not a mode string.
 * A counter is what makes "the agent switched into Map AGAIN" distinguishable
 * from "the map re-rendered": only a changed number is a transition, and a value
 * the panel has already seen can never re-fire.
 */

const CANONICAL_KEY = "lb-map-entered"; // chrome.storage.local — transition counter
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
    // Schema: the ONLY accepted value is the literal "map". Board→Client is not a
    // thing this bridge can express, so a forged message cannot pull the agent
    // off the tab they chose — the worst it can do is select Properties.
    if (d.mode !== "map") return;

    chrome.storage.local.get(CANONICAL_KEY, (res) => {
      const prev = typeof res[CANONICAL_KEY] === "number" ? (res[CANONICAL_KEY] as number) : 0;
      chrome.storage.local.set({ [CANONICAL_KEY]: prev + 1 });
    });
  });

  log("workspace-mode bridge active on", location.host + location.pathname);
}
