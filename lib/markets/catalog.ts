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
    neighborhoods: [
      "Downtown Fort Worth",
      "West 7th",
      "Near Southside (Magnolia)",
      "Cultural District",
      "TCU / Westcliff",
      "Fairmount",
      "Arlington Heights",
      "Clearfork",
      "Alliance",
      "Stockyards / North Side",
    ],
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
    neighborhoods: [
      "Downtown New Braunfels",
      "Gruene",
      "Creekside",
      "Veramendi",
      "River Chase",
      "Oak Run",
      "Westpointe",
      "Mission Valley",
      "Havenwood",
      "Solms",
    ],
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
    neighborhoods: [
      "Downtown San Marcos",
      "Texas State Campus Area",
      "Blanco Gardens",
      "Willow Creek",
      "Hunter Road",
      "Sessom Creek",
      "Wonder World",
      "Rio Vista",
      "La Cima",
      "Craddock",
    ],
    submarkets: [],
  },
  // ── Georgia ──
  {
    slug: "atlanta",
    name: "Atlanta",
    state: "GA",
    defaultTheme: "atlanta",
    neighborhoods: [
      "Midtown",
      "Downtown Atlanta",
      "Buckhead",
      "Old Fourth Ward",
      "Inman Park",
      "West Midtown",
      "Virginia-Highland",
      "Decatur",
      "Brookhaven",
      "Sandy Springs",
    ],
    submarkets: [],
  },
  // ── Arizona ──
  {
    slug: "phoenix",
    name: "Phoenix",
    state: "AZ",
    defaultTheme: "phoenix",
    neighborhoods: [
      "Downtown Phoenix",
      "Midtown Phoenix",
      "Roosevelt Row",
      "Arcadia",
      "Biltmore",
      "Camelback East",
      "Desert Ridge",
      "Ahwatukee",
      "Scottsdale",
      "Tempe",
    ],
    submarkets: [],
  },
  {
    slug: "tucson",
    name: "Tucson",
    state: "AZ",
    defaultTheme: "tucson",
    neighborhoods: [
      "Downtown Tucson",
      "University / Sam Hughes",
      "Armory Park",
      "Midtown Tucson",
      "Catalina Foothills",
      "East Tucson",
      "Northwest Tucson",
      "Oro Valley",
      "Marana",
      "Rita Ranch",
    ],
    submarkets: [],
  },
  // ── Florida ──
  {
    // Miami and Fort Lauderdale are SEPARATELY selectable. No existing workspace
    // had the old combined "miami-fort-lauderdale" slug (verified), so renaming
    // the slug to "miami" orphans no saved selection.
    slug: "miami",
    name: "Miami",
    state: "FL",
    defaultTheme: "miami",
    neighborhoods: [
      "Brickell",
      "Downtown Miami",
      "Wynwood",
      "Edgewater",
      "Midtown Miami",
      "Coconut Grove",
      "Coral Gables",
      "South Beach",
      "Doral",
      "Aventura",
    ],
    submarkets: [],
  },
  {
    // No dedicated Fort Lauderdale hero theme yet — defaults to the Miami theme.
    slug: "fort-lauderdale",
    name: "Fort Lauderdale",
    state: "FL",
    defaultTheme: "miami",
    neighborhoods: [
      "Downtown Fort Lauderdale",
      "Las Olas",
      "Flagler Village",
      "Victoria Park",
      "Coral Ridge",
      "Wilton Manors",
      "Fort Lauderdale Beach",
      "Sailboat Bend",
      "Oakland Park",
      "Plantation",
    ],
    submarkets: [],
  },
  {
    slug: "orlando",
    name: "Orlando",
    state: "FL",
    defaultTheme: "orlando",
    neighborhoods: [
      "Downtown Orlando",
      "Thornton Park",
      "Baldwin Park",
      "Winter Park",
      "College Park",
      "Dr. Phillips",
      "MetroWest",
      "Lake Nona",
      "UCF / East Orlando",
      "Altamonte Springs",
    ],
    submarkets: [],
  },
  // ── Illinois ──
  {
    slug: "chicago",
    name: "Chicago",
    state: "IL",
    defaultTheme: "chicago",
    neighborhoods: [
      "The Loop",
      "River North",
      "West Loop",
      "South Loop",
      "Streeterville",
      "Gold Coast",
      "Lincoln Park",
      "Lakeview",
      "Wicker Park",
      "Logan Square",
    ],
    submarkets: [],
  },
  // ── Colorado ──
  {
    slug: "denver",
    name: "Denver",
    state: "CO",
    defaultTheme: "denver",
    neighborhoods: [
      "LoDo (Lower Downtown)",
      "RiNo (River North)",
      "Capitol Hill",
      "Five Points",
      "LoHi (Lower Highlands)",
      "Cherry Creek",
      "Washington Park",
      "Golden Triangle",
      "Central Park (Stapleton)",
      "Denver Tech Center",
    ],
    submarkets: [],
  },
  // ── Tennessee ──
  {
    slug: "nashville",
    name: "Nashville",
    state: "TN",
    defaultTheme: "nashville",
    neighborhoods: [
      "Downtown Nashville",
      "The Gulch",
      "SoBro",
      "East Nashville",
      "Germantown",
      "Midtown",
      "Music Row",
      "12 South",
      "Hillsboro Village",
      "Green Hills",
    ],
    submarkets: [],
  },
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
// Same lookup, referenced by marketsForSlugs above (hoisted const initialisation
// order is fine because marketsForSlugs is only ever called at render time).
const BY_SLUG_ORDERED = BY_SLUG
const BY_NAME: Record<string, Market> = Object.fromEntries(MARKETS.map((m) => [m.name, m]))

