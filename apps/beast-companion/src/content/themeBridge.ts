import { log, warn } from "@/utils/log";
import { isTrustedMessageEvent } from "@/utils/validate";

/**
 * Stage T1 — local, bidirectional CRM ↔ Companion theme sync.
 *
 * The CRM webpage persists its theme in localStorage ("theme-preference"); the
 * Companion side panel and this bridge use chrome.storage.local ("lb-theme") as
 * the shared LOCAL canonical value. This module is the CRM-PAGE end of the bridge
 * — it runs inside the content script (isolated world, same origin as the page)
 * and relays theme changes both directions with a COMPARE-BEFORE-APPLY guard, so
 * a change never echoes back into an update loop.
 *
 * Flow:
 *   CRM picks a theme  → page posts {type:"changed"} → we write chrome.storage
 *                      → onChanged → panel applies.
 *   Companion picks    → chrome.storage changes → onChanged here → we post
 *                      {type:"apply"} → the CRM ThemeProvider applies.
 *
 * Stage T2: only getCanonical/setCanonical below need to change (point them at
 * the authenticated account preference, profiles.theme). The page message
 * protocol and the panel remain identical — nothing else has to be rebuilt.
 */

const CANONICAL_KEY = "lb-theme"; // chrome.storage.local — shared LOCAL canonical
const PAGE_LS_KEY = "theme-preference"; // the CRM's own localStorage cache
const MSG_SOURCE = "lb-theme"; // window.postMessage envelope tag
const THEMES = ["midnight", "obsidian", "rose", "evergreen", "purple"];
const isTheme = (v: unknown): v is string => typeof v === "string" && THEMES.includes(v);

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

// ── Canonical store — the ONLY Stage-T2 swap point ──────────────────────────
function getCanonical(cb: (theme: string | null) => void): void {
  chrome.storage.local.get(CANONICAL_KEY, (res) =>
    cb(isTheme(res[CANONICAL_KEY]) ? (res[CANONICAL_KEY] as string) : null),
  );
}
function setCanonical(theme: string): void {
  // Compare-before-write so we never re-write an unchanged value (loop guard).
  getCanonical((current) => {
    if (current !== theme) chrome.storage.local.set({ [CANONICAL_KEY]: theme });
  });
}

// Tell the CRM page to apply a theme, and keep its localStorage cache fresh so a
// refresh preserves it. Compare-before-apply: skip if the page is already there.
function pushToPage(theme: string): void {
  try {
    if (localStorage.getItem(PAGE_LS_KEY) === theme) return;
    localStorage.setItem(PAGE_LS_KEY, theme);
  } catch {
    /* ignore */
  }
  window.postMessage({ source: MSG_SOURCE, type: "apply", theme }, location.origin);
}

export function startThemeBridge(): void {
  if (!isCrmPage()) return;
  if (!chrome?.storage?.local) {
    warn("theme bridge: chrome.storage unavailable — sync disabled");
    return;
  }

  // 1) On load, reconcile. The shared canonical WINS (the Companion may have
  //    changed it while this tab was closed); if there is no canonical yet, seed
  //    it from the CRM's own stored theme.
  getCanonical((canonical) => {
    let local: string | null = null;
    try {
      local = localStorage.getItem(PAGE_LS_KEY);
    } catch {
      /* ignore */
    }
    if (canonical && canonical !== local) pushToPage(canonical);
    else if (!canonical && isTheme(local)) setCanonical(local);
  });

  // 2) CRM user picked a theme (page → bridge) → write the shared canonical.
  window.addEventListener("message", (e: MessageEvent) => {
    // Exact origin match + same-window source, before any payload inspection.
    // isTheme() below is the schema check: only a known theme id is accepted,
    // so an oversized or unexpected value can never reach storage.
    if (!isTrustedMessageEvent(e)) return;
    const d = e.data;
    if (!d || d.source !== MSG_SOURCE || d.type !== "changed" || !isTheme(d.theme)) return;
    setCanonical(d.theme);
  });

  // 3) Shared canonical changed (Companion, or another CRM tab) → apply to page.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CANONICAL_KEY]) return;
    const next = changes[CANONICAL_KEY].newValue;
    if (isTheme(next)) pushToPage(next);
  });

  log("theme bridge active on", location.host + location.pathname);
}
