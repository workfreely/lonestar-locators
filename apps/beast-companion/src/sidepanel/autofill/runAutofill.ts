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
  | { status: "unsupported" }
  | { status: "error"; message: string };

function chromeApis(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.tabs?.query === "function" &&
    typeof chrome.scripting?.executeScript === "function" &&
    typeof chrome.permissions?.request === "function"
  );
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
