// Marketing attribution captured from the landing URL → written onto the canonical lead. Pure &
// deterministic (unit-testable). Used by the Smart Lead Form so ad clicks (Instagram/Facebook →
// Smart Lead Form link) carry campaign/ad attribution into public.leads. NEVER fabricates values.

export type LeadAttribution = {
  source?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
  fbclid?: string
  landing_page?: string
  referrer_url?: string
  meta_campaign_id?: string
  meta_adset_id?: string
  meta_ad_id?: string
  meta_campaign_name?: string
  meta_adset_name?: string
  meta_ad_name?: string
  // Raw Meta {{site_source_name}} token for THIS click (fb | ig | msg | an | …).
  // The only reliable Facebook-vs-Instagram signal; normalized for display in
  // lib/meta/publisherPlatform.ts. Stored verbatim, never collapsed here.
  meta_publisher_platform?: string
}

// A Meta dynamic-URL placeholder that never got substituted (organic click, or the ad wasn't set up
// with URL params) arrives literally as "{{campaign.id}}". Treat those as ABSENT — never store them.
function clean(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  const t = v.trim()
  if (!t || /^\{\{.*\}\}$/.test(t)) return undefined // un-substituted Meta placeholder
  return t.slice(0, 500)
}

/** Normalize a utm_source into a canonical lead `source` (matches lib/leads/sourceStyles KNOWN_SOURCES).
 *  Paid-vs-organic lives in utm_medium, NOT in source. Returns undefined for unknown/empty. */
export function normalizeSource(utmSource: string | undefined): string | undefined {
  const s = (utmSource ?? "").trim().toLowerCase()
  if (!s) return undefined
  if (s === "ig" || s.includes("instagram")) return "instagram"
  // BEFORE the general facebook rule, and that order is the whole point: this value CONTAINS
  // "facebook", so the line below would collapse it and the two Facebook groups would be
  // indistinguishable on the lead — a form that looks right and reports wrong.
  if (s.includes("second_chance") || s.includes("second-chance")) return "facebook_second_chance"
  if (s === "fb" || s.includes("facebook")) return "facebook"
  if (s.includes("tiktok")) return "tiktok"
  if (s.includes("youtube")) return "youtube"
  if (s.includes("google")) return "google"
  return s.replace(/[^a-z0-9_]+/g, "_") // deterministic slug; renders via KNOWN_SOURCES fallback
}

/** Collect attribution from a URLSearchParams + the landing href + referrer. Any field that isn't
 *  present (or is an un-substituted Meta placeholder) is simply omitted — no fabricated data. */
export function collectLeadAttribution(
  search: URLSearchParams,
  href: string | undefined,
  referrer: string | undefined,
  /**
   * utm_source implied by the CLEAN branded URL path (locatorbeast.com/{agent}/tt → "tiktok"),
   * resolved server-side from the one slug table in smart-lead-form/_lib/shareConfig.
   *
   * It is a FALLBACK, never an override: an explicit ?utm_source in the query always wins, so every
   * link already live in a bio, a QR code or an ad keeps attributing exactly as it does today. This
   * is also why the branded path does not synthesize utm_medium/utm_campaign — inventing values the
   * click did not carry would corrupt paid-vs-organic reporting, which reads utm_medium.
   */
  pathUtmSource?: string | undefined,
): LeadAttribution {
  const g = (k: string) => clean(search.get(k))
  const utm_source = g("utm_source") ?? clean(pathUtmSource)
  const out: LeadAttribution = {
    utm_source,
    utm_medium: g("utm_medium"),
    utm_campaign: g("utm_campaign"),
    utm_content: g("utm_content"),
    utm_term: g("utm_term"),
    fbclid: g("fbclid"),
    landing_page: clean(href),
    referrer_url: clean(referrer),
    // Meta stable ids (canonical) + display-only name snapshots.
    meta_campaign_id: g("meta_campaign_id"),
    meta_adset_id: g("meta_adset_id"),
    meta_ad_id: g("meta_ad_id"),
    meta_campaign_name: g("meta_campaign_name"),
    meta_adset_name: g("meta_adset_name"),
    meta_ad_name: g("meta_ad_name"),
    // Delivery surface (fb/ig/msg/an). clean() drops an un-substituted placeholder.
    meta_publisher_platform: g("meta_publisher_platform"),
  }
  const src = normalizeSource(utm_source)
  if (src) out.source = src // else the caller's default (e.g. "smart_lead_form") stands
  // Drop undefined keys so we only send real values.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as LeadAttribution
}