export function getMarketBySlug(slug: string): Market | undefined {
  return BY_SLUG[slug]
}

export function getMarketByName(name: string): Market | undefined {
  return BY_NAME[name]
}

/**
 * Resolves an array of stored market slugs to their catalog entries, preserving
 * the workspace's SELECTION ORDER and silently dropping any unknown slugs (e.g.
 * a market that was retired). This is what the Smart Lead Form renders from.
 *
 * Selection order, not catalog order. workspaces.service_areas is stored in the
 * order the locator picked (both market pickers append), and the FIRST entry is
 * the primary market: it already decides the default hero theme via
 * defaultThemeForMarkets(). Sorting into catalog order here made the city
 * dropdown disagree with the hero — an agent who picked Orlando then Miami saw an
 * Orlando skyline above a list starting with Miami. Honouring the saved order
 * makes "primary market" mean one thing everywhere.
 */
export function marketsForSlugs(slugs: string[] | null | undefined): Market[] {
  if (!slugs?.length) return []
  return slugs
    .map((slug) => BY_SLUG_ORDERED[slug])
    .filter((m): m is Market => !!m)
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

// ── States ──────────────────────────────────────────────────────────────────
//
// Derived from MARKETS, never hand-maintained: `state` already lives on every
// market, so a second list could only drift. A Locator Beast agent works in ONE
// state, picks it first, and then chooses markets from within it — which is why
// onboarding needs states and a state→markets filter, not a flat market list.
//
// Order follows the catalog (states appear in the order their first market does),
// so Texas leads, matching the rest of the product.

export type SupportedState = { code: string; name: string }

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  GA: "Georgia",
  AZ: "Arizona",
  FL: "Florida",
  IL: "Illinois",
  CO: "Colorado",
  TN: "Tennessee",
}

export const SUPPORTED_STATES: SupportedState[] = MARKETS.reduce<SupportedState[]>((acc, m) => {
  if (!acc.some((s) => s.code === m.state)) {
    acc.push({ code: m.state, name: STATE_NAMES[m.state] ?? m.state })
  }
  return acc
}, [])

/** Markets belonging to one state, in catalog order. */
export function marketsForState(stateCode: string | null | undefined): Market[] {
  if (!stateCode) return []
  return MARKETS.filter((m) => m.state === stateCode)
}

/**
 * The single state a set of selected markets belongs to, or null when they span
 * several states or none are recognised.
 *
 * Used to backfill a state for an existing account that has markets but no saved
 * license_state. Deliberately refuses to guess: mixed-state or unknown selections
 * return null rather than silently picking the first one.
 */
export function stateForMarkets(slugs: string[] | null | undefined): string | null {
  const states = new Set(marketsForSlugs(slugs).map((m) => m.state))
  return states.size === 1 ? [...states][0] : null
}

/**
 * Helper copy for the Service Areas picker, shared by onboarding and Profile so
 * the two never drift.
 *
 * Derived from how many markets the chosen state actually has — NOT hard-coded to
 * Texas. "Choose up to 5" only makes sense when the state offers more than five;
 * telling an Illinois agent (one market) they may pick up to five reads as a
 * missing-content bug. The underlying cap is unchanged either way.
 */
export function serviceAreasHelperText(stateCode: string | null | undefined): string {
  return marketsForState(stateCode).length > MAX_SERVICE_AREAS
    ? `Choose up to ${MAX_SERVICE_AREAS} markets you serve.`
    : "Choose the markets you serve."
}

