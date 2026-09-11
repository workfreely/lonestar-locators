// Social Autopilot market labels.
//
// Locator Beast's canonical market catalog (lib/markets/catalog.ts MARKETS) is the source
// of truth for the shared labels used here — "Austin", "Dallas", "Houston", "San Antonio"
// match its `name` values exactly. The catalog lists Dallas and Fort Worth as SEPARATE
// markets and has no "DFW" entry (DFW there is only a shared Dallas+Fort Worth map
// envelope). Social Autopilot works by metro and additionally offers "DFW" as its own
// distinct market label — so this small curated, EXTENSIBLE list keeps the SA ordering and
// the DFW option in one place (stored verbatim as the free-text social_content.market).
//
// Dallas and DFW are DISTINCT markets here: they are never merged, and neither is renamed
// into the other. Chip / select order is authoritative (rendered after the leading "All").
export const SOCIAL_MARKETS: readonly string[] = ["Austin", "Dallas", "DFW", "Houston", "San Antonio"]

// Display/filter normalization: trim only. Markets are stored and shown VERBATIM — Dallas
// stays Dallas and DFW stays DFW (no collapsing, no merging of underlying values). Used
// only for display/filtering; it never rewrites stored rows.
export function normalizeSocialMarket(m: string | null | undefined): string {
  return (m ?? "").trim()
}
