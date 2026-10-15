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
  /**
   * SPECIFIC neighborhoods / districts — the finest geographic layer, finer than
   * `neighborhoods` (which in practice carries broad areas like "Downtown Dallas") and finer
   * than `submarkets` (separate cities inside the market, like Boerne and Schertz).
   *
   * OPTIONAL, and intentionally empty everywhere today. Social Beast's district field reads this
   * bank; until verified district names are approved market by market, the field falls back to
   * free text, which is how "Arts District" or "Tobin Hill" gets stored without this list
   * pretending to be authoritative. Omitted on a market = no bank, never an error.
   *
   * The Smart Lead Form does NOT read this. It is additive for Social Beast only.
   */
  districts?: string[]
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

/** Comma-separated display string for the selected markets ("San Antonio, Austin").
 *  Preserves the given slug order. */
export function serviceAreasLabel(slugs: string[] | null | undefined): string {
  return marketsForSlugs(slugs)
    .map((m) => m.name)
    .join(", ")
}

/** Like serviceAreasLabel, but always in canonical catalog order (independent of
 *  the stored selection order), so client-facing service-area lists render in a
 *  stable order that matches how Profile presents the markets. */
export function serviceAreasLabelCanonical(slugs: string[] | null | undefined): string {
  const set = new Set((slugs ?? []).filter(Boolean))
  return MARKETS.filter((m) => set.has(m.slug))
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

// ── Launch availability ─────────────────────────────────────────────────────
//
// Locator Beast launches TEXAS-ONLY. That is an availability decision, NOT a change
// to what the product knows: MARKETS above stays the complete registry of every
// market the platform supports, and nothing here removes, hides, renames or
// rewrites a single entry. Atlanta, Phoenix, Tucson, Miami, Fort Lauderdale,
// Orlando, Chicago, Denver and Nashville remain first-class catalog members and
// stay fully visible to admin/private systems, which read the unfiltered registry.
//
// This block is the ONE place launch availability is decided. Every later gate —
// the onboarding and Profile pickers, the public footer, the Smart Lead Form's
// fallback, and the server-side service-area allow-list — must consume these
// helpers rather than testing for "TX" itself, so opening a second state is an
// edit to LAUNCH_STATES and nothing else.
//
// Everything is DERIVED from MARKETS. No label, slug, state, centre, bound or any
// other market metadata is restated here, so a launch market can never drift from
// its catalog entry.

/** The states whose markets are selectable by a normal locator at launch. */
export const LAUNCH_STATES: readonly string[] = ["TX"]

/** Is this state open to normal locator signup at launch? */
export function isLaunchEnabledState(stateCode: string | null | undefined): boolean {
  return !!stateCode && LAUNCH_STATES.includes(stateCode)
}

/**
 * The launch-available markets, in catalog order — the full Market objects, not a
 * parallel copy. Derived, so adding a market to a launch state lists it here with
 * no second edit.
 */
export const LAUNCH_MARKETS: Market[] = MARKETS.filter((m) => isLaunchEnabledState(m.state))

// Membership test backing isLaunchEnabledMarket. A Set because the server-side
// allow-list will call it per submitted slug.
const LAUNCH_MARKET_SLUGS: ReadonlySet<string> = new Set(LAUNCH_MARKETS.map((m) => m.slug))

/**
 * Is this catalog slug selectable by a normal locator at launch? False for a
 * non-launch market AND for anything unrecognised — an unknown slug is never
 * treated as permitted, which is what makes this safe to use as an allow-list.
 */
export function isLaunchEnabledMarket(slug: string | null | undefined): boolean {
  return !!slug && LAUNCH_MARKET_SLUGS.has(slug)
}

// ── Launch-filtered views, for NORMAL LOCATOR-FACING surfaces ───────────────
//
// These are deliberately SEPARATE exports rather than a narrowing of
// SUPPORTED_STATES / marketsForState / marketsForSlugs. Those three stay whole
// because internal resolution depends on them: stateForMarkets backfills an
// existing account's license_state from its saved markets, resolveMapMarket picks
// the Explorer's opening market, and defaultThemeForMarkets derives a Smart Form's
// hero image. Narrowing them would silently change all three for a legacy
// non-Texas workspace, which is data behaviour, not display.
//
// So: user-facing pickers and public lists call the launch views below; internal
// resolution and admin tooling keep reading the full registry.

/** States offered to a normal locator at launch. Filtered SUPPORTED_STATES. */
export const LAUNCH_SUPPORTED_STATES: SupportedState[] = SUPPORTED_STATES.filter((s) => isLaunchEnabledState(s.code))

/** Markets offered for a state at launch — empty for a non-launch state. */
export function launchMarketsForState(stateCode: string | null | undefined): Market[] {
  return marketsForState(stateCode).filter((m) => isLaunchEnabledMarket(m.slug))
}

/**
 * Resolve SAVED service-area slugs for DISPLAY, dropping anything not launch-enabled.
 *
 * This is what keeps a legacy stored value — the one workspace holding "chicago" —
 * out of every locator- and client-facing surface WITHOUT touching the stored row.
 * The row keeps its value; the product simply stops presenting it as an active
 * market. Use this wherever saved areas are rendered; use marketsForSlugs when the
 * caller needs the truth of what is stored.
 */
export function launchMarketsForSlugs(slugs: string[] | null | undefined): Market[] {
  return marketsForSlugs(slugs).filter((m) => isLaunchEnabledMarket(m.slug))
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

// ── Desired-area centroids (deterministic) ────────────────────────────────────
// Smallest possible proof-of-concept resolver so a single desired area can steer
// the Unleash Beast search center. Stone Oak ONLY for this checkpoint — this is
// deliberately NOT the full neighborhood centroid system. Keyed by the same
// normalized text shape used elsewhere.
// Nested by market SLUG, then by normalized form label. The market scope is
// load-bearing, not organisational: the same label exists in more than one
// metro — "Medical Center" in San Antonio AND Houston, "Midtown" in Dallas AND
// Houston — so a flat label→center map would resolve one city's neighborhood to
// the other city's centroid (hundreds of miles away). Scoping by the resolved
// market slug keeps each metro's areas pinned to their own city. Inner keys use
// the SAME normalization centerForDesiredArea() applies to the form label
// (lowercase; "/" and punctuation → spaces).
const DESIRED_AREA_CENTERS: Record<string, Record<string, MarketCenter>> = {
  // ── San Antonio ──────────────────────────────────────────────────────────
  // Covers every currently selectable SA Preferred Neighborhood + Nearby Area so
  // none falls back to the downtown market center. All sit inside the SA
  // navigation bounds. UNCHANGED — values identical to the shipped SA catalog.
  "san-antonio": {
    // Preferred Neighborhoods
    "downtown san antonio": { lat: 29.4246, lng: -98.4926 },
    "la cantera the rim": { lat: 29.6053, lng: -98.581 },
    "the dominion": { lat: 29.6288, lng: -98.6255 },
    "stone oak": { lat: 29.6247, lng: -98.4842 },
    "alamo ranch": { lat: 29.4776, lng: -98.744 },
    "southtown": { lat: 29.411, lng: -98.493 },
    "utsa": { lat: 29.583, lng: -98.619 },
    "medical center": { lat: 29.5093, lng: -98.577 },
    "universal city converse": { lat: 29.533, lng: -98.3035 },
    "westover hills": { lat: 29.4585, lng: -98.665 },
    "alamo heights": { lat: 29.4847, lng: -98.4661 },
    // Nearby Areas (submarkets)
    "boerne": { lat: 29.7947, lng: -98.732 },
    "schertz": { lat: 29.5522, lng: -98.27 },
  },
  // ── Austin ───────────────────────────────────────────────────────────────
  "austin": {
    "downtown austin": { lat: 30.2672, lng: -97.7431 },
    "south congress soco": { lat: 30.2489, lng: -97.75 },
    "east austin": { lat: 30.262, lng: -97.722 },
    "zilker": { lat: 30.2669, lng: -97.7729 },
    "mueller": { lat: 30.299, lng: -97.705 },
    "domain": { lat: 30.401, lng: -97.723 },
    "barton creek": { lat: 30.26, lng: -97.825 },
    "westlake": { lat: 30.293, lng: -97.815 },
    "riverside": { lat: 30.234, lng: -97.725 },
    "north loop": { lat: 30.319, lng: -97.723 },
    "south lamar": { lat: 30.247, lng: -97.783 },
  },
  // ── Dallas ───────────────────────────────────────────────────────────────
  "dallas": {
    "downtown dallas": { lat: 32.781, lng: -96.797 },
    "uptown": { lat: 32.797, lng: -96.802 },
    "midtown": { lat: 32.925, lng: -96.824 },
    "deep ellum": { lat: 32.784, lng: -96.784 },
    "medical district": { lat: 32.81, lng: -96.84 },
    "bishop arts district": { lat: 32.751, lng: -96.829 },
    "knox henderson": { lat: 32.813, lng: -96.787 },
    "oak lawn": { lat: 32.811, lng: -96.811 },
    "design district": { lat: 32.792, lng: -96.823 },
    "victory park": { lat: 32.785, lng: -96.81 },
    "lower greenville": { lat: 32.813, lng: -96.77 },
    "trinity groves": { lat: 32.778, lng: -96.836 },
    "south dallas": { lat: 32.75, lng: -96.77 },
  },
  // ── Fort Worth ───────────────────────────────────────────────────────────
  "fort-worth": {
    "downtown fort worth": { lat: 32.7555, lng: -97.3308 },
    "west 7th": { lat: 32.755, lng: -97.358 },
    "near southside magnolia": { lat: 32.733, lng: -97.329 },
    "cultural district": { lat: 32.749, lng: -97.365 },
    "tcu westcliff": { lat: 32.709, lng: -97.362 },
    "fairmount": { lat: 32.728, lng: -97.335 },
    "arlington heights": { lat: 32.747, lng: -97.39 },
    "clearfork": { lat: 32.69, lng: -97.41 },
    "alliance": { lat: 32.98, lng: -97.32 },
    "stockyards north side": { lat: 32.789, lng: -97.347 },
  },
  // ── Houston ──────────────────────────────────────────────────────────────
  "houston": {
    "downtown houston": { lat: 29.7589, lng: -95.3677 },
    "midtown": { lat: 29.742, lng: -95.376 },
    "montrose": { lat: 29.744, lng: -95.39 },
    "the heights": { lat: 29.799, lng: -95.398 },
    "medical center": { lat: 29.71, lng: -95.398 },
    "museum district": { lat: 29.725, lng: -95.39 },
    "river oaks": { lat: 29.756, lng: -95.416 },
    "galleria": { lat: 29.74, lng: -95.461 },
    "washington ave": { lat: 29.771, lng: -95.401 },
    "east downtown eado": { lat: 29.75, lng: -95.35 },
    "greenway upper kirby": { lat: 29.733, lng: -95.431 },
  },
}

/** Deterministic center for a single desired area within a market, or null when
 *  unrecognised. `marketSlug` is REQUIRED to disambiguate labels that repeat
 *  across metros (e.g. "Medical Center", "Midtown"); pass the resolved map
 *  market slug. Null MUST be treated as "no finer center than the market",
 *  never an error. */
export function centerForDesiredArea(
  name: string | null | undefined,
  marketSlug: string | null | undefined,
): MarketCenter | null {
  const slug = (marketSlug ?? "").trim()
  if (!slug) return null
  const key = (name ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
  return DESIRED_AREA_CENTERS[slug]?.[key] ?? null
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
 * The market implied by a client's saved location criteria.
 *
 * The saved CITY is the anchor whenever it names a supported market. Desired
 * areas refine or confirm it; they never relocate the client to another metro.
 *
 * This ordering was the other way round, and it moved clients between markets.
 * Neighborhood names are not unique across metros — "Midtown" is a submarket of
 * more than one — so a client saved as Houston wanting "Midtown, Montrose" was
 * resolved into Dallas by the first token, against the explicit city sitting
 * right next to it. Free text guessed at is weaker evidence than a supported
 * market the agent actually chose, so the city wins any disagreement.
 *
 * Desired areas still decide when there is no usable city, but only when they
 * point at exactly ONE market: two areas naming two different metros is a
 * genuine ambiguity, and inventing a winner there would repeat the same bug in
 * a quieter form. Returning null lets the caller fall back to the agent's
 * primary market, which is the honest answer when the client's own criteria do
 * not identify one.
 */
export function marketForClientCriteria(
  desiredAreas: string | null | undefined,
  city: string | null | undefined,
): Market | null {
  const anchor = city ? getMarketByName(city.trim()) ?? null : null

  // Every DISTINCT market the desired areas point at. Deduped by slug so
  // "South Austin, Zilker" counts once — that is agreement, not ambiguity.
  const derived: Market[] = []
  for (const raw of (desiredAreas ?? "").split(",")) {
    const m = marketForNeighborhood(raw)
    if (m && !derived.some((d) => d.slug === m.slug)) derived.push(m)
  }

  // An explicit supported city settles it. Desired areas that agree add nothing
  // to the market choice (they are finer-grained than a market); ones that
  // disagree are exactly the case this anchor exists to refuse.
  if (anchor) return anchor

  // No usable city — a desired area may decide, but only unambiguously.
  if (derived.length === 1) return derived[0]
  return null
}

// ── Primary Market ───────────────────────────────────────────────────────────
//
// The agent's default market: the one Beast Property Explorer opens in when no
// client is selected. It is an EXPLICIT choice, never inferred from selection
// order — "the market you work in most often" is not "the one you happened to
// tick first". Stored on workspaces.primary_market using the SAME catalog slug
// as service_areas, so there is one market vocabulary, not two.

/** True when `slug` is a usable primary for this exact service-area selection. */
export function isValidPrimaryMarket(
  slug: string | null | undefined,
  serviceAreas: string[] | null | undefined,
): boolean {
  const s = (slug ?? "").trim()
  if (!s) return false
  return (serviceAreas ?? []).includes(s)
}

/**
 * The primary a selection IMPLIES, without guessing.
 *
 * Exactly one service area → that market is the primary by definition; the agent
 * is never asked to pick from a list of one. Two or more → returns null, because
 * there is no non-arbitrary answer. Deliberately never falls back to the first or
 * the alphabetically-first market: silently picking one is how the map ends up
 * opening in a city the agent rarely works.
 */
export function impliedPrimaryMarket(serviceAreas: string[] | null | undefined): string | null {
  const areas = (serviceAreas ?? []).filter(Boolean)
  return areas.length === 1 ? areas[0] : null
}

/**
 * Reconcile a saved primary against a (possibly changed) service-area selection.
 * Returns the primary that should now be stored:
 *   • still selected            → unchanged
 *   • incompatible, 1 area left → that area (auto-primary)
 *   • incompatible, 2+ left     → null, so the UI must ask
 * Used when markets are added/removed and when the licensed state changes, which
 * replaces the whole market list.
 */
export function reconcilePrimaryMarket(
  current: string | null | undefined,
  serviceAreas: string[] | null | undefined,
): string | null {
  if (isValidPrimaryMarket(current, serviceAreas)) return (current ?? "").trim()
  return impliedPrimaryMarket(serviceAreas)
}

/** True when the agent must be shown the Primary Market selector. */
export function needsPrimaryMarketChoice(
  current: string | null | undefined,
  serviceAreas: string[] | null | undefined,
): boolean {
  const areas = (serviceAreas ?? []).filter(Boolean)
  if (areas.length < 2) return false
  return !isValidPrimaryMarket(current, areas)
}

/** The markets offered as Primary — only the agent's own selected service areas. */
export function primaryMarketOptions(serviceAreas: string[] | null | undefined): Market[] {
  return marketsForSlugs(serviceAreas)
}

// ── Beast Property Explorer: which market does the map open in? ──────────────

export type MapMarketSource = "override" | "client" | "primary" | "service-area" | "state" | "fallback"

export type ResolvedMapMarket = {
  slug: string | null
  center: MarketCenter
  source: MapMarketSource
  /** The viewport the map is fenced to — the ACTIVE MARKET's box. */
  bounds: LatLngBounds | null
}

/**
 * Which supported market does the map show? In order:
 *   1. a temporary map-session override the agent picked from the switcher
 *   2. the market derived from the active client's desired areas, else their city
 *   3. the agent's saved Primary Market
 *   4. their first selected Service Area — still an explicit supported market
 *   5. the licensed state's centre, and only then the national centre
 *
 * Steps 1–4 always yield a SUPPORTED market, so 5 is unreachable for any
 * configured account: the map never opens on a whole state or the country while
 * a market can be determined. Every candidate is validated against the catalog,
 * so an arbitrary Google city can never become the active market.
 *
 * The licensed state remains a VALIDATION layer — a candidate outside it is
 * skipped — but it no longer defines the browsing viewport. That is now the
 * active market's own box (see boundsForMarket).
 *
 * The override is session-only: it moves the map and nothing else. It never
 * writes Primary Market and never touches the client's saved criteria.
 */
export function resolveMapMarket(input: {
  override?: string | null
  desiredAreas?: string | null
  city?: string | null
  primaryMarket?: string | null
  /** The agent's selected markets — the last explicit supported-market fallback. */
  serviceAreas?: string[] | null
  /** The agent's canonical profiles.license_state. Validation only. */
  licenseState?: string | null
}): ResolvedMapMarket {
  const state = (input.licenseState ?? "").trim().toUpperCase()

  const take = (slug: string | null | undefined, source: MapMarketSource): ResolvedMapMarket | null => {
    const s = (slug ?? "").trim()
    if (!s) return null
    // Must be a catalog market — never an arbitrary city Google could display.
    if (!getMarketBySlug(s)) return null
    if (state && !isMarketInState(s, state)) return null
    const c = centerForMarket(s)
    if (!c) return null
    return { slug: s, center: c, source, bounds: boundsForMarket(s) }
  }

  const fromOverride = take(input.override, "override")
  if (fromOverride) return fromOverride

  const fromClient = marketForClientCriteria(input.desiredAreas, input.city)
  const client = take(fromClient?.slug, "client")
  if (client) return client

  const primary = take(input.primaryMarket, "primary")
  if (primary) return primary

  for (const slug of input.serviceAreas ?? []) {
    const area = take(slug, "service-area")
    if (area) return area
  }

  // Only reached when the account has no usable market at all.
  const stateCenter = centerForState(state)
  if (stateCenter) return { slug: null, center: stateCenter, source: "state", bounds: boundsForState(state) }

  return { slug: null, center: DEFAULT_MAP_CENTER, source: "fallback", bounds: null }
}

// ── State boundaries ────────────────────────────────────────────────────────
//
// Beast Property Explorer stays inside the state the agent is licensed in. An
// agent panning to another state loses context and, worse, can run Places
// searches over areas they cannot legally work — every result there is noise.
//
// Static reference data, kept HERE beside MARKET_CENTERS so there is one market/
// geography catalog rather than two. Values are the standard bounding boxes of
// each supported state; only the seven states Locator Beast supports are listed,
// because those are the only ones an agent can select.
//
// A bounding box is deliberately coarser than the true border — Texas's box
// includes a sliver of Mexico and the Gulf. That is the right trade: the purpose
// is to stop someone drifting to another MARKET (Chicago while licensed in
// Texas), not to police the coastline. Polygon-accurate borders would need a new
// dataset and a point-in-polygon library for no practical gain.

export type LatLngBounds = { south: number; west: number; north: number; east: number }

export const STATE_BOUNDS: Record<string, LatLngBounds> = {
  TX: { south: 25.837, west: -106.646, north: 36.501, east: -93.508 },
  GA: { south: 30.356, west: -85.605, north: 35.001, east: -80.751 },
  AZ: { south: 31.332, west: -114.816, north: 37.004, east: -109.045 },
  FL: { south: 24.396, west: -87.635, north: 31.001, east: -79.974 },
  IL: { south: 36.970, west: -91.513, north: 42.508, east: -87.020 },
  CO: { south: 36.993, west: -109.060, north: 41.003, east: -102.042 },
  TN: { south: 34.983, west: -90.310, north: 36.678, east: -81.647 },
}

/** The allowed viewport for a state, or null when the state is unknown/unset. */
export function boundsForState(stateCode: string | null | undefined): LatLngBounds | null {
  const code = (stateCode ?? "").trim().toUpperCase()
  return STATE_BOUNDS[code] ?? null
}

/**
 * The centre of a state's box — the fallback when NO market can be resolved.
 * This is what replaces the national centre: an agent with no client and no
 * Primary Market lands in their own state, not in Kansas.
 */
export function centerForState(stateCode: string | null | undefined): MarketCenter | null {
  const b = boundsForState(stateCode)
  if (!b) return null
  return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 }
}

/** True when a point lies inside the state's allowed box. */
export function isInsideState(
  point: MarketCenter | null | undefined,
  stateCode: string | null | undefined,
): boolean {
  const b = boundsForState(stateCode)
  // No known state means no constraint — an unconfigured account is not trapped.
  if (!b) return true
  if (!point) return false
  return (
    point.lat >= b.south && point.lat <= b.north && point.lng >= b.west && point.lng <= b.east
  )
}

/** Nudge a point back inside the state box, axis by axis. */
export function clampToState(
  point: MarketCenter,
  stateCode: string | null | undefined,
): MarketCenter {
  const b = boundsForState(stateCode)
  if (!b) return point
  return {
    lat: Math.min(Math.max(point.lat, b.south), b.north),
    lng: Math.min(Math.max(point.lng, b.west), b.east),
  }
}

/** True when a market's centre falls inside the state — used to gate an override. */
export function isMarketInState(
  slug: string | null | undefined,
  stateCode: string | null | undefined,
): boolean {
  const m = getMarketBySlug((slug ?? "").trim())
  if (!m) return false
  const code = (stateCode ?? "").trim().toUpperCase()
  // The catalog already records each market's state; trust it over geometry.
  if (code) return m.state.toUpperCase() === code
  return true
}

// ── Per-market browsing bounds ──────────────────────────────────────────────
//
// Property Explorer shows ONE supported market at a time. State-wide browsing
// was too loose: a San Antonio session could be dragged into Austin, and results
// from the wrong metro are noise. The map is now fenced to the active market and
// the switcher is the only intentional way to move between them.
//
// Stored as a radius per market beside MARKET_CENTERS rather than as a second
// catalog: centre + radius IS the box, so there is one source for where a market
// is and how far it extends. Approximate metro-scale boxes, not city limits —
// the goal is a focused viewport, not municipal accuracy.
//
// Each radius is checked against the distance to that market's NEAREST
// neighbour, so adjacent markets can never overlap:
//   new-braunfels ↔ san-marcos  26.7km apart → 12km each
//   miami         ↔ fort-lauderdale 40.5km  → 18km each
//   austin        ↔ san-marcos  46.8km      → 21km
//   san-antonio   ↔ new-braunfels 47.3km    → 21km
//   dallas        ↔ fort-worth   50.0km     → 22km each  (kept distinct markets)
// Sprawling metros with distant neighbours get more room (Houston 45km).

export const DEFAULT_MARKET_RADIUS_KM = 25

export const MARKET_RADIUS_KM: Record<string, number> = {
  // Central Texas — tight, because these markets sit close together.
  "new-braunfels": 12,
  "san-marcos": 12,
  austin: 21,
  "san-antonio": 21,
  // Metroplex — Dallas and Fort Worth stay separate markets.
  dallas: 22,
  "fort-worth": 22,
  houston: 45,
  // South Florida — Miami and Fort Lauderdale stay separate markets.
  miami: 18,
  "fort-lauderdale": 18,
  orlando: 35,
  phoenix: 40,
  tucson: 30,
  atlanta: 40,
  nashville: 35,
  chicago: 40,
  denver: 35,
}

const KM_PER_DEG_LAT = 110.574

// Per-market EXPLICIT navigation bounds, overriding the symmetric radius box for
// markets whose practical locator footprint the radius box clips. This only widens
// how far a user may pan/zoom — the default center and default zoom are unchanged.
// San Antonio's real metro runs far NORTH (The Dominion, La Cantera/The Rim, up to
// Boerne), which the tight ~21 km box cut off. Other markets fall through to the
// radius box until they each get their own bound.
const MARKET_BOUNDS_OVERRIDE: Record<string, LatLngBounds> = {
  // North reaches past Boerne (~29.79); south/east/west keep the practical metro
  // (Southside/Brooks, Converse/Schertz, Alamo Ranch/Potranco). Comfortably
  // contains the default downtown center (29.4241, -98.4936).
  "san-antonio": { south: 29.15, west: -98.85, north: 29.83, east: -98.15 },
  // Modest expansion of the default ~21 km Austin box so the user can manually
  // pan/zoom across the practical metro: north to Round Rock/Cedar Park/Leander
  // (~30.5), south to Buda/Kyle (~30.0, deliberately short of the San Marcos
  // market at ~29.88), west to Bee Cave/Lakeway (~-97.98), east to Manor
  // (~-97.55). Still a bounded restriction — not the whole state. Comfortably
  // contains the default center (30.2672, -97.7431) and every Austin centroid
  // (incl. Domain 30.401), so the initial camera (center + zoom 11) is unchanged.
  "austin": { south: 30.0, west: -98.05, north: 30.6, east: -97.45 },
  // Dallas and Fort Worth are one practical locator metro (~50 km apart), so they
  // SHARE a single DFW navigation envelope: from either downtown the user can
  // manually pan/zoom across to the other city and the mid-cities in between.
  // West reaches past Fort Worth + Alliance (~-97.5); east past Dallas and the
  // north/east suburbs (Plano/Richardson/Garland, ~-96.5); north to
  // Frisco/McKinney/Denton and Alliance (~33.25); south to Arlington/Mansfield/
  // Cedar Hill (~32.5). Still a bounded restriction — the metroplex, not the
  // whole state. Contains both default centers (Dallas 32.7767,-96.797; Fort
  // Worth 32.7555,-97.3308) and every DFW centroid, so neither market's initial
  // camera (center + zoom 11) changes.
  "dallas": { south: 32.5, west: -97.6, north: 33.25, east: -96.5 },
  "fort-worth": { south: 32.5, west: -97.6, north: 33.25, east: -96.5 },
}

/** The browsing box for a supported market, or null when the slug is unknown. */
export function boundsForMarket(slug: string | null | undefined): LatLngBounds | null {
  const s = (slug ?? "").trim()
  const c = centerForMarket(s)
  if (!c) return null
  const override = MARKET_BOUNDS_OVERRIDE[s]
  if (override) return override
  const km = MARKET_RADIUS_KM[s] ?? DEFAULT_MARKET_RADIUS_KM
  const dLat = km / KM_PER_DEG_LAT
  // Longitude degrees shrink toward the poles, so the east/west span is widened
  // by 1/cos(lat) to keep the box roughly square on the ground.
  const dLng = km / (KM_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180))
  return { south: c.lat - dLat, west: c.lng - dLng, north: c.lat + dLat, east: c.lng + dLng }
}

/** True when a point lies inside the active market's browsing box. */
export function isInsideMarket(
  point: MarketCenter | null | undefined,
  slug: string | null | undefined,
): boolean {
  const b = boundsForMarket(slug)
  // No resolved market means no constraint — never trap an unconfigured account.
  if (!b) return true
  if (!point) return false
  return point.lat >= b.south && point.lat <= b.north && point.lng >= b.west && point.lng <= b.east
}

/** Nudge a point back inside the active market's box, axis by axis. */
export function clampToMarket(point: MarketCenter, slug: string | null | undefined): MarketCenter {
  const b = boundsForMarket(slug)
  if (!b) return point
  return {
    lat: Math.min(Math.max(point.lat, b.south), b.north),
    lng: Math.min(Math.max(point.lng, b.west), b.east),
  }
}
