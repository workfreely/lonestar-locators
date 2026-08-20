// ── Locator Beast market catalog (SUPPORTED_MARKETS) ────────────────────────
//
// The SINGLE source of truth for supported *markets* — where a locator works.
// Static reference data, maintained in code (NOT the database). The database
// only stores which of these markets a workspace has selected — see
// workspaces.service_areas (an array of market SLUGS from this file).
//
// A market is NOT a visual theme. A theme is the landing-page background image;
// those live in `lib/themes/config.ts`. The two are related only through
// `defaultTheme` below (and the derived DEFAULT_THEME_BY_MARKET): the theme a
// new Smart Form starts on for that market. After creation the user can pick any
// other theme in the Hero Background dropdown and the market is left untouched —
// market and background are independent once the initial default is applied.
//
// The list order is authoritative: onboarding, Settings, and the public form all
// render markets in this exact order (grouped by state). Adding a market = append
// a Market entry here (with its defaultTheme) and redeploy. Nothing else changes.
//
// `slug` is the stable key (stored on the workspace, used in code). `name` is
// the display label AND the value submitted as the lead's `city`. `defaultTheme`
// is a theme slug from lib/themes/config.ts (note DFW → "dallas", Miami–Fort
// Lauderdale → "miami" — intentional). The form generates the "All of {name}"
// option itself — do not list it in neighborhoods.

export type Market = {
  slug: string
  name: string
  state: string
  /** Theme slug (lib/themes/config.ts) this market defaults its hero background to. */
  defaultTheme: string
  neighborhoods: string[]
  submarkets: string[]
}

export const MARKETS: Market[] = [
  // ── Texas ──
  {
    slug: "austin",
    name: "Austin",
    state: "TX",
    defaultTheme: "austin",
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
    // Dallas and Fort Worth are SEPARATELY selectable — a locator may serve one
    // but not the other. Slug kept as "dallas" so existing workspace selections
    // keep resolving (they now mean Dallas specifically).
    slug: "dallas",
    name: "Dallas",
    state: "TX",
    defaultTheme: "dallas",
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
    slug: "fort-worth",
    name: "Fort Worth",
    state: "TX",
    defaultTheme: "fort-worth",
    neighborhoods: [],
    submarkets: [],
  },
  {
    slug: "houston",
    name: "Houston",
    state: "TX",
    defaultTheme: "houston",
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
  {
    slug: "new-braunfels",
    name: "New Braunfels",
    state: "TX",
    defaultTheme: "new-braunfels",
    neighborhoods: [],
    submarkets: [],
  },
  {
    slug: "san-antonio",
    name: "San Antonio",
    state: "TX",
    defaultTheme: "san-antonio",
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
    submarkets: ["Boerne", "Schertz"],
  },
  {
    slug: "san-marcos",
    name: "San Marcos",
    state: "TX",
    defaultTheme: "san-marcos",
    neighborhoods: [],
    submarkets: [],
  },
  // ── Georgia ──
  { slug: "atlanta", name: "Atlanta", state: "GA", defaultTheme: "atlanta", neighborhoods: [], submarkets: [] },
  // ── Arizona ──
  { slug: "phoenix", name: "Phoenix", state: "AZ", defaultTheme: "phoenix", neighborhoods: [], submarkets: [] },
  { slug: "tucson", name: "Tucson", state: "AZ", defaultTheme: "tucson", neighborhoods: [], submarkets: [] },
  // ── Florida ──
  {
    // Miami and Fort Lauderdale are SEPARATELY selectable. No existing workspace
    // had the old combined "miami-fort-lauderdale" slug (verified), so renaming
    // the slug to "miami" orphans no saved selection.
    slug: "miami",
    name: "Miami",
    state: "FL",
    defaultTheme: "miami",
    neighborhoods: [],
    submarkets: [],
  },
  {
    // No dedicated Fort Lauderdale hero theme yet — defaults to the Miami theme.
    slug: "fort-lauderdale",
    name: "Fort Lauderdale",
    state: "FL",
    defaultTheme: "miami",
    neighborhoods: [],
    submarkets: [],
  },
  { slug: "orlando", name: "Orlando", state: "FL", defaultTheme: "orlando", neighborhoods: [], submarkets: [] },
  // ── Illinois ──
  { slug: "chicago", name: "Chicago", state: "IL", defaultTheme: "chicago", neighborhoods: [], submarkets: [] },
  // ── Colorado ──
  { slug: "denver", name: "Denver", state: "CO", defaultTheme: "denver", neighborhoods: [], submarkets: [] },
  // ── Tennessee ──
  { slug: "nashville", name: "Nashville", state: "TN", defaultTheme: "nashville", neighborhoods: [], submarkets: [] },
]

/** Alias — markets are the supported markets. Kept for intent-revealing imports. */
export const SUPPORTED_MARKETS = MARKETS

/** market slug → default hero theme slug. Derived so there's no second list. */
export const DEFAULT_THEME_BY_MARKET: Record<string, string> = Object.fromEntries(
  MARKETS.map((m) => [m.slug, m.defaultTheme])
)

/**
 * The theme a new Smart Form should start on, given the workspace's selected
 * market slugs (uses the first/primary market). Returns null when there's no
 * market or no mapping — the caller falls back to "custom"/default background.
 */
export function defaultThemeForMarkets(slugs: string[] | null | undefined): string | null {
  const primary = slugs?.find((s) => s in DEFAULT_THEME_BY_MARKET)
  return primary ? DEFAULT_THEME_BY_MARKET[primary] : null
}

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

/**
 * The maximum number of markets one workspace may serve. Enforced in the UI
 * (Profile + onboarding), in set_workspace_service_areas, and by a check
 * constraint on workspaces.service_areas — the UI is convenience, the database
 * is the rule. It lives here because it is a fact about the market catalog,
 * not about any one screen.
 */
export const MAX_SERVICE_AREAS = 5

/** Options for the onboarding / Settings market multi-select. */
export const MARKET_OPTIONS = MARKETS.map((m) => ({ slug: m.slug, name: m.name, state: m.state }))
