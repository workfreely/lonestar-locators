import type { CurrentProperty } from "@/types";
import { log } from "@/utils/log";
import { isSmartApartmentDataHost, parseSadPropertyId, stripSiteSuffix, looksLikeAddress } from "./sadUrl";

/**
 * Current Property bridge (Smart Apartment Data → panel).
 *
 * Detection is PRIMARILY URL-based and therefore stable: a SAD property-detail
 * page is `/Restricted/Locator/ViewProperty.aspx?propertyID=<id>` (verified prior
 * structure). The `propertyID` query param is the canonical property identity; we
 * never rely on visible text to decide WHICH property is open. Name/address are
 * read read-only from the detail DOM via a resilient cascade (never fabricated).
 *
 * It writes chrome.storage.local["lb-current-property"] — a SEPARATE key from
 * "lb-active-client", so Current Property follows the webpage being viewed, not
 * the active CRM client. On any non-property page (results/search/other) it writes
 * null so the panel clears back to the placeholder. Nothing is persisted to
 * Supabase. Mirrors the activeClientBridge write pattern (compare-before-write).
 */

const STORAGE_KEY = "lb-current-property";

/** SAD property identity from the CURRENT URL (primary signal), or null when not
 *  on a property-detail page. Independent of any visible text. */
function detectPropertyIdFromUrl(): string | null {
  return parseSadPropertyId(location.href);
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

const NAME_HEADING_SELECTORS = ".vp-modern h1, .factsBar h1, h1, .vp-modern h2, h2";
// Confirmed stable SAD detail-page element IDs (from real inspected HTML on
// ViewProperty.aspx). These are the PRIMARY sources; the generic cascades below
// remain as resilience fallbacks.
const NAME_SELECTOR = "#ctl00_ContentPlaceHolder_PropertyHeader1_propertyNameLink";
const ADDRESS_SELECTOR = "#ctl00_ContentPlaceHolder_PropertyHeader1_address";

/**
 * Property NAME — confirmed SAD header link first, then a resilient cascade
 * (og:title → prominent headings → cleaned document.title). Returns "" when
 * nothing is available yet (caller retries for late DOM).
 */
function readPropertyName(): string {
  const primary = clean(document.querySelector<HTMLElement>(NAME_SELECTOR)?.textContent);
  if (primary) return primary;
  const og = clean(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content);
  if (og) return stripSiteSuffix(og);
  for (const sel of [".vp-modern h1", ".factsBar h1", "h1", ".vp-modern h2"]) {
    const t = clean(document.querySelector<HTMLElement>(sel)?.textContent);
    if (t) return t;
  }
  return stripSiteSuffix(clean(document.title));
}

/**
 * Property ADDRESS — uses the stable DOM RELATIONSHIP the address is known to have
 * (rendered directly beneath the property-name heading on the SAD detail page),
 * plus standard structured sources. Never fabricated: a candidate is only accepted
 * if it looks like a real street address (looksLikeAddress). Whitespace-normalized
 * only — no parsing/splitting/geocoding. Null (omitted) when nothing qualifies.
 */
function readPropertyAddress(name: string): string | null {
  // 0) Confirmed SAD header address element (authoritative — trusted as-is,
  //    whitespace-normalized only; no looksLikeAddress gate needed here).
  const primary = clean(document.querySelector<HTMLElement>(ADDRESS_SELECTOR)?.textContent);
  if (primary) return primary;

  // 1) Standard structured sources (stable when present).
  const metaAddr = clean(document.querySelector<HTMLMetaElement>('meta[property="og:street-address"]')?.content);
  if (metaAddr && looksLikeAddress(metaAddr)) return metaAddr;
  const itemprop = clean(document.querySelector<HTMLElement>('[itemprop="address"]')?.textContent);
  if (itemprop && looksLikeAddress(itemprop)) return itemprop;

  // 2) Structural: the address is rendered directly beneath the property-name
  //    heading. Find the heading whose text IS the detected name, then scan the
  //    next few sibling elements for the first address-shaped line.
  const headings = Array.from(document.querySelectorAll<HTMLElement>(NAME_HEADING_SELECTORS));
  const nameEl = headings.find((h) => clean(h.textContent) === name) ?? null;
  if (nameEl) {
    let node: Element | null = nameEl.nextElementSibling;
    for (let i = 0; node && i < 4; i++, node = node.nextElementSibling) {
      const t = clean((node as HTMLElement).textContent);
      if (t && looksLikeAddress(t)) return t;
    }
    // Also check address-shaped lines within the heading's parent block.
    const parentText = nameEl.parentElement
      ? Array.from(nameEl.parentElement.children)
          .map((c) => clean((c as HTMLElement).textContent))
          .find((t) => looksLikeAddress(t))
      : undefined;
    if (parentText) return parentText;
  }
  return null;
}

/**
 * Property IMAGE — the primary/hero photo, from og:image only. That is the most
 * stable, property-SPECIFIC source (the page's own share image) and avoids
 * capturing logos / maps / avatars / icons from arbitrary <img> tags. Null when
 * absent → the panel shows the building placeholder.
 */
function readPropertyImageUrl(): string | null {
  const og = clean(document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content);
  return og || null;
}

function readCurrentProperty(): CurrentProperty | null {
  const propertyId = detectPropertyIdFromUrl();
  if (!propertyId) return null; // not a property-detail page
  const propertyName = readPropertyName();
  if (!propertyName) return null; // primary identity requires the name (retry for late DOM)
  // Address + image are SUPPLEMENTAL — never block detection when unavailable.
  return {
    propertyId,
    propertyName,
    propertyAddress: readPropertyAddress(propertyName),
    propertyUrl: location.href,
    propertyImageUrl: readPropertyImageUrl(),
  };
}

// Compare-before-write dedupe (same approach as activeClientBridge): only touch
// storage when the detected property (or the cleared state) actually changed.
let lastWritten: string | null = null;

function writeCurrentProperty(cp: CurrentProperty | null): void {
  const store = (globalThis as unknown as { chrome?: any }).chrome?.storage?.local;
  if (!store) return;
  const serialized = cp ? JSON.stringify(cp) : "null";
  if (serialized === lastWritten) return;
  lastWritten = serialized;
  store.set({ [STORAGE_KEY]: cp ?? null });
  log("current-property →", cp ? `${cp.propertyName} (#${cp.propertyId})` : "cleared");
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Detect the current property and write it to storage. Called on init and on every
 * navigation (reusing the existing content-script URL watcher — no extra polling).
 * On a detail page whose name isn't rendered yet (AJAX / late hydration) it retries
 * a few times briefly, then stops.
 */
export function syncCurrentProperty(): void {
  // ONLY Smart Apartment Data tabs own this key. The content script also runs on
  // the CRM tab (locatorbeast.com/admin); it must NOT write/clear here, or it would
  // clobber the property a separate SAD tab detected. Non-SAD tabs are a no-op.
  if (!isSmartApartmentDataHost(location.host)) return;

  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const onDetailPage = detectPropertyIdFromUrl() !== null;
  const cp = readCurrentProperty();
  writeCurrentProperty(cp);

  if (onDetailPage && !cp) {
    let tries = 0;
    const attempt = () => {
      tries += 1;
      // Bail if we navigated away from the detail page while retrying.
      if (detectPropertyIdFromUrl() === null) return;
      const again = readCurrentProperty();
      if (again) {
        writeCurrentProperty(again);
        return;
      }
      if (tries < 6) retryTimer = setTimeout(attempt, 300);
    };
    retryTimer = setTimeout(attempt, 300);
  }
}

/** Start on SAD/any page: detect now + re-detect once the page finishes loading
 *  (the DOM isn't ready at document_start). Navigation updates are driven by the
 *  content-script URL watcher, which also calls syncCurrentProperty(). */
export function startCurrentPropertyBridge(): void {
  syncCurrentProperty();
  window.addEventListener("load", syncCurrentProperty);
}
