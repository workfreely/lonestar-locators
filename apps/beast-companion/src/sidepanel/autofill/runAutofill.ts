import { autofillTourForm, type AutofillPayload, type AutofillResult } from "@bc/companion-shared";

// Schedule Tour autofill (safest per-site permission model), BOUND to the property
// scheduler tab captured at Tour Mode entry — never the currently active tab.
//
// runAutofillForScheduler(schedulerUrl, …) resolves the property tab by its ORIGIN
// (the exact URL the CRM opened for this tour), so switching to an unrelated tab
// (ChatGPT/Gmail/another property) can never redirect Autofill to it or prompt for
// its origin. It MUST be called from the click handler, because
// chrome.permissions.request needs the user gesture.
//
// Permission model: optional_host_permissions + chrome.permissions.request({
// origins: [<scheduler origin>/*] }) — a per-site grant requested ONLY on this
// click, scoped to the one property/scheduler origin (or a known provider wildcard).
// Never <all_urls>, never always-on, never the active tab's origin.
//
// Declining returns { status: "denied" } and changes nothing — the page is already
// open, so manual scheduling stays fully usable. Multi-step (PERQ/calendar-first)
// forms with no visible fields yet return filled === 0 ("no-fields"); the caller
// arms a bounded re-inject (reinjectAutofillIntoTab) against the SAME bound tab so
// the fields fill once they render, without another click or new permission prompt.

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

// Resolve the property/scheduler TAB by the origin captured at Tour Mode entry —
// NOT the active tab. This is the binding that keeps Autofill on the intended
// property even after the locator switches to an unrelated tab (ChatGPT, Gmail,
// another property). Returns the tab id + host, or null when no open tab matches
// that origin (the scheduler tab was closed) — in which case NOTHING is prompted
// or injected anywhere.
// Normalize a host for tolerant matching. Property sites frequently redirect
// www <-> apex (and http -> https) right after we open the stored URL, so an
// EXACT-origin tab match misses the real tab (e.g. stored www.verandasatalamoranch
// .com, tab lands on verandasatalamoranch.com). Stripping a single leading "www."
// binds to the SAME property domain without broadening beyond it.
function normHost(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

async function resolveSchedulerTab(schedulerUrl: string): Promise<{ tabId: number; origin: string; host: string } | null> {
  let target: string;
  try {
    target = normHost(new URL(schedulerUrl).host);
  } catch {
    return null;
  }
  if (!target) return null;
  try {
    // Query ALL tabs and match on the property domain (www/apex tolerant), then
    // bind to the tab's ACTUAL origin — never the active tab. Requires the declared
    // "tabs" permission to read URLs; no host permission needed to enumerate.
    const tabs = await chrome.tabs.query({});
    const matches = tabs.filter((t) => {
      if (t.id == null || !t.url) return false;
      try {
        const u = new URL(t.url);
        return (u.protocol === "https:" || u.protocol === "http:") && normHost(u.host) === target;
      } catch {
        return false;
      }
    });
    if (!matches.length) return null;
    // Prefer https, then the most recently accessed tab on that property domain.
    matches.sort((a, b) => {
      const ah = a.url!.startsWith("https:") ? 0 : 1;
      const bh = b.url!.startsWith("https:") ? 0 : 1;
      if (ah !== bh) return ah - bh;
      return (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0);
    });
    const tab = matches[0];
    const u = new URL(tab.url!);
    return { tabId: tab.id!, origin: u.origin, host: u.host };
  } catch {
    return null;
  }
}

// Inject into an ALREADY-BOUND, already-permitted tab — NO permission request, so it
// is safe to call on a timer without a user gesture. Used by the multi-step arm loop
// to fill contact fields the moment they render. Idempotent downstream (the injected
// filler guards with data-lb-filled and never overwrites a user-edited value).
export async function reinjectAutofillIntoTab(tabId: number, payload: AutofillPayload): Promise<AutofillOutcome> {
  if (!chromeApis()) return { status: "unsupported" };
  // Bound tab gone (closed) → tell the caller to stop the loop cleanly.
  try {
    const t = await chrome.tabs.get(tabId);
    if (!t || t.id == null) return { status: "no-tab" };
  } catch {
    return { status: "no-tab" };
  }
  try {
    const res = await injectAndAggregate(tabId, payload);
    if (!res) return { status: "error", message: "no result from page" };
    return res.filled > 0 ? { status: "filled", result: res } : { status: "no-fields", result: res };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

// One-action Autofill BOUND to the property scheduler context captured at Tour Mode
// entry (schedulerUrl = the exact URL the CRM opened). Resolves the property tab by
// its ORIGIN (never the active tab), requests a per-origin grant for THAT scheduler
// origin only, injects once, and returns the bound tabId so the caller can arm a
// bounded re-inject for multi-step (PERQ/calendar-first) schedulers. Switching to an
// unrelated tab can never redirect this to that tab or prompt for its origin.
export async function runAutofillForScheduler(
  schedulerUrl: string,
  payload: AutofillPayload,
): Promise<{ outcome: AutofillOutcome; tabId?: number; host?: string }> {
  if (!chromeApis()) return { outcome: { status: "unsupported" } };
  // Validate the stored scheduler URL; the scheduler is always an external property
  // site, never the locator's own CRM/SAD.
  try {
    const u = new URL(schedulerUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { outcome: { status: "unsupported" } };
    if (isCrmHost(u.host)) return { outcome: { status: "on-crm" } };
  } catch {
    return { outcome: { status: "no-tab" } };
  }

  // Resolve the OPEN property tab (tolerant of www<->apex / http->https redirects)
  // and bind to its ACTUAL origin — never the active tab, never a broadened host.
  const resolved = await resolveSchedulerTab(schedulerUrl);
  if (!resolved) return { outcome: { status: "no-tab" } };
  const { tabId, origin, host } = resolved;
  if (isCrmHost(host)) return { outcome: { status: "on-crm" } };

  // Per-origin grant for the scheduler origin ONLY (a provider wildcard when the
  // scheduler runs on a known shared provider). Never <all_urls>, never the active tab.
  const primaryPattern = providerPatternForHost(host) ?? origin + "/*";
  if (!(await requestOriginPattern(primaryPattern))) return { outcome: { status: "denied" }, tabId, host };

  try {
    const first = await injectAndAggregate(tabId, payload);
    if (!first) return { outcome: { status: "error", message: "no result from page" }, tabId, host };
    if (first.filled > 0) return { outcome: { status: "filled", result: first }, tabId, host };

    // A KNOWN provider embedded as a cross-origin iframe on the scheduler page →
    // offer that provider's per-origin grant (still on THIS gesture) + re-inject.
    const providerFrame = (first.crossOriginFrameHosts ?? [])
      .map((h) => providerPatternForHost(h))
      .find((p): p is string => !!p && p !== primaryPattern);
    if (providerFrame && (await requestOriginPattern(providerFrame))) {
      const second = await injectAndAggregate(tabId, payload);
      if (second)
        return {
          outcome: second.filled > 0 ? { status: "filled", result: second } : { status: "no-fields", result: second },
          tabId,
          host,
        };
    }
    return { outcome: { status: "no-fields", result: first }, tabId, host };
  } catch (e) {
    return { outcome: { status: "error", message: e instanceof Error ? e.message : String(e) }, tabId, host };
  }
}
