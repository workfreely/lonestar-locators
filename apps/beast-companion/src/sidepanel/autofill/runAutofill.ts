import { autofillTourForm, type AutofillPayload, type AutofillResult } from "@bc/companion-shared";

// Schedule Tour autofill trigger (safest per-site permission model).
//
// The tour/contact page opens in a NEW tab (via Schedule Tour); this fills
// whatever tab is active when the locator clicks Autofill. It MUST be called
// directly from that click handler, because chrome.permissions.request needs the
// user gesture.
//
// Permission model, in order of preference:
//   1. activeTab — declared, and covers a tab the user invoked the action on. It
//      does NOT reliably cover a tab opened AFTER the panel, so we do not rely on
//      it here.
//   2. optional_host_permissions + chrome.permissions.request({ origins: [<this
//      origin>/*] }) — a per-site grant requested ONLY on this click, scoped to
//      the one property/scheduler origin. Never <all_urls>, never always-on.
//
// Declining the permission returns { status: "denied" } and changes nothing — the
// page is already open, so manual scheduling stays fully usable. Cross-origin
// iframes and calendar-first forms with no visible fields yet return with
// filled === 0 ("no-fields"): the caller shows a manual/re-try hint, never an error.

export type AutofillOutcome =
  | { status: "filled"; result: AutofillResult }
  | { status: "no-fields"; result: AutofillResult }
  | { status: "denied" }
  | { status: "no-tab" }
  | { status: "on-crm" }
  | { status: "unsupported" }
  | { status: "error"; message: string };

// The locator's own surfaces (CRM + Smart Apartment Data) — NEVER an autofill
// target; the tour/contact form always lives on an external property/scheduler
// site. Reading the active tab's host requires the "tabs" permission (metadata
// only — no host script access), which is what lets us learn the origin so we can
// request a per-site grant for it.
const CRM_HOSTS = /(^|\.)smartapartmentdata\.com$|(^|\.)locatorbeast\.com$|^localhost$|^127\.0\.0\.1$/i;
function isCrmHost(host: string): boolean {
  return CRM_HOSTS.test(host);
}

function chromeApis(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.tabs?.query === "function" &&
    typeof chrome.scripting?.executeScript === "function" &&
    typeof chrome.permissions?.request === "function"
  );
}

// The current active tab IF it is an external page the Autofill action applies to
// (an http(s) page that is not the CRM/SAD). Null otherwise. The panel uses this to
// SHOW the Autofill action only when the locator is on a tour/scheduler tab —
// matching the expected "open tour page → Companion shows Autofill" behavior.
export async function getActiveTourTab(): Promise<{ host: string; url: string } | null> {
  if (typeof chrome === "undefined" || typeof chrome.tabs?.query !== "function") return null;
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.url) return null;
    const u = new URL(tab.url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isCrmHost(u.host)) return null;
    return { host: u.host, url: tab.url };
  } catch {
    return null;
  }
}

export async function runAutofillOnActiveTab(payload: AutofillPayload): Promise<AutofillOutcome> {
  if (!chromeApis()) return { status: "unsupported" };

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab || tab.id == null || !tab.url) return { status: "no-tab" };

  let origin: string;
  let protocol: string;
  try {
    const u = new URL(tab.url);
    origin = u.origin;
    protocol = u.protocol;
  } catch {
    return { status: "no-tab" };
  }
  // Only real web pages can be scripted (never chrome://, extension pages, etc.).
  if (protocol !== "https:" && protocol !== "http:") return { status: "unsupported" };
  // Never autofill the locator's own CRM/SAD tab — the tour form is external.
  let host: string;
  try { host = new URL(tab.url).host; } catch { return { status: "no-tab" }; }
  if (isCrmHost(host)) return { status: "on-crm" };

  // Per-site grant, requested on THIS gesture only. Scoped to the one origin.
  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [origin + "/*"] });
  } catch {
    granted = false;
  }
  if (!granted) return { status: "denied" };

  try {
    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      // Injected verbatim; autofillTourForm is fully self-contained (see its doc).
      func: autofillTourForm,
      args: [payload],
    });
    const result = injection?.[0]?.result as AutofillResult | undefined;
    if (!result) return { status: "error", message: "no result from page" };
    return result.filled > 0 ? { status: "filled", result } : { status: "no-fields", result };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
