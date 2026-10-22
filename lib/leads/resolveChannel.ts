// Canonical marketing CHANNEL for a lead — resolved at READ time from the attribution fields that
// already exist. Nothing here writes, and no raw field is altered: leads.source, utm_*, landing_page
// and the meta_* columns keep whatever they were given. That is deliberate — the rules below encode
// judgement, and judgement should stay reversible until it has proven itself against real reporting.
//
// WHY THIS EXISTS. `leads.source` is not a channel. Production holds at least three vocabularies in
// that one column: site labels ("Lone Star Website"), test labels ("Manual Test"), real channel
// slugs ("referral", "youtube"), and the submit route's own fallback ("smart_lead_form") — plus
// nulls. Grouping on it directly is what produces a "Lone Star Website 9" bucket that silently
// contains two paid Google leads and a YouTube lead.

import { normalizeSource } from "@/lib/leads/attribution"

/** The canonical channels. Every value is already a key in lib/leads/sourceStyles KNOWN_SOURCES, so
 *  badges and colors work with no UI change. */
export type Channel =
  | "instagram" | "facebook" | "tiktok" | "youtube" | "google"
  | "website" | "referral" | "direct" | "email" | "qr"
  | "manual" | "unknown"

/** Channels that are internal bookkeeping rather than marketing acquisition. Excluded from
 *  marketing-source totals, rankings and channel performance — a test record is not a channel, and
 *  leaving it in inflates every denominator it touches. */
const NON_MARKETING: ReadonlySet<Channel> = new Set<Channel>(["manual"])

/** Values that appear in leads.source but are NOT channels: the submit route's fallback, and the
 *  site/test labels written by other intake paths. Matched case-insensitively. */
const NON_CHANNEL_SOURCE = /^(smart_lead_form|manual test|test|lone ?star ?website|website form|unknown)$/i

/** Landing-page PATHS that identify a first-party web form. These say "a form on our site", which
 *  means the channel is the website only when nothing better is known (rule 5). */
const WEBSITE_PATHS = /\/(start-your-search|get-my-list|contact|thank-you)\b/i

/** The attribution fields this resolver reads. Deliberately a structural type so any lead-shaped
 *  object works without importing a heavyweight Lead type. */
export type ChannelInput = {
  source?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  landing_page?: string | null
  meta_campaign_id?: string | null
  meta_adset_id?: string | null
  meta_ad_id?: string | null
  meta_publisher_platform?: string | null
}

const clean = (v: string | null | undefined) => (v ?? "").trim()

/**
 * Finer-grained SOURCES that are not channels of their own, mapped to the channel they belong to.
 *
 * CHANNEL and SOURCE are two different axes, and this is the seam between them. A second-chance
 * form link is Facebook traffic — it belongs in the Facebook bucket in channel reporting — but it
 * keeps its own distinct `leads.source` so the CRM badge can tell the two Facebook groups apart.
 * Without this alias the value matches no channel and the lead falls through every rule below to
 * "unknown": a real Facebook lead missing from Facebook's totals, which is exactly the kind of
 * silent mis-bucketing this resolver exists to prevent.
 */
const SOURCE_TO_CHANNEL: Record<string, Channel> = { facebook_second_chance: "facebook" }

/** A canonical channel if the value already is one (or aliases to one), else null. */
function asChannel(v: string | null | undefined): Channel | null {
  const s = clean(v).toLowerCase()
  if (!s) return null
  if (SOURCE_TO_CHANNEL[s]) return SOURCE_TO_CHANNEL[s]
  const known: Channel[] = ["instagram", "facebook", "tiktok", "youtube", "google", "website", "referral", "direct", "email", "qr", "manual"]
  return (known as string[]).includes(s) ? (s as Channel) : null
}

/** utm_source carried in the landing URL's query string, for rows whose column is empty. */
function utmFromLandingPage(landing: string | null | undefined): string | null {
  const s = clean(landing)
  if (!s || !s.includes("utm_source=")) return null
  try {
    // Accept a bare path as well as an absolute URL.
    const u = new URL(s, "https://locatorbeast.com")
    return clean(u.searchParams.get("utm_source")) || null
  } catch {
    return null
  }
}

