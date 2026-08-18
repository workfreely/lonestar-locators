// Pure Smart Apartment Data URL helpers — NO DOM / chrome / window, so they are
// unit-testable in isolation. A SAD property-detail page is:
//   /Restricted/Locator/ViewProperty.aspx?propertyID=<id>
// and the stable `propertyID` query param is the canonical property identity
// (primary signal — never inferred from visible text). Results/search and every
// other page yield null (→ Current Property clears).

const PROPERTY_PATH = "/restricted/locator/viewproperty.aspx"; // lowercased compare

export function isSmartApartmentDataHost(host: string): boolean {
  return host.toLowerCase().endsWith("smartapartmentdata.com");
}

/** SAD property identity from a full URL string, or null when it is not a SAD
 *  property-detail page (wrong host, wrong path, or no propertyID). */
export function parseSadPropertyId(href: string): string | null {
  try {
    const url = new URL(href);
    if (!isSmartApartmentDataHost(url.host)) return null;
    // SAD's own Previous/Next can navigate to a URL with a repeated leading slash
    // (…com//Restricted/Locator/ViewProperty.aspx), so the raw pathname is
    // "//Restricted/…". Collapse any run of slashes to one before the exact match —
    // this accepts the valid ViewProperty path regardless of slash duplication WITHOUT
    // loosening it to any other path. (Confirmed live fix.)
    const path = url.pathname.replace(/\/{2,}/g, "/").toLowerCase();
    if (path !== PROPERTY_PATH) return null;
    const id = url.searchParams.get("propertyID") ?? url.searchParams.get("propertyid");
    const trimmed = (id ?? "").trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

/** Drop a trailing "· Smart Apartment Data" style site suffix from a page title. */
export function stripSiteSuffix(s: string): string {
  const out = s.replace(/\s*[|\-–—:]\s*Smart\s*Apartment\s*Data.*$/i, "").trim();
  return out || s;
}

/**
 * Heuristic guard for "this text is a street address" — a number PLUS a 5-digit
 * ZIP or a ", ST" state abbreviation. Used only to sanity-check a DOM candidate
 * before showing it (so a heading/blurb near the name is never mistaken for the
 * address). It never fabricates — it only filters what the page already renders.
 */
export function looksLikeAddress(s: string): boolean {
  const t = (s ?? "").trim();
  if (!/\d/.test(t)) return false;
  if (/\b\d{5}(-\d{4})?\b/.test(t)) return true; // 5-digit ZIP
  if (/,\s*[A-Z]{2}\b/.test(t)) return true; // ", ST" state abbreviation
  // Leading street number + a common street-type word ("500 Comal St, Austin").
  return /^\s*\d+\s+.*\b(st|street|rd|road|ave|avenue|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|ct|court|pkwy|parkway|cir|circle|ter|terrace|pl|place)\b/i.test(t);
}
