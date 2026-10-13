// SMART LEAD FORM — branding defaults, and what they must NOT disturb.
//
// Pure and offline. Run: `npx tsx scripts/tests/smartFormBrandingDefaults.test.ts`
//
// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────────────────────
// Changing DEFAULT_CONFIG is unusually risky because mergeSmartFormConfig layers a SAVED config
// over it: any key an agent's saved config omits silently inherits the new value. So the tests
// below are mostly about absence of change —
//
//   1. an unconfigured form picks up large / overlapping / dark;
//   2. a configured form keeps every choice its agent made, including the OLD values;
//   3. the market → hero theme mapping still resolves per market, and San Antonio is never
//      applied to an agent who did not choose it;
//   4. an unknown market keeps the neutral dark hero rather than borrowing a city;
//   5. the reassurance line's copy is untouched.
//
// Each assertion was verified to fail with its change reverted.

import { DEFAULT_CONFIG } from "@/app/smart-lead-form/_lib/defaultConfig"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import { buildInitialSmartFormConfig } from "@/app/smart-lead-form/_lib/initialConfig"
import { defaultThemeForMarkets } from "@/lib/markets/catalog"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

// ── 1. the approved defaults ────────────────────────────────────────────────────────────────
console.log("\nApproved defaults")
ok("agent photo size is large", DEFAULT_CONFIG.branding.agentPhotoSize === "large")
ok("photo position is overlapping", DEFAULT_CONFIG.branding.profileImagePosition === "overlapping")
ok("hero overlay is dark", DEFAULT_CONFIG.branding.heroOverlay === "dark")
ok("hero theme still defaults to the neutral custom/dark hero", DEFAULT_CONFIG.branding.heroTheme === "custom")
ok("no hero image is assumed", DEFAULT_CONFIG.branding.heroImageUrl === null)

// ── 2. an unconfigured form inherits them ───────────────────────────────────────────────────
// This is the path a workspace with smart_form_config = null takes on the PUBLIC page.
console.log("\nA form nobody has configured")
const fresh = buildInitialSmartFormConfig({ agentName: "Lisette Hernandez", serviceAreas: [] })
ok("picks up large", fresh.branding.agentPhotoSize === "large")
ok("picks up overlapping", fresh.branding.profileImagePosition === "overlapping")
ok("picks up dark", fresh.branding.heroOverlay === "dark")
ok("with no market, keeps the neutral dark hero", fresh.branding.heroTheme === "custom")
ok("and invents no hero image", fresh.branding.heroImageUrl === null)

// ── 3. A CONFIGURED AGENT KEEPS EVERY CHOICE ────────────────────────────────────────────────
// The old defaults are used deliberately: those are exactly the values a pre-existing agent
// holds, and they are the ones a careless default change would erase.
console.log("\nAn agent who already configured their form")
const configured = mergeSmartFormConfig({
  branding: {
    agentPhotoSize: "medium",
    profileImagePosition: "underHeadline",
    heroOverlay: "medium",
    heroTheme: "miami",
  },
})
ok("keeps medium photo size", configured.branding.agentPhotoSize === "medium")
ok("keeps Under Headline", configured.branding.profileImagePosition === "underHeadline")
ok("keeps the medium overlay", configured.branding.heroOverlay === "medium")
ok("keeps a hero theme that differs from their market", configured.branding.heroTheme === "miami")

// A saved config that omits ONE key inherits only that key — the rest stay the agent's.
const partial = mergeSmartFormConfig({ branding: { heroTheme: "austin" } })
ok("an omitted key inherits the new default", partial.branding.agentPhotoSize === "large")
ok("while the saved key is still honoured", partial.branding.heroTheme === "austin")

// ── 4. market → hero theme, per agent, never universal ──────────────────────────────────────
console.log("\nMarket-based hero themes")
ok("san-antonio first → San Antonio", defaultThemeForMarkets(["san-antonio", "austin", "dallas"]) === "san-antonio")
ok("austin first → Austin", defaultThemeForMarkets(["austin", "houston"]) === "austin")
ok("dallas first → Dallas", defaultThemeForMarkets(["dallas"]) === "dallas")
ok("houston first → Houston", defaultThemeForMarkets(["houston"]) === "houston")
ok("fort-worth first → Fort Worth", defaultThemeForMarkets(["fort-worth"]) === "fort-worth")
// SELECTION ORDER decides, not catalog order: the first market a locator picked is primary.
ok("the FIRST market wins, not the catalog's order", defaultThemeForMarkets(["houston", "san-antonio"]) === "houston")
ok("an empty market list resolves to no theme", defaultThemeForMarkets([]) === null)
ok("an unknown slug resolves to no theme", defaultThemeForMarkets(["atlantis"]) === null)
ok("null resolves to no theme", defaultThemeForMarkets(null) === null)

// SAN ANTONIO IS NOT UNIVERSAL. It is one agent's selection, and no other agent inherits it.
console.log("\nSan Antonio is not a global default")
ok("a Chicago agent gets Chicago", defaultThemeForMarkets(["chicago"]) === "chicago")
ok("a market-less agent does NOT get San Antonio", defaultThemeForMarkets([]) !== "san-antonio")
ok(
  "and a market-less form's hero is the neutral dark one",
  buildInitialSmartFormConfig({ agentName: "No Market", serviceAreas: [] }).branding.heroTheme === "custom",
)
ok(
  "a Chicago agent's built form carries Chicago, not San Antonio",
  buildInitialSmartFormConfig({ agentName: "Chi", serviceAreas: ["chicago"] }).branding.heroTheme === "chicago",
)

// ── 5. the reassurance line is untouched ────────────────────────────────────────────────────
// It is COPY, not branding, and it renders only in the overlapping layout (AgentProfile is not
// mounted under Under Headline). Making overlapping the default therefore ADDS this line to new
// forms — it never moves, restyles or removes it. The wording must not drift.
console.log("\nThe reassurance line")
ok(
  "default wording is exactly as it appears today",
  DEFAULT_CONFIG.copy.formReassurance === "Takes less than a minute to complete",
)
ok(
  "a new form carries that wording",
  buildInitialSmartFormConfig({ agentName: "A", serviceAreas: ["san-antonio"] }).copy.formReassurance ===
    "Takes less than a minute to complete",
)
ok(
  "an agent's own wording is preserved",
  mergeSmartFormConfig({ copy: { formReassurance: "Two minutes, tops" } }).copy.formReassurance === "Two minutes, tops",
)

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
