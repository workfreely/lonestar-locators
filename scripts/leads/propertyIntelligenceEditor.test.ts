/**
 * Property Intelligence editor — the editor and route contract.
 *
 *   npx tsx scripts/leads/propertyIntelligenceEditor.test.ts
 *
 * Source assertions, with comments stripped once before matching so nothing can pass on the
 * strength of a comment that merely mentions the thing. Plus live unit coverage of
 * commissionToInput, which is the function that decides whether a stored null is shown to the
 * owner as blank (unknown) or as 0 (a claim nobody made).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { commissionToInput } from "@/components/crm/PropertyPricingEditor"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`)

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))
const ed = read("components/crm/PropertyPricingEditor.tsx")
const route = read("app/api/admin/owner/property-pricing/route.ts")

console.log("\n=== 1. THE OPENING GLITCH — no flash, no stale values ===")
{
  ok("loading STARTS true, so the form never renders before the fetch",
    /const \[loading, setLoading\] = useState\(true\)/.test(ed), "loading still starts false")
  ok("every pricing field is blanked before the fetch",
    /setOnebr\(""\); setTwobr\(""\); setThreebr\(""\)/.test(ed))
  ok("every commission field is blanked too",
    /setSend\(""\); setEscort\(""\); setBonus\(""\)/.test(ed))
  ok("the address is blanked", /setAddress\(null\)/.test(ed))
  ok("the blanking happens inside the open effect, before the request",
    ed.indexOf('setOnebr("")') < ed.indexOf("await fetch(`${ENDPOINT}"))
  ok("values are re-read on EVERY open, keyed on the property",
    /\}, \[open, placeId\]\)/.test(ed))
}

console.log("\n=== 2. TITLE, NAME AND VERIFIED ADDRESS ===")
{
  ok('title reads "Property Intelligence"', ed.includes(">Property Intelligence<"))
  ok("the old title is gone", !/>Property pricing</.test(ed))
  ok("the property name renders", /\{propertyName \?\? "This property"\}/.test(ed))
  ok("the address renders only when present", /\{address && <p/.test(ed), "address is rendered unconditionally")
  ok("the route builds the address from catalog columns",
    /address, city, state, zip/.test(route))
  ok("a missing street line yields null, never an invented address",
    /const fullAddress = street \? \(locality \? .* : street\) : null/.test(route))
}

console.log("\n=== 3. WIDTH AND VIEWPORT CLAMP ===")
{
  ok("475px wide", ed.includes("max-w-[475px]"))
  ok("380px is gone", !ed.includes("max-w-[380px]"))
  ok("offset right only where there is room (lg and up)", ed.includes("lg:translate-x-[48px]"))
  ok("still clamped to the viewport", ed.includes("max-h-[calc(100vh-2rem)]") && ed.includes("overflow-y-auto"))
}

console.log("\n=== 4. PRICING IS PRESERVED ===")
{
  ok("three rent inputs", /\["1BR", onebr, setOnebr\], \["2BR", twobr, setTwobr\], \["3BR", threebr, setThreebr\]/.test(ed))
  ok("current special kept", ed.includes("body.currentSpecial = special.trim()"))
  ok("pricing source kept", ed.includes("body.pricingSource = source.trim()"))
  ok("the shared date picker is still used", ed.includes("<DateTimePicker") && /dateOnly/.test(ed))
  ok("no native date input crept back", !/type=["']date["']/.test(ed))
  ok("blank rents are still omitted, never cleared", ed.includes("if (onebr.trim()) body.onebr = onebr.trim()"))
  ok("the route still refuses to null a stored price", /if \(rent === null\) continue/.test(route))
  ok("the pricing freshness stamp fires only for PRICING", /if \(touchedPricing\) add\("pricing_last_verified"/.test(route))
}

console.log("\n=== 5. COMMISSION SECTION ===")
{
  ok("three commission inputs in one row",
    /\["Send \(%\)", send, setSend/.test(ed) && /\["Escort \(%\)", escort, setEscort/.test(ed) && /\["Bonus \(\$\)", bonus, setBonus/.test(ed))
  ok("no commission-type selector", !/commissionType|<select/.test(ed))
  ok("marked internal only", ed.includes("Internal only"))
  ok("change-tracking decides what is sent",
    /const changed = \(now: string, before: string\) => now\.trim\(\) !== before\.trim\(\)/.test(ed) &&
    /if \(!changed\(now, before\)\) return/.test(ed))
  ok("a cleared field is sent as NULL, an edited one as its value",
    /body\[key\] = now\.trim\(\) === "" \? null : now\.trim\(\)/.test(ed))
  ok("all three commission fields go through the same commit",
    /commit\("sendCommission", send/.test(ed) && /commit\("escortCommission", escort/.test(ed) && /commit\("bonusFlat", bonus/.test(ed))
  ok("the save guard uses `in`, so an explicit null still counts as a save",
    /"sendCommission" in body \|\| "escortCommission" in body \|\| "bonusFlat" in body/.test(ed))
  ok("the route turns an explicit null into an ownerClear candidate",
    /if \(raw === null\) \{[\s\S]{0,320}ownerClear: true/.test(route))
  ok("…and still skips a blank string rather than clearing", /if \(t === ""\) continue/.test(route))
  ok("the route skips a blank rather than writing 0", /if \(t === ""\) continue/.test(route))
  ok("rates are stored with a %, the bonus bare",
    /column === "bonus_flat" \? String\(Math\.round\(n\)\) : `\$\{Math\.round\(n\)\}%`/.test(route))
  ok("the route never defaults a commission to zero", !/sendCommission\s*\?\?\s*0|\|\|\s*"0%"/.test(route))
}

console.log("\n=== 6. commissionToInput — unknown stays blank, zero stays zero ===")
{
  eq("null → ''", commissionToInput(null), "")
  eq("undefined → ''", commissionToInput(undefined), "")
  eq("'' → ''", commissionToInput(""), "")
  eq("'   ' → ''", commissionToInput("   "), "")
  eq("'0%' → '0'", commissionToInput("0%"), "0")
  eq("'$0' → '0'", commissionToInput("$0"), "0")
  eq("'100%' → '100'", commissionToInput("100%"), "100")
  eq("'500' → '500'", commissionToInput("500"), "500")
  eq("'1,250' → '1250'", commissionToInput("1,250"), "1250")
  // A legacy value we cannot parse is shown AS IS rather than blanked, so opening the editor
  // cannot silently discard a rate it did not understand.
  eq("'1 month' survives verbatim", commissionToInput("1 month"), "1 month")
  eq("'No' survives verbatim", commissionToInput("No"), "No")
  ok("an unknown NEVER becomes '0'", commissionToInput(null) !== "0" && commissionToInput("") !== "0")
}

console.log("\n=== 7. AUTHORIZATION — the server decides, independently ===")
{
  ok("both verbs re-check requirePlatformAdmin", (route.match(/requirePlatformAdmin\(\)/g) ?? []).length >= 2)
  ok("ownerAuthorized is set by the ROUTE, after the guard", /ownerAuthorized: true/.test(route))
  ok("…and it is never read from the body", !/body\.ownerAuthorized|b\.ownerAuthorized/.test(route))
  ok("the route never updates property_catalog directly",
    !/from\("property_catalog"\)[\s\S]{0,80}\.update\(/.test(route))
  ok("every write goes through the canonical writer", route.includes("enrichProperty("))
}

console.log("\n=== 8. COMMISSION STAYS INTERNAL ===")
{
  // The client resolver is a different function and must carry no commission. Asserted against
  // the migration that defines it, not against prose.
  const clientResolver = read("supabase/migrations/20260923000005_recommendation_canonical_special.sql")
  ok("the client recommendation resolver carries no commission",
    !/send_commission|escort_commission|bonus_flat/.test(clientResolver))
  const rPage = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  ok("the client /r page renders no commission", !/commission/i.test(rPage))
  ok("composePost never sees commission",
    !/commission/i.test(read("lib/social/composePost.ts")))
}

console.log("\n=== 9. THE FOUR OUTCOMES, simulated exactly as the editor builds the body ===")
{
  // The real logic, reproduced verbatim from the editor so the table below is the behaviour and
  // not a description of it.
  const changed = (now: string, before: string) => now.trim() !== before.trim()
  const buildBody = (fields: { now: string; before: string }[]) => {
    const body: Record<string, unknown> = {}
    const keys = ["sendCommission", "escortCommission", "bonusFlat"]
    fields.forEach(({ now, before }, i) => {
      if (!changed(now, before)) return
      body[keys[i]] = now.trim() === "" ? null : now.trim()
    })
    return body
  }
  const one = (now: string, before: string) => buildBody([{ now, before }])

  eq("UNTOUCHED populated ⇒ omitted", one("100", "100"), {})
  eq("UNTOUCHED legacy text ⇒ omitted", one("No", "No"), {})
  eq("UNTOUCHED blank ⇒ omitted (never sent as null)", one("", ""), {})
  eq("EDITED to a number ⇒ sent", one("125", "100"), { sendCommission: "125" })
  eq("EDITED to zero ⇒ sent as '0', a verified zero", one("0", "100"), { sendCommission: "0" })
  eq("ENTERED on a blank field ⇒ sent", one("75", ""), { sendCommission: "75" })
  eq("CLEARED a populated field ⇒ sent as null", one("", "100"), { sendCommission: null })
  eq("CLEARED a legacy value ⇒ sent as null", one("", "No"), { sendCommission: null })
  eq("CLEARED a verified zero ⇒ sent as null, not kept at 0", one("", "0"), { sendCommission: null })

  console.log("  — clearing one field leaves the others alone —")
  eq("clear send only",
    buildBody([{ now: "", before: "100" }, { now: "75", before: "75" }, { now: "500", before: "500" }]),
    { sendCommission: null })
  eq("clear escort only",
    buildBody([{ now: "100", before: "100" }, { now: "", before: "75" }, { now: "500", before: "500" }]),
    { escortCommission: null })
  eq("clear all three",
    buildBody([{ now: "", before: "100" }, { now: "", before: "75" }, { now: "", before: "500" }]),
    { sendCommission: null, escortCommission: null, bonusFlat: null })
  ok("a body with only a clear is still a save",
    "sendCommission" in buildBody([{ now: "", before: "100" }]))
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