/**
 * Selection counter for the Service Areas picker, shared by onboarding and Profile.
 *
 * "0 of 5 selected" only means something when the state actually offers more than
 * five markets. Arizona has two, so "0 of 5" advertised three markets that do not
 * exist and read as missing data. Derived from the canonical catalog count — never
 * hard-coded to a particular state. The cap itself is unchanged.
 */
export function serviceAreasCountLabel(
  stateCode: string | null | undefined,
  selectedCount: number,
): string {
  return marketsForState(stateCode).length > MAX_SERVICE_AREAS
    ? `${selectedCount} of ${MAX_SERVICE_AREAS} selected`
    : `${selectedCount} selected`
}

// ── Market map centers ──────────────────────────────────────────────────────
//
// Approximate downtown coordinates per market, used ONLY to choose an initial map
// viewport for Beast Property Explorer. Static reference data that lives with the
// rest of the market catalog so there is one place to add a market — the same
// reason neighborhoods and defaultTheme live here.
//
// Deliberately coarse: this positions a camera, it is never used for distance,
// radius, scoring or proximity of any kind. Adding a market without a center is
// safe — callers fall back to the neutral default below.
export type MarketCenter = { lat: number; lng: number }

export const MARKET_CENTERS: Record<string, MarketCenter> = {
  austin: { lat: 30.2672, lng: -97.7431 },
  dallas: { lat: 32.7767, lng: -96.797 },
  "fort-worth": { lat: 32.7555, lng: -97.3308 },
  houston: { lat: 29.7604, lng: -95.3698 },
  "new-braunfels": { lat: 29.703, lng: -98.1245 },
  "san-antonio": { lat: 29.4241, lng: -98.4936 },
  "san-marcos": { lat: 29.8833, lng: -97.9414 },
  atlanta: { lat: 33.749, lng: -84.388 },
  phoenix: { lat: 33.4484, lng: -112.074 },
  tucson: { lat: 32.2226, lng: -110.9747 },
  miami: { lat: 25.7617, lng: -80.1918 },
  "fort-lauderdale": { lat: 26.1224, lng: -80.1373 },
  orlando: { lat: 28.5383, lng: -81.3792 },
  chicago: { lat: 41.8781, lng: -87.6298 },
  denver: { lat: 39.7392, lng: -104.9903 },
  nashville: { lat: 36.1627, lng: -86.7816 },
}

/** Neutral fallback when no market can be resolved (geographic center of the US). */
export const DEFAULT_MAP_CENTER: MarketCenter = { lat: 39.8283, lng: -98.5795 }

/** Camera position for a market slug, or null when unknown. */
export function centerForMarket(slug: string | null | undefined): MarketCenter | null {
  if (!slug) return null
  return MARKET_CENTERS[slug] ?? null
}

/** Camera position for a market's DISPLAY NAME (leads store `city` as the name). */
export function centerForMarketName(name: string | null | undefined): MarketCenter | null {
  const m = name ? getMarketByName(name) : undefined
  return m ? centerForMarket(m.slug) : null
}

/**
 * The market that owns a neighborhood/area NAME, or null when unrecognised.
 *
 * A lead's saved `neighborhoods` are free text, but in practice they are chosen
 * from this catalog — so a saved area can be resolved back to its market WITHOUT
 * geocoding anything. That is the only honest way a desired area can influence the
 * map: it selects which market's center to open on. Neighborhoods have no
 * coordinates of their own here, and V1 does not invent any.
 */
export function marketForNeighborhood(area: string | null | undefined): Market | null {
  const needle = (area ?? "").trim().toLowerCase()
  if (!needle) return null
  return (
    MARKETS.find((m) => m.neighborhoods.some((n) => n.toLowerCase() === needle)) ??
    MARKETS.find((m) => m.submarkets.some((n) => n.toLowerCase() === needle)) ??
    null
  )
}

/**
 * The market implied by a client's saved location criteria, in priority order:
 *   1. their saved desired areas (resolved through the catalog)
 *   2. their saved city/market
 * Returns null when neither is usable, so the caller can fall back to the agent's
 * primary service market.
 */
export function marketForClientCriteria(
  desiredAreas: string | null | undefined,
  city: string | null | undefined,
): Market | null {
  for (const raw of (desiredAreas ?? "").split(",")) {
    const m = marketForNeighborhood(raw)
    if (m) return m
  }
  return city ? getMarketByName(city.trim()) ?? null : null
}
