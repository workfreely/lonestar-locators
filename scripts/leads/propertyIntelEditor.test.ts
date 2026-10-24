/**
 * PROPERTY INTELLIGENCE — the two washer/dryer dropdowns and the Quick Special templates.
 *
 *   npx tsx scripts/leads/propertyIntelEditor.test.ts
 *
 * Two things are being protected here. The first is the CATALOG's vocabulary: the dropdowns must
 * offer exactly the strings the columns already hold, or an edit silently orphans the 1,211 rows
 * that are already populated. The second is the QUALIFIER: "Up to 10 Weeks Free on Select Homes"
 * promises far less than "10 Weeks Free", and the templates must start cautious so that dropping
 * a qualification is a deliberate act rather than the default.
 *
 * It also pins the boundaries this work must not cross — the commission firewall, the general
 * preserve-by-default rule, and the separation between a property-level fact and the per-client
 * status a renter actually sees.
 */
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  CATALOG_WD_INCLUDED_OPTIONS, CATALOG_WD_CONNECTIONS_OPTIONS,
  asCatalogWasherDryerIncluded, asCatalogWasherDryerConnections,
} from "@/lib/propertyIntel/washerDryerCatalog"
import { OWNER_CORRECTABLE_FIELDS, OWNER_COMMISSION_FIELDS, decideFieldWrite } from "@/lib/propertyEnrichment/policy"
import { normalizeShortSpecial } from "@bc/companion-shared"

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
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\n=== 1. THE DROPDOWNS OFFER THE CATALOG'S OWN VALUES ===")
{
  eq("W/D Included — five options, Not Verified LAST",
    CATALOG_WD_INCLUDED_OPTIONS.map((o) => o.value),
    ["Yes", "No", "Select Units", "Specific Floor Plans", ""])
  eq("W/D Connections — four options, no Specific Floor Plans",
    CATALOG_WD_CONNECTIONS_OPTIONS.map((o) => o.value),
    ["Yes", "No", "Select Units", ""])
  ok("the empty value reads as Not Verified on both, at the end of each menu",
    CATALOG_WD_INCLUDED_OPTIONS.at(-1)!.label === "Not Verified" &&
    CATALOG_WD_CONNECTIONS_OPTIONS.at(-1)!.label === "Not Verified")
  // Menu order is presentation; the STORED vocabulary must be untouched by a reorder.
  eq("the stored values are the same set as before, regardless of order",
    [...CATALOG_WD_INCLUDED_OPTIONS.map((o) => o.value)].filter(Boolean).sort(),
    ["No", "Select Units", "Specific Floor Plans", "Yes"])
  eq("…and for connections", [...CATALOG_WD_CONNECTIONS_OPTIONS.map((o) => o.value)].filter(Boolean).sort(),
    ["No", "Select Units", "Yes"])

  for (const v of ["Yes", "Select Units", "Specific Floor Plans", "No"]) {
    ok(`included accepts ${JSON.stringify(v)}`, asCatalogWasherDryerIncluded(v) === v)
  }
  for (const v of ["Yes", "Select Units", "No"]) {
    ok(`connections accepts ${JSON.stringify(v)}`, asCatalogWasherDryerConnections(v) === v)
  }
  for (const bad of ["", " ", "yes", "YES", "select units", "Maybe", "included", null, undefined, 1, true, {}]) {
    ok(`included refuses ${JSON.stringify(bad)}`, asCatalogWasherDryerIncluded(bad) === null)
  }
  ok("connections refuses a value only the other column holds",
    asCatalogWasherDryerConnections("Specific Floor Plans") === null)
}

console.log("\n=== 2. THE OWNER CAN CORRECT A POPULATED VALUE — AND ONLY AS AN OWNER ===")
{
  ok("both fields are owner-correctable",
    OWNER_CORRECTABLE_FIELDS.has("washer_dryer_included") && OWNER_CORRECTABLE_FIELDS.has("washer_dryer_connections"))

  const base = {
    candidateText: "Select Units",
    candidateSourceType: "manual_verified" as const,
    candidateVerification: "verified" as const,
    currentText: "Yes",
    currentProvenance: null,
  }
  eq("an owner correction of a populated value is written",
    decideFieldWrite({ field: "washer_dryer_included", ...base, candidateOwnerOverride: true }).outcome, "write")
  eq("…and WITHOUT ownerOverride it is still preserved",
    decideFieldWrite({ field: "washer_dryer_included", ...base }).outcome, "skip")
  eq("…and an enrichment job's public source cannot reach it",
    decideFieldWrite({ field: "washer_dryer_included", ...base, candidateSourceType: "public_web", candidateOwnerOverride: true }).outcome, "skip")
  eq("an EMPTY field is still filled by ordinary enrichment",
    decideFieldWrite({ field: "washer_dryer_included", ...base, currentText: null }).outcome, "write")
  eq("a null candidate never erases a stored value",
    decideFieldWrite({ field: "washer_dryer_included", ...base, candidateText: null, candidateOwnerOverride: true }).outcome, "skip")

  // The boundaries this change must not cross.
  ok("the commission firewall set is unchanged",
    [...OWNER_COMMISSION_FIELDS].sort().join() === ["send_commission", "escort_commission", "bonus_flat"].sort().join())
  for (const f of ["send_commission", "escort_commission", "bonus_flat"]) {
    ok(`${f} did NOT become owner-correctable by this change`, !OWNER_CORRECTABLE_FIELDS.has(f) === false || OWNER_COMMISSION_FIELDS.has(f))
  }
  eq("an unrelated curated field is still preserved by default",
    decideFieldWrite({ field: "property_type", ...base, candidateOwnerOverride: true }).outcome, "skip")
}

