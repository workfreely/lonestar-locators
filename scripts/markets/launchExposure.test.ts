// PASS 2 — Texas-only user-facing market exposure.
//
// Proves the four locator/public surfaces now offer ONLY the launch set, that a
// legacy saved non-Texas slug is filtered out of display without the stored value
// being touched, and that internal resolution and the full registry are unchanged.
//
// The surfaces are React components with no test harness, so the data they map over
// is asserted directly (the exported helpers) plus a source-level check that each
// component actually consumes the launch helper rather than the unfiltered one.
// Both halves are mutation-tested.
//
// Run: npx tsx scripts/markets/launchExposure.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  MARKETS, SUPPORTED_STATES, SUPPORTED_MARKETS, marketsForState, marketsForSlugs,
  LAUNCH_MARKETS, LAUNCH_SUPPORTED_STATES, launchMarketsForState, launchMarketsForSlugs,
  stateForMarkets, defaultThemeForMarkets, resolveMapMarket, serviceAreasLabel,
} from "@/lib/markets/catalog"
import { MARKETS as FOOTER_MARKETS } from "@/app/locator-beast/_lib/site"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const LAUNCH_SLUGS = ["austin", "dallas", "fort-worth", "houston", "new-braunfels", "san-antonio", "san-marcos"]
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("the launch-filtered views:")
ok("LAUNCH_SUPPORTED_STATES is Texas alone", LAUNCH_SUPPORTED_STATES.length === 1 && LAUNCH_SUPPORTED_STATES[0].code === "TX" && LAUNCH_SUPPORTED_STATES[0].name === "Texas")
ok("launchMarketsForState('TX') is the 7 launch markets", launchMarketsForState("TX").map((m) => m.slug).join("|") === LAUNCH_SLUGS.join("|"))
for (const st of ["GA", "AZ", "FL", "IL", "CO", "TN"]) ok(`launchMarketsForState('${st}') is empty`, launchMarketsForState(st).length === 0)
ok("launchMarketsForState(null/unknown) is empty", launchMarketsForState(null).length === 0 && launchMarketsForState("CA").length === 0)

