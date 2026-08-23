import { log } from "@/utils/log";

/**
 * Card-open bridge (Phase 3) — the CRM-PAGE end of "click a lead → open Companion".
 *
 * Opening the native side panel requires chrome.sidePanel.open(), and Chrome only
 * allows it SYNCHRONOUSLY inside a user gesture. The panel document can't call it
 * for the CRM's window, and a passive active-client broadcast carries no gesture —
 * so the OPEN must originate from the real click on the CRM page. This content
 * script (isolated world, same document) hears that click and, still inside the
 * gesture, asks the background to open the panel (background/index.ts → OPEN_PANEL
 * → chrome.sidePanel.open({windowId})). Same path the launcher already uses.
 *
 * SCOPED TO A GENUINE SELECT. A lead card is <article class="kb-card" onClick=
 * select>; its inner controls (drag handle, phone link, archive, copy) all call
 * stopPropagation, and a dnd-kit drag suppresses the trailing click. Listening in
 * the BUBBLE phase on document therefore fires on EXACTLY the clicks that select a
 * lead — not drags, not the inner buttons — so this opens Companion precisely when
 * the CRM itself switches the active lead, and never on passive workflow updates.
 *
 * OPEN-ONLY: never closes/toggles. If the panel is already open, opening again is a
 * harmless no-op (the background swallows the error) and the active-client bridge
 * switches the shown lead. Opening (this gesture) and syncing (activeClientBridge)
 * stay separate responsibilities.
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

export function startCardOpenBridge(): void {
  if (!isCrmPage()) return;

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target || typeof target.closest !== "function") return;
    if (!target.closest(".kb-card")) return; // only a lead-card select

    // Sent SYNCHRONOUSLY inside the click gesture so Chrome permits the panel to
    // open in the background's OPEN_PANEL handler. Fire-and-forget; if the panel is
    // already open the background no-ops the resulting error.
    chrome.runtime.sendMessage({ type: "OPEN_PANEL" }).catch(() => {});
  });

  log("card-open bridge active on", location.host + location.pathname);
}
