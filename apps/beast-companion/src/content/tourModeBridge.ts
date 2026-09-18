import { log, warn } from "@/utils/log";
import { isTrustedMessageEvent } from "@/utils/validate";

/**
 * Tour-mode bridge — CRM "Schedule Tour from a Workspace Favorite" → Beast
 * Companion enters a contextual, temporary Tour Mode for that one property.
 *
 * The CRM posts a window message the moment it opens the external scheduler; this
 * content script validates it (exact origin, same-window) and writes a small,
 * NON-sensitive record to chrome.storage.local so the panel can react via
 * storage.onChanged (same mechanism as the theme / workspace-mode bridges). It
 * carries only ids + a property name (no regulated screening data), plus a nonce
 * so re-scheduling the SAME favorite twice still re-fires. The property's
 * thumbnail/address/rating are NOT sent here — the panel resolves them from the
 * active-client favorites it already holds.
 *
 * A forged message can at worst ask the panel to show Tour Mode for a favorite id;
 * the panel still validates the leadId against its active client and looks the
 * favorite up in its own data, so nothing sensitive is exposed.
 */

const CANONICAL_KEY = "lb-tour-mode"; // chrome.storage.local — latest tour-mode request
const MSG_SOURCE = "lb-companion";
const MSG_TYPE = "tour-mode";

function isCrmPage(): boolean {
  const h = location.hostname;
  const onAdmin = location.pathname.startsWith("/admin");
  const isLb = h === "locatorbeast.com" || h === "www.locatorbeast.com";
  const isLocal = __LB_DEV__ && (h === "localhost" || h === "127.0.0.1");
  return onAdmin && (isLb || isLocal);
}

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.length > max ? v.slice(0, max) : v;
}

// Only keep a real http(s) scheduler URL — never a chrome:/javascript:/data: value.
function validSchedulerUrl(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

export function startTourModeBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("tour-mode bridge: chrome.storage unavailable — sync disabled");
    return;
  }

  window.addEventListener("message", (e: MessageEvent) => {
    if (!isTrustedMessageEvent(e)) return;
    const d = e.data;
    if (!d || d.source !== MSG_SOURCE || d.type !== MSG_TYPE) return;
    // Schema: leadId + favoriteId (string|number) and a nonce are required; a
    // property name is optional. Anything malformed is ignored.
    const leadId = typeof d.leadId === "number" ? d.leadId : clampStr(d.leadId, 64);
    const favoriteId = typeof d.favoriteId === "number" ? d.favoriteId : clampStr(d.favoriteId, 64);
    const nonce = clampStr(d.nonce, 64);
    if (leadId == null || favoriteId == null || !nonce) return;
    const propertyName = clampStr(d.propertyName, 200);
    // The exact scheduler URL the CRM opened for this tour. Kept ONLY when it is a
    // real http(s) URL so the panel can bind Autofill to that property tab/origin
    // (never the active tab). Anything else → null (bind falls back to legacy).
    const url = validSchedulerUrl(clampStr(d.url, 2048));

    chrome.storage.local.set({ [CANONICAL_KEY]: { leadId, favoriteId, propertyName, url, nonce } });
  });

  log("tour-mode bridge active on", location.host + location.pathname);
}