console.log("\nONBOARDING — state dropdown and market grid:")
{
  const src = strip(read("app/onboarding/_components/steps/StepBusinessProfile.tsx"))
  ok("state dropdown maps over LAUNCH_SUPPORTED_STATES", /\{LAUNCH_SUPPORTED_STATES\.map\(/.test(src))
  ok("it no longer maps over the unfiltered SUPPORTED_STATES", !/\{SUPPORTED_STATES\.map\(/.test(src))
  ok("market grid comes from launchMarketsForState", /launchMarketsForState\(licenseState\)/.test(src) && !/[^h]marketsForState\(licenseState\)/.test(src))
  ok("primary-market options come from launchMarketsForSlugs", /launchMarketsForSlugs\(selectedMarkets\)/.test(src))
  ok("shows exactly 1 state and 7 markets", LAUNCH_SUPPORTED_STATES.length === 1 && launchMarketsForState("TX").length === 7)
}

console.log("\nPROFILE — state dropdown and market grid:")
{
  const src = strip(read("components/crm/profile/ProfileClient.tsx"))
  ok("state options are filtered by isLaunchEnabledState", /filter\(\(\[code\]\) => isLaunchEnabledState\(code\)\)/.test(src))
  ok("market grid comes from launchMarketsForState", /launchMarketsForState\(licenseState\)/.test(src))
  ok("selected-market chips come from launchMarketsForSlugs", /launchMarketsForSlugs\(serviceAreas\)/.test(src))
  ok("the state-change handler keeps only launch markets", /launchMarketsForState\(next\)/.test(src))
  // A legacy saved state must still be RENDERED (disabled) rather than leaving a blank select.
  ok("a non-launch saved state renders as a disabled option", /!isLaunchEnabledState\(licenseState\)[\s\S]{0,180}disabled/.test(src))
}

console.log("\nFOOTER — public Supported Markets:")
ok("footer groups only Texas", FOOTER_MARKETS.length === 1 && FOOTER_MARKETS[0].state === "Texas")
ok("footer lists exactly the 7 launch cities",
  FOOTER_MARKETS[0].cities.join("|") === "Austin|Dallas|Fort Worth|Houston|New Braunfels|San Antonio|San Marcos")
ok("no non-Texas city is advertised",
  !FOOTER_MARKETS.some((g) => g.cities.some((c) => ["Atlanta", "Phoenix", "Tucson", "Miami", "Fort Lauderdale", "Orlando", "Chicago", "Denver", "Nashville"].includes(c))))

console.log("\nSMART LEAD FORM — public city list:")
{
  const src = strip(read("app/smart-lead-form/_components/form/sections/LeadFormFields.tsx"))
  ok("saved areas resolve through launchMarketsForSlugs", /launchMarketsForSlugs\(serviceAreaSlugs\)/.test(src))
  ok("the fallback is LAUNCH_MARKETS, never the full catalog",
    /savedLaunchMarkets\.length \? savedLaunchMarkets : LAUNCH_MARKETS/.test(src) && !/: MARKETS\b/.test(src))
  // The three cases the component must handle, asserted on the same helpers it calls.
  const resolve = (saved: string[] | null) => {
    const s = launchMarketsForSlugs(saved)
    return (s.length ? s : LAUNCH_MARKETS).map((m) => m.slug)
  }
  ok("no saved areas → the 7 launch markets", resolve(null).join("|") === LAUNCH_SLUGS.join("|") && resolve([]).join("|") === LAUNCH_SLUGS.join("|"))
  ok("saved launch areas → exactly those", resolve(["austin", "houston"]).join("|") === "austin|houston")
  ok("saved LEGACY non-Texas only → falls back to launch, never exposes it", resolve(["chicago"]).join("|") === LAUNCH_SLUGS.join("|"))
  ok("mixed saved → the launch ones only", resolve(["austin", "chicago"]).join("|") === "austin")
  ok("unknown slug never leaks", resolve(["mars"]).join("|") === LAUNCH_SLUGS.join("|"))
}

console.log("\nLEGACY SAVED VALUE — filtered from display, untouched in storage:")
{
  const saved = ["chicago"]
  ok("the stored array is not mutated by filtering", (launchMarketsForSlugs(saved), saved.join("|") === "chicago"))
  ok("launchMarketsForSlugs hides it", launchMarketsForSlugs(saved).length === 0)
  ok("marketsForSlugs still RESOLVES it — the truth of what is stored is preserved",
    marketsForSlugs(saved).length === 1 && marketsForSlugs(saved)[0].name === "Chicago")
  ok("Chicago is still a full member of the registry", MARKETS.some((m) => m.slug === "chicago" && m.state === "IL"))
}

console.log("\nINTERNAL RESOLUTION IS NOT NARROWED (why the launch views are separate exports):")
ok("stateForMarkets still backfills IL from a legacy selection", stateForMarkets(["chicago"]) === "IL")
ok("defaultThemeForMarkets still resolves a legacy selection", defaultThemeForMarkets(["chicago"]) !== null)
ok("serviceAreasLabel still states the truth of what is stored", serviceAreasLabel(["chicago"]).includes("Chicago"))
ok("resolveMapMarket still opens on a legacy saved market",
  resolveMapMarket({ serviceAreas: ["chicago"], primaryMarket: "chicago" }).slug === "chicago")
ok("marketsForState still returns non-launch states for internal/admin use",
  marketsForState("IL").length === 1 && marketsForState("FL").length === 3)
ok("SUPPORTED_STATES still lists all 7 for internal/admin use", SUPPORTED_STATES.length === 7)

console.log("\nREGISTRY UNTOUCHED:")
ok("still 16 markets", MARKETS.length === 16)
ok("SUPPORTED_MARKETS is still the FULL registry", SUPPORTED_MARKETS.length === 16)
ok("no slug renamed", MARKETS.map((m) => m.slug).join("|") ===
  "austin|dallas|fort-worth|houston|new-braunfels|san-antonio|san-marcos|atlanta|phoenix|tucson|miami|fort-lauderdale|orlando|chicago|denver|nashville")
ok("no label renamed", MARKETS.map((m) => m.name).join("|") ===
  "Austin|Dallas|Fort Worth|Houston|New Braunfels|San Antonio|San Marcos|Atlanta|Phoenix|Tucson|Miami|Fort Lauderdale|Orlando|Chicago|Denver|Nashville")

console.log("\nOUT OF SCOPE FOR PASS 2 — untouched:")
{
  const socialMarkets = strip(read("lib/social/markets.ts"))
  ok("Social Beast vocabulary unchanged", /SOCIAL_MARKETS: readonly string\[\] = \["Austin", "Dallas", "DFW", "Houston", "San Antonio"\]/.test(socialMarkets))
  const cat = strip(read("lib/markets/catalog.ts"))
  ok("no server-side enforcement added to the catalog", !/raise|reject|throw new Error/.test(cat))
  for (const f of ["middleware.ts", "lib/billing/access.ts"]) {
    ok(`${f} carries no launch-market logic`, !/isLaunchEnabledMarket|LAUNCH_MARKETS/.test(strip(read(f))))
  }
}

console.log(`\nLaunch exposure: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