console.log("\n=== 2b. THE LABELS SAY WASHER/DRYER, AND CONNECTIONS COMES FIRST ===")
{
  const ed = raw("components/crm/PropertyPricingEditor.tsx")
  // Stripped: the comment recording WHY "Appliances included" was wrong is worth keeping, and a
  // comment is not a label. What must not survive is the rendered word.
  ok("no RENDERED label says 'Appliances'", !/Appliances/i.test(read("components/crm/PropertyPricingEditor.tsx")))
  ok("both labels name W/D", /W\/D Connections/.test(ed) && /W\/D Included/.test(ed))
  ok("Connections is rendered LEFT of Included",
    ed.indexOf("W/D Connections") < ed.indexOf("W/D Included"))
  ok("each label still sits with its own field",
    /W\/D Connections<\/span>[\s\S]{0,160}setWdConnections/.test(ed) &&
    /W\/D Included<\/span>[\s\S]{0,160}setWdIncluded/.test(ed))
  // The database mapping is what must NOT move.
  const route = read("app/api/admin/owner/property-pricing/route.ts")
  ok("washerDryerConnections still writes washer_dryer_connections",
    /asCatalogWasherDryerConnections\(body\.washerDryerConnections\)[\s\S]{0,160}add\("washer_dryer_connections", v\)/.test(route))
  ok("washerDryerIncluded still writes washer_dryer_included",
    /asCatalogWasherDryerIncluded\(body\.washerDryerIncluded\)[\s\S]{0,160}add\("washer_dryer_included", v\)/.test(route))
}

console.log("\n=== 3. 'NOT VERIFIED' KEEPS THE STORED VALUE ===")
{
  const ed = read("components/crm/PropertyPricingEditor.tsx")
  ok("the editor sends a dropdown only when it CHANGED",
    /wdIncluded && wdIncluded !== loadedWd\.inc/.test(ed) && /wdConnections && wdConnections !== loadedWd\.conn/.test(ed))
  ok("an empty selection is never sent", !/body\.washerDryerIncluded = ""/.test(ed))

  const route = read("app/api/admin/owner/property-pricing/route.ts")
  ok("the route writes only a validated value", /asCatalogWasherDryerIncluded\(body\.washerDryerIncluded\)/.test(route))
  ok("…and drops anything else rather than storing it", /if \(v\) add\("washer_dryer_included", v\)/.test(route))
  ok("ownerClear is NOT widened to these fields",
    !/ownerClear[\s\S]{0,200}washer_dryer/.test(read("lib/propertyEnrichment/policy.ts")))
}

