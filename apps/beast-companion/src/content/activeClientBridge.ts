import { log, warn } from "@/utils/log";

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

const STORAGE_KEY = "lb-active-client"; // chrome.storage.local — panel canonical
const MSG_SOURCE = "lb-companion"; // window.postMessage envelope tag

function isCrmPage(): boolean {
  const h = location.hostname;
  const onAdmin = location.pathname.startsWith("/admin");
  const isLb = h === "locatorbeast.com" || h === "www.locatorbeast.com";
  const isLocal = h === "localhost" || h === "127.0.0.1"; // dev only (see build.mjs)
  return onAdmin && (isLb || isLocal);
}

export function startActiveClientBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("active-client bridge: chrome.storage unavailable — sync disabled");
    return;
  }

  // Last value THIS bridge wrote — a synchronous compare source. Using an async
  // chrome.storage.local.get to read `prev` created a race: during the rapid
  // re-render bursts around Call/Text (each setLocalLeads/NextActions re-fires the
  // CRM broadcast), an in-flight get could read a STALE `prev` and drop the new
  // selection's write, leaving Companion on the previously-shown lead. Comparing
  // synchronously against what we last wrote removes that race entirely while
  // still skipping genuinely-unchanged payloads (no onChanged churn).
  let lastWritten: string | null = null;

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== MSG_SOURCE || d.type !== "active-client") return;
    const payload = d.payload;
    if (!payload || !payload.lead || payload.lead.id === undefined || payload.lead.id === null) return;

    const serialized = JSON.stringify(payload);
    if (serialized === lastWritten) return; // genuinely unchanged — skip
    lastWritten = serialized;
    chrome.storage.local.set({ [STORAGE_KEY]: payload });

    // This tab just supplied the Companion active client — tell the background to
    // remember it (via sender.tab) as the "← Back to CRM" target. Best-effort; the
    // panel falls back to a URL-pattern query if this never lands. Deduped by the
    // lastWritten guard above, so no churn during rapid re-render bursts.
    chrome.runtime?.sendMessage?.({ type: "REPORT_CRM_TAB" }).catch(() => {
      /* background asleep / no receiver — non-fatal, query fallback remains */
    });
  });

  log("active-client bridge active on", location.host + location.pathname);
}
