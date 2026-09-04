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
