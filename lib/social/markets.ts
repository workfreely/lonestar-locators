// Social Autopilot market labels.
//
// Locator Beast's canonical market catalog (lib/markets/catalog.ts MARKETS) lists
// "Dallas" and "Fort Worth" as SEPARATE markets. For Social Autopilot the operator
// works by metro and treats the Dallas–Fort Worth metro as one market labelled "DFW".
// To avoid quietly creating a second "Dallas" taxonomy, SA uses this small curated,
// EXTENSIBLE list of market labels (stored as the free-text social_content.market).
// Add entries here as coverage grows — nothing else is hard-coded to these values.
export const SOCIAL_MARKETS: readonly string[] = ["San Antonio", "Austin", "DFW", "Houston"]

// Normalize a stored/legacy market string to the SA label. "Dallas"/"Fort Worth"/
// "Dallas-Fort Worth" collapse to "DFW"; everything else is returned trimmed as-is
// (so future markets pass through unchanged). Used only for display/filtering — it
// never rewrites stored rows.
export function normalizeSocialMarket(m: string | null | undefined): string {
  const s = (m ?? "").trim()
  if (!s) return ""
  if (/^(dallas|fort\s*worth|dallas[\s–-]*fort\s*worth|dfw)$/i.test(s)) return "DFW"
  return s
}
