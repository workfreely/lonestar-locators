// Canonical lead-source styling — the single source of truth for how a
// lead's `source` value is labeled and colored anywhere in the CRM
// (DashboardStats, LeadCard, LeadPanel, the Performance page's
// LeadSourcesCard, or anywhere else a source badge/summary is rendered).
//
// Before this module existed, three near-identical copies of this mapping
// had drifted independently across DashboardStats.tsx, LeadCard.tsx, and
// LeadPanel.tsx — this replaces all three.
//
// Values for known sources are copied verbatim from the badge classes
// already used in LeadCard.tsx/LeadPanel.tsx (identical in both) and the
// bar/dot hex colors already used in DashboardStats.tsx's "Leads This
// Month" card, so existing visual behavior for the current 54 leads is
// unchanged. `direct` is aliased to the "Website" label, matching the
// special case LeadPanel already had.
//
// Any source not in KNOWN_SOURCES — today or in the future — gets a
// graceful neutral fallback instead of being silently omitted, so a brand
// new marketing source shows up automatically everywhere without needing
// a code change in multiple files.

export type SourceStyle = {
  label: string
  badgeClassName: string // pill classes: bg + text + border
  barColor: string // hex, for chart/bar/dot visualizations
}

const KNOWN_SOURCES: Record<string, SourceStyle> = {
  website:   { label: "Website",   badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200", barColor: "#6b7280" },
  tiktok:    { label: "TikTok",    badgeClassName: "bg-amber-50 text-amber-700 border-amber-200",       barColor: "#111827" },
  facebook:  { label: "Facebook",  badgeClassName: "bg-blue-50 text-blue-700 border-blue-200",          barColor: "#2563eb" },
  instagram: { label: "Instagram", badgeClassName: "bg-purple-50 text-purple-700 border-purple-200",    barColor: "#ec4899" },
  youtube:   { label: "YouTube",   badgeClassName: "bg-red-50 text-red-700 border-red-200",             barColor: "#dc2626" },
  referral:  { label: "Referral",  badgeClassName: "bg-orange-50 text-orange-700 border-orange-200",    barColor: "#ea580c" },
  direct:    { label: "Website",   badgeClassName: "bg-emerald-50 text-emerald-700 border-emerald-200", barColor: "#6b7280" },
  manual:    { label: "Manual",    badgeClassName: "bg-gray-50 text-gray-600 border-gray-200",          barColor: "#6b7280" },
}

const FALLBACK_BADGE_CLASS = "bg-gray-50 text-gray-600 border-gray-200"
const FALLBACK_BAR_COLOR = "#9ca3af"

/** Simple capitalize-first-letter, matching the convention LeadCard/LeadPanel already used for known sources. */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Resolves label + badge classes + bar color for a lead's source value.
 * Never returns nothing — unknown/future sources get a neutral fallback
 * with a readable capitalized label instead of being hidden.
 */
export function getSourceStyle(source: string | null | undefined): SourceStyle {
  if (!source) {
    return { label: "Unknown", badgeClassName: FALLBACK_BADGE_CLASS, barColor: FALLBACK_BAR_COLOR }
  }

  const known = KNOWN_SOURCES[source.toLowerCase()]
  if (known) return known

  return {
    label: capitalize(source),
    badgeClassName: FALLBACK_BADGE_CLASS,
    barColor: FALLBACK_BAR_COLOR,
  }
}

export function getSourceLabel(source: string | null | undefined): string {
  return getSourceStyle(source).label
}

export function getSourceBadgeClassName(source: string | null | undefined): string {
  return getSourceStyle(source).badgeClassName
}

export function getSourceBarColor(source: string | null | undefined): string {
  return getSourceStyle(source).barColor
}
