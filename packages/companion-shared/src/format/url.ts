/**
 * The ONLY URL a property card link (name / thumbnail / Visit Website) may open:
 * the property's real external website. Returns the URL when it is a plausible
 * property site, or null to leave the element non-clickable. NEVER returns a Google
 * Maps place/search/directions URL or the `?q=place_id:` map link — a card click
 * must go to the actual property site (property_catalog.website_url) or nowhere.
 *
 * Mirror of lib/propertyExplorer/propertyWebsiteHref on the CRM side; kept in the
 * shared package so the Companion applies the exact same guard.
 */
/**
 * Canonical property identity for a property URL — a stable dedupe key shared by the
 * CRM and the Companion so a the external site ViewProperty link and a `?q=place_id:` map link for
 * the SAME property compare equal, and two different properties never collide.
 *
 * MIRRORS EXACTLY the `canonical_property_key` generated column on both
 * `lead_recommendations` and `lead_favorites`:
 *   coalesce('pid:' || <place_id captured from the URL>, 'url:' || lower(btrim(url)))
 * The place_id branch is case-sensitive (place ids are); the url fallback is trimmed +
 * lowercased. Returns null only when the URL is empty (matches the null key case).
 *
 * Use this for UI "already recommended/favorited" button state instead of raw
 * property_url string equality. It does NOT redesign identity — it reuses the same
 * expression the database already stores.
 */
export function canonicalPropertyKey(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  const m = /[?&]q=place_id:([^&]+)/.exec(raw);
  if (m && m[1]) return `pid:${m[1]}`;
  return `url:${raw.toLowerCase()}`;
}

export function propertyWebsiteHref(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!/^https?:\/\//i.test(u)) return null;
  if (
    /google\.[a-z.]+\/(?:maps|search|url)\b/i.test(u) ||
    /\/maps\//i.test(u) ||
    /maps\.google\./i.test(u) ||
    /maps\.app\.goo\.gl/i.test(u) ||
    /goo\.gl\/maps/i.test(u) ||
    /\bg\.page\b/i.test(u) ||
    /[?&]q=place_id:/i.test(u) ||
    /[?&#]daddr=|\/dir\//i.test(u)
  ) {
    return null;
  }
  return u;
}
