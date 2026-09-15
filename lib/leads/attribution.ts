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
): LeadAttribution {
  const g = (k: string) => clean(search.get(k))
  const utm_source = g("utm_source")
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
  }
  const src = normalizeSource(utm_source)
  if (src) out.source = src // else the caller's default (e.g. "smart_lead_form") stands
  // Drop undefined keys so we only send real values.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as LeadAttribution
}