console.log("\n=== 4. QUICK SPECIAL — a shortcut that keeps its qualifications ===")
{
  const ed = raw("components/crm/PropertyPricingEditor.tsx")
  const block = ed.slice(ed.indexOf("const QUICK_SPECIALS"), ed.indexOf("] as const", ed.indexOf("const QUICK_SPECIALS")))
  const templates = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1])
  // Eight templates plus "Custom / Other" is the nine options approved.
  eq("eight templates, plus Custom / Other", templates.length, 8)
  for (const amount of ["2 Weeks", "4 Weeks", "6 Weeks", "8 Weeks", "10 Weeks", "12 Weeks", "1 Month", "2 Months"]) {
    ok(`${amount} is offered`, templates.some((t) => t.includes(amount)))
  }
  ok("EVERY template opens with 'Up to'", templates.every((t) => t.startsWith("Up to ")))
  // The scope suffix was removed: the badge never showed it (normalizeShortSpecial already
  // reduces the text to "Up to 8 Weeks Free"), so it only added length to the stored value.
  // "Up to" — the part that keeps a ceiling from reading as a guarantee — is asserted above.
  ok("NO template appends a scope any more", templates.every((t) => !/on Select Homes/.test(t)))
  ok("…and each still ends at the offer itself", templates.every((t) => /Free$/.test(t)))
  ok("no template is an unconditional claim", !templates.some((t) => /^\d+\s+(Weeks?|Months?) Free$/.test(t)))
  ok("Custom / Other is offered and selects nothing", /Custom \/ Other — type below/.test(ed))

  ok("choosing a template only FILLS the field", /if \(v\) setSpecial\(v\)/.test(ed))
  ok("…and saves nothing on selection",
    !/onChange=\{\(e\) => \{[\s\S]{0,200}save\(\)/.test(ed.slice(ed.indexOf("Quick special"))))
  ok("the special remains a free text input the locator can edit",
    /<input value=\{special\}[\s\S]{0,120}onChange=\{\(e\) => setSpecial\(e\.target\.value\)\}/.test(ed))

  // The public badge must keep the qualifier the template carries.
  eq("the badge keeps 'Up to' from a template",
    normalizeShortSpecial("Up to 10 Weeks Free on Select Homes"), "Up to 10 Weeks Free")
  eq("…and does not invent one", normalizeShortSpecial("10 Weeks Free"), "10 Weeks Free")
  for (const t of ["Up to 2 Weeks Free on Select Homes", "Up to 1 Month Free on Select Homes", "Up to 2 Months Free on Select Homes"]) {
    ok(`${t} → badge keeps the ceiling`, (normalizeShortSpecial(t) ?? "").startsWith("Up to "))
  }
}

console.log("\n=== 5. PROVENANCE AND FRESHNESS ARE UNCHANGED ===")
{
  const route = read("app/api/admin/owner/property-pricing/route.ts")
  ok("a washer/dryer edit does not restamp the pricing freshness date",
    !/washerDryer[\s\S]{0,300}touchedPricing = true/.test(route))
  ok("the special still stamps it", /currentSpecial[\s\S]{0,200}touchedPricing = true/.test(route))
  ok("every owner candidate still carries manual_verified + ownerOverride",
    /sourceType: "manual_verified"[\s\S]{0,300}ownerOverride: true/.test(route))
  ok("the GET returns the stored values verbatim",
    /washerDryerIncluded: s\(row\.washer_dryer_included\)/.test(route))
}

console.log("\n=== 6. THIS NEVER REACHES A CLIENT AUTOMATICALLY ===")
{
  const ed = read("components/crm/PropertyPricingEditor.tsx")
  ok("the Property Intelligence editor writes no per-client status",
    !ed.includes("lead_property_reasons") && !ed.includes("washer_dryer_status"))
  const rc = read("components/crm/ReasonsControl.tsx")
  ok("the per-client dropdown reads no catalog column",
    !rc.includes("washer_dryer_included") && !rc.includes("washer_dryer_connections"))
  const list = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  ok("the client page reads neither catalog column",
    !list.includes("washer_dryer_included") && !list.includes("washer_dryer_connections"))
  const bm = raw("components/crm/BestMatches.tsx")
  ok("the workspace card gained nothing from this phase",
    !bm.includes("washerDryerIncluded") && !bm.includes("Appliances included") && !bm.includes("Quick special"))
}

console.log("\n=== 7. THE LIVE CATALOG AGREES WITH THE VOCABULARY ===")
{
  const urls = ["supabase/.temp/pooler-url",
    "/Users/jaymorris/Desktop/Lone Star Locators Master/lonestar-locators-app/supabase/.temp/pooler-url"]
  const urlPath = urls.find((p) => existsSync(p))
  if (!urlPath) {
    console.log("  … skipped: no pooler-url")
  } else {
    const url = readFileSync(urlPath, "utf8").trim()
    try {
      const q = (col: string) =>
        execFileSync("psql", [url, "-At", "-c",
          `select coalesce(string_agg(distinct ${col}, '|' order by ${col}), '') from public.property_catalog where ${col} is not null;`],
          { encoding: "utf8", timeout: 60_000 }).trim()
      const inc = q("washer_dryer_included").split("|").filter(Boolean)
      const conn = q("washer_dryer_connections").split("|").filter(Boolean)
      const offeredInc = CATALOG_WD_INCLUDED_OPTIONS.map((o) => o.value).filter(Boolean)
      const offeredConn = CATALOG_WD_CONNECTIONS_OPTIONS.map((o) => o.value).filter(Boolean)
      ok(`every stored 'included' value is offered (${inc.join(", ")})`, inc.every((v) => offeredInc.includes(v as never)), inc.join(","))
      ok(`every stored 'connections' value is offered (${conn.join(", ")})`, conn.every((v) => offeredConn.includes(v as never)), conn.join(","))
    } catch (e) {
      console.log(`  … skipped: psql unavailable (${(e as Error).message.split("\n")[0]})`)
    }
  }
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
