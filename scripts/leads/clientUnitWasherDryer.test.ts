/**
 * THIS CLIENT'S UNIT — WASHER & DRYER, and the line between it and Property Intelligence.
 *
 *   npx tsx scripts/leads/clientUnitWasherDryer.test.ts
 *
 * Two facts that look alike and must never merge:
 *
 *   property_catalog.washer_dryer_included/_connections   what the BUILDING offers — admin-only,
 *                                                         written through requirePlatformAdmin
 *   lead_property_reasons.washer_dryer_status             what a locator CONFIRMED for ONE
 *                                                         client's unit — the client's badge
 *
 * What is worth proving is not that the dropdown renders, but that the separation holds: that a
 * non-admin never reaches the admin route, that one save cannot silently stand in for the other,
 * that a failure in either is never reported as success, and that the client-facing card did not
 * move a pixel.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { WASHER_DRYER_LABEL, WASHER_DRYER_OPTIONS, asWasherDryerStatus } from "@/lib/leads/washerDryer"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const FIELD = read("components/crm/ClientUnitWasherDryer.tsx")
const PPE = read("components/crm/PropertyPricingEditor.tsx")
const CARD = read("components/crm/BestMatches.tsx")
const ROUTE = read("app/api/admin/owner/property-pricing/route.ts")
const EDITOR = read("components/crm/ReasonsControl.tsx")

// ── 1. THE VOCABULARY ─────────────────────────────────────────────────────────────────────────
console.log("only two labels are ever confirmed:")
ok("Included", WASHER_DRYER_LABEL.included === "Washer & Dryer Included")
ok("Hookups", WASHER_DRYER_LABEL.hookups === "Washer & Dryer Hookups")
ok("…and nothing else exists", Object.keys(WASHER_DRYER_LABEL).length === 2)
ok("the picker offers exactly those two plus Not verified", WASHER_DRYER_OPTIONS.length === 3)
ok("…and the default clears the value", WASHER_DRYER_OPTIONS[0].value === "" && /not verified/i.test(WASHER_DRYER_OPTIONS[0].label))

console.log("\nUNKNOWN IS NEVER A CONFIRMED FEATURE:")
for (const v of ["", null, undefined, "unknown", "yes", "Included", "select units", "included "]) {
  const got = asWasherDryerStatus(v)
  const expect = v === "included" || v === "hookups" ? v : null
  ok(`${JSON.stringify(v)} → ${got === null ? "not verified" : got}`, got === expect)
}
ok("only the two exact values pass", asWasherDryerStatus("included") === "included" && asWasherDryerStatus("hookups") === "hookups")

// ── 2. NEVER DERIVED FROM THE PROPERTY ────────────────────────────────────────────────────────
console.log("\nthe per-client value is never prefilled from the property-wide one:")
ok("the editor seeds it from the PROP, not the catalog fetch", /setClientWd\(washerDryer\)/.test(PPE))
ok("…and never from a catalog field", !/setClientWd\((wdIncluded|wdConnections|d\.washerDryer)/.test(PPE))
ok("the catalog value appears only as read-only context", /propertyWide=\{CATALOG_WD_INCLUDED_OPTIONS/.test(PPE))
ok("…and the context prop cannot become a value", !/value=\{propertyWide/.test(FIELD))
ok("the standalone control reads no catalog field at all", !/washer_dryer_included|washerDryerIncluded|CATALOG_WD/.test(FIELD))

// ── 3. THE ADMIN BOUNDARY ─────────────────────────────────────────────────────────────────────
console.log("\na non-admin cannot reach Property Intelligence:")
ok("the route still guards GET", /export async function GET[\s\S]{0,200}?requirePlatformAdmin\(\)/.test(ROUTE))
ok("…and PUT", /export async function PUT[\s\S]{0,200}?requirePlatformAdmin\(\)/.test(ROUTE))
ok("the standalone control performs no fetch", !/fetch\(/.test(FIELD))
ok("…and names no admin endpoint", !/property-pricing|\/api\/admin/.test(FIELD))
ok("the full editor renders only for canEditPricing", /canEditPricing && pricingPlaceId \?[\s\S]{0,200}?<PropertyPricingEditor/.test(CARD))
ok("…and the client-only control is the other branch", /: canConfirmWasherDryer \?[\s\S]{0,200}?<ClientUnitWasherDryer/.test(CARD))
ok("the two are mutually exclusive — one ternary, not two conditions",
  !/canEditPricing && pricingPlaceId && \(/.test(CARD))

console.log("\n…and hiding fields is NOT what authorizes it:")
{
  // The per-client write goes through the ordinary client connection, so RLS on
  // lead_property_reasons is the enforcement — the same policy governing reasons and favorites.
  const SAVE = read("lib/leads/propertyReasons.ts")
  ok("the save uses the RLS-bound client, not the service role", /from "@\/lib\/supabase\/client"/.test(SAVE) && !/supabaseAdmin/.test(SAVE))
  ok("…scoped to one lead and one property", /lead_id: leadId[\s\S]{0,120}?canonical_property_key: propertyKey/.test(SAVE))
  ok("…and it refuses to write without the pair", /refusing to save washer\/dryer: no canonical_property_key/.test(raw("lib/leads/propertyReasons.ts")))
  const DASH = read("components/crm/DashboardClient.tsx")
  ok("the handler scopes to the SELECTED lead", /handleSaveWasherDryer = async[\s\S]{0,200}?if \(!selectedLeadId\) return false/.test(DASH))
  ok("…and passes that lead id to the write", /saveWasherDryer\(selectedLeadId, canonicalPropertyKey, next\)/.test(DASH))
}

// ── 4. SAVING: TWO DESTINATIONS ───────────────────────────────────────────────────────────────
console.log("\na W/D-only change saves without touching property-wide values:")
ok("the guard accepts a lone per-client change", /if \(!anyProperty && !clientWdChanged\)/.test(PPE))
ok("…and that path never calls the admin route", /if \(!anyProperty\) \{[\s\S]{0,400}?onSaveWasherDryer!\([\s\S]{0,200}?return\n/.test(PPE))
ok("…returning before the fetch", PPE.indexOf("if (!anyProperty) {") < PPE.indexOf("const res = await fetch(ENDPOINT"))
ok("the property body is unchanged by the per-client field",
  !/body\.(clientWd|washerDryerStatus)|body\[.clientWd/.test(PPE))

console.log("\nboth kinds of change go to their own destination:")
ok("property-wide still PUTs the admin endpoint", /method: "PUT"/.test(PPE) && /ENDPOINT = "\/api\/admin\/owner\/property-pricing"/.test(PPE))
ok("…and the per-client write runs after it", PPE.indexOf("const res = await fetch(ENDPOINT") < PPE.indexOf("if (clientWdChanged)"))
ok("the per-client write uses the caller's handler", /onSaveWasherDryer!\(canonicalPropertyKey!, clientWd\)/.test(PPE))

console.log("\na partial failure is never reported as success:")
ok("a failed per-client write sets an error", /if \(!okClient\) \{[\s\S]{0,200}?setError/.test(PPE))
ok("…says WHICH half did not save", /Property details saved, but this client's washer\/dryer didn't save/.test(raw("components/crm/PropertyPricingEditor.tsx")))
ok("…clears any success note", /setNote\(null\)[\s\S]{0,120}?setError\("Property details saved/.test(PPE))
ok("…and leaves the editor open to retry", /setError\("Property details saved[\s\S]{0,120}?return/.test(PPE))
ok("the standalone control reports its own failure", /if \(!ok\) \{ setError/.test(FIELD))

console.log("\nunchanged means NO WRITE:")
ok("the standalone control compares against the saved value", /if \(draft === value\) \{ setOpen\(false\); return \}/.test(FIELD))
ok("the editor only writes when it actually changed", /clientWdChanged = canClientWd && clientWd !== washerDryer/.test(PPE))
ok("…and re-seeds on open so a cancel cannot leak", /setDraft\(value\)/.test(FIELD))

// ── 5. THE REASONS EDITOR STAYS THREE SLOTS ───────────────────────────────────────────────────
console.log("\nW/D is NOT a fourth field in \"Why I chose this for you\":")
ok("no W/D vocabulary in the reasons editor", !/WASHER_DRYER|washerDryer|asWasherDryerStatus/.test(EDITOR))
ok("…and no W/D handler reaches it", !/ReasonsControl[\s\S]{0,900}?onSaveWasherDryer/.test(CARD))

// ── 6. THE CLIENT-FACING CARD DID NOT MOVE ────────────────────────────────────────────────────
console.log("\nthe client-facing card is untouched:")
{
  const LIST = raw("app/locator-beast/r/[token]/RecommendationList.tsx")
  ok("the badge still renders from the frozen snapshot field", /washerDryerLabel\(p\.washerDryer\)/.test(LIST))
  ok("…with its own pill class", /washerDryerPillClass\(p\.washerDryer\)/.test(LIST))
  ok("…and renders NOTHING when not verified", /\{washerDryerLabel\(p\.washerDryer\) && \(/.test(LIST))
  const PAGE = raw("app/locator-beast/r/[token]/page.tsx")
  ok("the pill's styling is unchanged", /\.lbr-wd\{display:inline-flex;align-self:flex-start/.test(PAGE))
  ok("…including both variants", /\.lbr-wd--inc\{background:var\(--pill-bg\)/.test(PAGE) && /\.lbr-wd--hk\{/.test(PAGE))
  ok("…and the mobile override", /\.lbr-wd\{font-size:15px;padding:5px 13px;margin-top:12px\}/.test(PAGE))
}

console.log(`\nClient unit washer/dryer: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
