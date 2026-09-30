// PASS 1 — canonical Texas launch config.
//
// Locator Beast launches Texas-only. This asserts the ONE launch rule and, just as
// importantly, that adding it changed NOTHING: the full 16-market registry, every
// slug and label, and every existing derived export must be byte-identical to their
// pre-Pass-1 behaviour. A launch helper that quietly altered the catalog would be a
// far worse bug than the gating it enables.
//
// Run: npx tsx scripts/markets/launchConfig.test.ts
import {
  MARKETS, SUPPORTED_MARKETS, SUPPORTED_STATES, MARKET_OPTIONS, MAX_SERVICE_AREAS,
  LAUNCH_STATES, LAUNCH_MARKETS, isLaunchEnabledState, isLaunchEnabledMarket,
  marketsForState, marketsForSlugs, getMarketBySlug, getMarketByName, serviceAreasLabel,
  type Market,
} from "@/lib/markets/catalog"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

// The complete registry, frozen here as literal data. If a future edit renames,
// reorders, adds or removes a market, these two lists are what catches it.
const ALL_SLUGS = [
  "austin", "dallas", "fort-worth", "houston", "new-braunfels", "san-antonio", "san-marcos",
  "atlanta", "phoenix", "tucson", "miami", "fort-lauderdale", "orlando", "chicago", "denver", "nashville",
] as const
const ALL_NAMES = [
  "Austin", "Dallas", "Fort Worth", "Houston", "New Braunfels", "San Antonio", "San Marcos",
  "Atlanta", "Phoenix", "Tucson", "Miami", "Fort Lauderdale", "Orlando", "Chicago", "Denver", "Nashville",
] as const
const LAUNCH_SLUGS = [
  "austin", "dallas", "fort-worth", "houston", "new-braunfels", "san-antonio", "san-marcos",
] as const
const NON_LAUNCH_STATES = ["GA", "AZ", "FL", "IL", "CO", "TN"] as const

console.log("the full registry is INTACT (nothing removed, renamed or reordered):")
ok("16 markets", MARKETS.length === 16)
ok("slugs unchanged, in catalog order", MARKETS.map((m) => m.slug).join("|") === ALL_SLUGS.join("|"))
ok("labels unchanged, in catalog order", MARKETS.map((m) => m.name).join("|") === ALL_NAMES.join("|"))
ok("all 7 states still present", [...new Set(MARKETS.map((m) => m.state))].join("|") === "TX|GA|AZ|FL|IL|CO|TN")
ok("every non-Texas market still in the registry",
  ["atlanta", "phoenix", "tucson", "miami", "fort-lauderdale", "orlando", "chicago", "denver", "nashville"]
    .every((s) => MARKETS.some((m) => m.slug === s)))
ok("no DFW market was introduced", !MARKETS.some((m) => /dfw/i.test(m.slug) || /dfw/i.test(m.name)))
ok("SUPPORTED_MARKETS is still the FULL registry, not the launch set", SUPPORTED_MARKETS.length === 16 && SUPPORTED_MARKETS === MARKETS)

console.log("\nthe launch set:")
ok("LAUNCH_STATES is Texas only", LAUNCH_STATES.length === 1 && LAUNCH_STATES[0] === "TX")
ok("exactly 7 launch markets", LAUNCH_MARKETS.length === 7)
ok(`launch slugs are ${LAUNCH_SLUGS.join(", ")}`, LAUNCH_MARKETS.map((m) => m.slug).join("|") === LAUNCH_SLUGS.join("|"))
ok("every launch market is a Texas market", LAUNCH_MARKETS.every((m) => m.state === "TX"))
ok("the launch set is every Texas market (none omitted)",
  LAUNCH_MARKETS.length === MARKETS.filter((m) => m.state === "TX").length)
ok("launch markets are the SAME objects as the registry's (derived, not copied)",
  LAUNCH_MARKETS.every((m) => MARKETS.includes(m)))

