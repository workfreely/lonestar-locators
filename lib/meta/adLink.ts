// Ad-destination URL builder — the link a locator pastes as their Instagram/Facebook AD's website
// URL so Smart Lead Form submissions carry stable campaign/ad IDs + paid attribution. Uses Meta's
// CURRENT dynamic-URL placeholders ({{campaign.id}} etc.), which Meta substitutes at delivery; fbclid
// is auto-appended by Meta. Pure/deterministic (unit-testable). NOTE: verify placeholder syntax
// against current Meta docs before finalizing the locator-facing instructions.

const SITE_ORIGIN = "https://locatorbeast.com"

export type AdPlatform = "instagram" | "facebook"

/** The Smart Lead Form ad-destination URL with UTM + Meta dynamic placeholders. `platform` sets a
 *  deterministic utm_source; utm_medium is always paid_social for ad traffic. */
export function buildAdDestinationUrl(username: string, platform: AdPlatform = "instagram"): string {
  const base = `${SITE_ORIGIN}/${encodeURIComponent(username)}`
  // Order chosen for readability when a locator inspects the URL. Placeholders are LITERAL — Meta
  // replaces them at delivery; an organic (non-ad) click leaves them un-substituted and our capture
  // layer drops them (no fabricated data).
  const params = [
    `utm_source=${platform}`,
    `utm_medium=paid_social`,
    `utm_campaign={{campaign.name}}`,
    `utm_content={{ad.name}}`,
    `meta_campaign_id={{campaign.id}}`,
    `meta_adset_id={{adset.id}}`,
    `meta_ad_id={{ad.id}}`,
    `meta_campaign_name={{campaign.name}}`,
    `meta_adset_name={{adset.name}}`,
    `meta_ad_name={{ad.name}}`,
    // ACTUAL delivery surface for THIS click — Meta substitutes fb | ig | msg | an
    // (and others) at delivery. utm_source above is only the static link the
    // locator pasted; this is the real Facebook-vs-Instagram signal, normalized
    // for display in lib/meta/publisherPlatform.ts.
    `meta_publisher_platform={{site_source_name}}`,
  ].join("&")
  return `${base}?${params}`
}
