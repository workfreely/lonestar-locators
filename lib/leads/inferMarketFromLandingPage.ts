// Display-only helper for short-form leads that haven't picked a city yet.
// Infers the market from the city-specific landing page slug they arrived on.

const MARKET_BY_SLUG: Record<string, string> = {
  dallas: "Dallas",
  houston: "Houston",
  austin: "Austin",
  "san-antonio": "San Antonio",
}

export function inferMarketFromLandingPage(landingPage?: string | null): string | null {
  if (!landingPage) return null
  const slug = landingPage.split("/")[1]
  return (slug && MARKET_BY_SLUG[slug]) || null
}
