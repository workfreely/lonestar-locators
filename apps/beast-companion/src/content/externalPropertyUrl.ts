// Pure external-property-site URL helpers — NO DOM / chrome / window, so they are
// unit-testable in isolation. On the supported external property site, a
// property-detail page is:
//   /Restricted/Locator/ViewProperty.aspx?propertyID=<id>
// The stable `propertyID` query param is the external site's own page identity
// (primary signal — never inferred from visible text). It is used ONLY to detect
// which page the locator is viewing; it is never Locator Beast's property identity,
// dedup key, or storage key. Results/search and every other page yield null
// (→ Current Property clears).

const PROPERTY_PATH = "/restricted/locator/viewproperty.aspx"; // lowercased compare

// Minimal runtime integration config: the literal host of the supported external
// property site, required so the companion knows when to activate. Not a Locator
// Beast identifier and never persisted as one.
const SUPPORTED_PROPERTY_HOST = "smartapartmentdata.com";

export function isSupportedPropertyHost(host: string): boolean {
  return host.toLowerCase().endsWith(SUPPORTED_PROPERTY_HOST);
}

/** External property-page id from a full URL string, or null when it is not a
 *  supported property-detail page (wrong host, wrong path, or no propertyID).
 *  This is the external site's page identity for view-detection only — never
 *  Locator Beast identity/dedup. */
export function parseExternalPropertyId(href: string): string | null {
  try {
    const url = new URL(href);
    if (!isSupportedPropertyHost(url.host)) return null;
    // The external site's own Previous/Next can navigate to a URL with a repeated
    // leading slash (…com//Restricted/Locator/ViewProperty.aspx), so the raw
    // pathname is "//Restricted/…". Collapse any run of slashes to one before the
    // exact match — this accepts the valid ViewProperty path regardless of slash
    // duplication WITHOUT loosening it to any other path. (Confirmed live fix.)
    const path = url.pathname.replace(/\/{2,}/g, "/").toLowerCase();
    if (path !== PROPERTY_PATH) return null;
    const id = url.searchParams.get("propertyID") ?? url.searchParams.get("propertyid");
    const trimmed = (id ?? "").trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

/** Drop a trailing "· <site name>" style page-title suffix that the supported
 *  external property site appends to its titles. The literal suffix is minimal
 *  runtime integration config (the external site's own title format), not
 *  user-facing branding. */
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
