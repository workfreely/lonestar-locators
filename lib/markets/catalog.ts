// ── Locator Beast market catalog (Phase 1: Texas) ───────────────────────────
//
// Static reference data, maintained in code (NOT the database). The database
// only stores which of these markets a workspace has selected — see
// workspaces.service_areas (an array of market SLUGS from this file).
//
// The Smart Lead Form is a pure renderer: it reads the workspace's selected
// slugs, looks them up here, and shows only those cities + their neighborhoods.
//
// Adding a market later (Phoenix, Denver, Atlanta, Seattle, Chicago, Miami,
// Tampa, …) = append a Market entry here and redeploy. Nothing else changes:
// the onboarding selector, Settings, and the public form all read from MARKETS.
//
// `slug` is the stable key (stored on the workspace, used in code). `name` is
// the display label AND the value submitted as the lead's `city` (kept equal to
// the historical city strings so existing lead data/analytics stay consistent).
// The form generates the "All of {name}" option itself — do not list it here.

export type Market = {
  slug: string
  name: string
  state: string
  neighborhoods: string[]
  submarkets: string[]
}

export const MARKETS: Market[] = [
  {
    slug: "san-antonio",
    name: "San Antonio",
    state: "TX",
    neighborhoods: [
      "Downtown San Antonio",
      "La Cantera/The Rim",
      "The Dominion",
      "Stone Oak",
      "Alamo Ranch",
      "Southtown",
      "UTSA",
      "Medical Center",
      "Universal City/Converse",
      "Westover Hills",
      "Alamo Heights",
    ],
    submarkets: ["New Braunfels", "Boerne", "Schertz", "San Marcos"],
  },
  {
    slug: "austin",
    name: "Austin",
    state: "TX",
    neighborhoods: [
      "Downtown Austin",
      "South Congress (SoCo)",
      "East Austin",
      "Zilker",
      "Mueller",
      "Domain",
      "Barton Creek",
      "Westlake",
      "Riverside",
      "North Loop",
      "South Lamar",
    ],
    submarkets: [],
  },
  {
    slug: "dallas",
    name: "Dallas",
    state: "TX",
    neighborhoods: [
      "Downtown Dallas",
      "Uptown",
      "Midtown",
      "Deep Ellum",
      "Medical District",
      "Bishop Arts District",
      "Knox-Henderson",
      "Oak Lawn",
      "Design District",
      "Victory Park",
      "Lower Greenville",
      "Trinity Groves",
      "South Dallas",
    ],
    submarkets: [],
  },
  {
    slug: "houston",
    name: "Houston",
    state: "TX",
    neighborhoods: [
      "Downtown Houston",
      "Midtown",
      "Montrose",
      "The Heights",
      "Medical Center",
      "Museum District",
      "River Oaks",
      "Galleria",
      "Washington Ave",
      "East Downtown (EaDo)",
      "Greenway / Upper Kirby",
    ],
    submarkets: [],
  },
]

const BY_SLUG: Record<string, Market> = Object.fromEntries(MARKETS.map((m) => [m.slug, m]))
const BY_NAME: Record<string, Market> = Object.fromEntries(MARKETS.map((m) => [m.name, m]))

export function getMarketBySlug(slug: string): Market | undefined {
  return BY_SLUG[slug]
}

export function getMarketByName(name: string): Market | undefined {
  return BY_NAME[name]
}

/**
 * Resolves an array of stored market slugs to their catalog entries, preserving
 * the catalog's canonical order and silently dropping any unknown slugs (e.g.
 * a market that was retired). This is what the Smart Lead Form renders from.
 */
export function marketsForSlugs(slugs: string[] | null | undefined): Market[] {
  if (!slugs?.length) return []
  const set = new Set(slugs)
  return MARKETS.filter((m) => set.has(m.slug))
}

/** Comma-separated display string for the selected markets ("San Antonio, Austin"). */
export function serviceAreasLabel(slugs: string[] | null | undefined): string {
  return marketsForSlugs(slugs)
    .map((m) => m.name)
    .join(", ")
}

/** Options for the onboarding / Settings market multi-select. */
export const MARKET_OPTIONS = MARKETS.map((m) => ({ slug: m.slug, name: m.name, state: m.state }))