console.log("\nisLaunchEnabledState:")
ok("Texas is launch-enabled", isLaunchEnabledState("TX"))
for (const st of NON_LAUNCH_STATES) ok(`${st} is NOT launch-enabled`, !isLaunchEnabledState(st))
ok("a state outside the catalog is NOT launch-enabled", !isLaunchEnabledState("CA") && !isLaunchEnabledState("NY"))
ok("null / empty / lowercase are NOT launch-enabled",
  !isLaunchEnabledState(null) && !isLaunchEnabledState(undefined) && !isLaunchEnabledState("") && !isLaunchEnabledState("tx"))

console.log("\nisLaunchEnabledMarket:")
ok("all 7 launch slugs are enabled", LAUNCH_SLUGS.every((s) => isLaunchEnabledMarket(s)))
ok("every non-Texas catalog market is NOT enabled",
  MARKETS.filter((m) => m.state !== "TX").every((m) => !isLaunchEnabledMarket(m.slug)))
ok("an unknown slug is NOT enabled — safe as an allow-list",
  !isLaunchEnabledMarket("mars") && !isLaunchEnabledMarket("dfw") && !isLaunchEnabledMarket("Austin"))
ok("null / undefined / empty are NOT enabled",
  !isLaunchEnabledMarket(null) && !isLaunchEnabledMarket(undefined) && !isLaunchEnabledMarket(""))
ok("the predicate agrees with the derived list for EVERY catalog market",
  MARKETS.every((m) => isLaunchEnabledMarket(m.slug) === (m.state === "TX")))

console.log("\nNO BEHAVIOUR CHANGE — every existing export answers exactly as before:")
// These are the functions the pickers, the public form, the footer and the emails
// call today. Pass 1 must not have narrowed a single one of them.
ok("SUPPORTED_STATES still lists all 7 states",
  SUPPORTED_STATES.length === 7 && SUPPORTED_STATES.map((s) => s.code).join("|") === "TX|GA|AZ|FL|IL|CO|TN")
ok("SUPPORTED_STATES still names them", SUPPORTED_STATES.find((s) => s.code === "IL")?.name === "Illinois")
ok("MARKET_OPTIONS still offers all 16", MARKET_OPTIONS.length === 16)
ok("marketsForState still returns NON-launch states' markets",
  marketsForState("IL").map((m) => m.slug).join("|") === "chicago"
  && marketsForState("FL").length === 3
  && marketsForState("AZ").length === 2)
ok("marketsForState('TX') still returns all 7", marketsForState("TX").length === 7)
ok("marketsForSlugs still resolves a non-launch slug",
  marketsForSlugs(["chicago"]).length === 1 && marketsForSlugs(["chicago"])[0].name === "Chicago")
ok("getMarketBySlug still resolves non-launch markets",
  getMarketBySlug("denver")?.name === "Denver" && getMarketBySlug("nashville")?.state === "TN")
ok("getMarketByName still resolves non-launch markets", getMarketByName("Orlando")?.slug === "orlando")
ok("serviceAreasLabel still labels a non-launch selection", serviceAreasLabel(["chicago"]).includes("Chicago"))
ok("MAX_SERVICE_AREAS unchanged at 5", MAX_SERVICE_AREAS === 5)

console.log("\nthe launch config is the ONE rule (no duplicated market metadata):")
{
  // A launch market must carry its catalog metadata by reference — same object —
  // so a label/centre/bounds edit can never apply to one list and not the other.
  const austinCatalog = MARKETS.find((m) => m.slug === "austin") as Market
  const austinLaunch = LAUNCH_MARKETS.find((m) => m.slug === "austin") as Market
  ok("a launch market IS its catalog entry, not a copy", austinCatalog === austinLaunch)
  ok("it carries the full metadata (neighborhoods, theme)",
    austinLaunch.neighborhoods.length > 0 && austinLaunch.defaultTheme === austinCatalog.defaultTheme)
}

console.log(`\nLaunch config: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