/**
 * THE canonical channel, by precedence:
 *
 *   1. Meta campaign/ad ids + publisher platform — only ever set by an ad click
 *   2. utm_source
 *   3. utm_source embedded in landing_page
 *   4. an existing leads.source that is ALREADY a canonical channel
 *   5. a known first-party website landing path
 *   6. unknown
 *
 * Rule 2 deliberately outranks rule 4: "Lone Star Website" is the SITE the form sat on, not the
 * channel that produced the click, so a lead carrying utm_source=google is Google traffic that
 * happened to land on that site. Three production leads turn on exactly this (58, 59, 62).
 *
 * `manual` is returned for test records so callers can exclude them explicitly rather than having
 * them silently vanish.
 */
export function resolveChannel(lead: ChannelInput | null | undefined): Channel {
  if (!lead) return "unknown"

  // 1 — paid Meta click. The publisher platform is the delivery surface (ig | fb | msg | an).
  const hasMetaIds = !!(clean(lead.meta_campaign_id) || clean(lead.meta_adset_id) || clean(lead.meta_ad_id))
  if (hasMetaIds) {
    const pub = clean(lead.meta_publisher_platform).toLowerCase()
    if (pub.startsWith("ig") || pub.includes("instagram")) return "instagram"
    if (pub.startsWith("fb") || pub.includes("facebook")) return "facebook"
    // Meta ids but an unrecognised surface: still Meta, so fall through to utm_source rather than
    // guessing a platform.
  }

  // 2 — the click's own declaration.
  const fromUtm = asChannel(normalizeSource(clean(lead.utm_source) || undefined))
  if (fromUtm) return fromUtm

  // 3 — same, recovered from the landing URL.
  const fromLanding = asChannel(normalizeSource(utmFromLandingPage(lead.landing_page) || undefined))
  if (fromLanding) return fromLanding

  // 4 — an existing source value, but only when it is already a real channel. Site/test/fallback
  //     labels are explicitly NOT channels and must not become buckets.
  const rawSource = clean(lead.source)
  if (rawSource && !NON_CHANNEL_SOURCE.test(rawSource)) {
    const fromSource = asChannel(normalizeSource(rawSource))
    if (fromSource) return fromSource
  }
  // Test records are identifiable and kept as their own channel so callers can exclude them.
  if (/^(manual test|test)$/i.test(rawSource)) return "manual"

  // 5 — a first-party form path tells us the website, and nothing finer.
  if (WEBSITE_PATHS.test(clean(lead.landing_page))) return "website"
  // A site label with no other signal is the same statement: the lead came through our site.
  if (/^lone ?star ?website$/i.test(rawSource)) return "website"

  // 6 — never guess.
  return "unknown"
}

/** Is this lead part of MARKETING acquisition reporting? False for internal/test records. */
export function isMarketingLead(lead: ChannelInput | null | undefined): boolean {
  return !NON_MARKETING.has(resolveChannel(lead))
}

/** Only the leads that belong in marketing-source totals, rankings and channel performance. */
export function marketingLeads<T extends ChannelInput>(leads: readonly T[] | null | undefined): T[] {
  return (leads ?? []).filter((l) => isMarketingLead(l))
}

// ── TRAFFIC TYPE ────────────────────────────────────────────────────────────────────────────
// Deliberately conservative. "Not paid" is NOT the same as "organic": a lead on /start-your-search
// with no UTM could be SEO, a bookmark, or an untagged ad, and asserting organic would invent a
// fact. Only positive evidence earns a label.

export type TrafficType = "paid" | "referral" | "direct" | "unknown"

/** Mediums that are unambiguous paid markers. `paid_social` is what lib/meta/adLink stamps on every
 *  outbound ad URL; `cpc`/`ppc`/`paid*` are the industry conventions. */
const PAID_MEDIUM = /^(paid_social|paid-social|cpc|ppc|paid|paidsearch|paid_search|display)$/i

export function resolveTrafficType(lead: ChannelInput | null | undefined): TrafficType {
  if (!lead) return "unknown"

  // Positive paid evidence, in order of strength: Meta ad ids, then an explicit paid medium.
  if (clean(lead.meta_campaign_id) || clean(lead.meta_adset_id) || clean(lead.meta_ad_id)) return "paid"
  if (PAID_MEDIUM.test(clean(lead.utm_medium))) return "paid"

  const channel = resolveChannel(lead)
  if (channel === "referral") return "referral"
  // `direct` is only ever set deliberately — by a branded /direct link or an explicit source — so it
  // is the one non-paid label the data actually supports.
  if (channel === "direct") return "direct"

  // Everything else — including website, youtube, instagram without a paid marker — is UNKNOWN, not
  // organic. We know the channel; we do not know whether money bought the click.
  return "unknown"
}
