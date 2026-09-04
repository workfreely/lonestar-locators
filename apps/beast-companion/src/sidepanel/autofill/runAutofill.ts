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

// Known scheduler providers whose tour form runs on a SHARED origin across many
// properties. Requesting the provider's wildcard ONCE covers every property using
// it (SecureCafe/Yardi, Tour24 — per the live audit) instead of a per-property
// prompt. Everything else stays per-origin. Never <all_urls>, never always-on.
const PROVIDER_PATTERNS: { test: (host: string) => boolean; pattern: string }[] = [
  { test: (h) => h === "securecafe.com" || h.endsWith(".securecafe.com"), pattern: "https://*.securecafe.com/*" },
  { test: (h) => h === "securecafenet.com" || h.endsWith(".securecafenet.com"), pattern: "https://*.securecafenet.com/*" },
  { test: (h) => h === "app.tour24.io", pattern: "https://app.tour24.io/*" },
];
function providerPatternForHost(host: string): string | null {
  const h = host.toLowerCase();
  for (const p of PROVIDER_PATTERNS) if (p.test(h)) return p.pattern;
  return null;
}

async function requestOriginPattern(pattern: string): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: [pattern] });
  } catch {
    return false;
  }
}

// Inject the filler into the top frame AND every cross-origin frame the extension
// has host access to (allFrames only reaches PERMITTED frames — a provider grant
// unlocks that provider's embedded iframe, nothing broader). Aggregate the per-
// frame results into one.
async function injectAndAggregate(tabId: number, payload: AutofillPayload): Promise<AutofillResult | null> {
  let injections: chrome.scripting.InjectionResult<AutofillResult>[] | undefined;
  try {
    injections = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: autofillTourForm,
      args: [payload],
    });
  } catch {
    try {
      injections = await chrome.scripting.executeScript({ target: { tabId }, func: autofillTourForm, args: [payload] });
    } catch {
      return null;
    }
  }
  const results = (injections ?? [])
    .map((i) => i.result as AutofillResult | undefined)
    .filter((r): r is AutofillResult => !!r);
  if (!results.length) return null;
  const uniq = (arr: string[]) => Array.from(new Set(arr));
  const primary = results.slice().sort((a, b) => (b.filled || 0) - (a.filled || 0))[0];
  return {
    ...primary,
    filled: results.reduce((s, r) => s + (r.filled || 0), 0),
    attempted: results.reduce((s, r) => s + (r.attempted || 0), 0),
    frames: {
      total: results.reduce((s, r) => s + (r.frames?.total || 0), 0),
      crossOriginBlocked: results.reduce((s, r) => s + (r.frames?.crossOriginBlocked || 0), 0),
    },
    tourTriggers: uniq(results.flatMap((r) => r.tourTriggers ?? [])).slice(0, 6),
    crossOriginFrameHosts: uniq(results.flatMap((r) => r.crossOriginFrameHosts ?? [])),
  };
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

  // Scope the grant: a known provider's shared wildcard (covers ALL its properties)
  // when the tour form's origin is that provider, else the exact property origin.
  // Requested on THIS gesture only; a granted provider wildcard persists, so the
  // next property on the same provider never re-prompts.
  const primaryPattern = providerPatternForHost(host) ?? origin + "/*";
  if (!(await requestOriginPattern(primaryPattern))) return { status: "denied" };

  try {
    const first = await injectAndAggregate(tab.id, payload);
    if (!first) return { status: "error", message: "no result from page" };
    if (first.filled > 0) return { status: "filled", result: first };

    // Nothing filled in the top frame(s). If a KNOWN provider is embedded as a
    // cross-origin iframe (e.g. a SecureCafe scheduler on the property site), offer
    // the provider grant and re-inject — allFrames then reaches that frame under the
    // SAME optional permission model (never broad access). Unknown cross-origin
    // iframes are left alone (manual fallback).
    const providerFrame = (first.crossOriginFrameHosts ?? [])
      .map((h) => providerPatternForHost(h))
      .find((p): p is string => !!p && p !== primaryPattern);
    if (providerFrame && (await requestOriginPattern(providerFrame))) {
      const second = await injectAndAggregate(tab.id, payload);
      if (second) return second.filled > 0 ? { status: "filled", result: second } : { status: "no-fields", result: second };
    }
    return { status: "no-fields", result: first };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
