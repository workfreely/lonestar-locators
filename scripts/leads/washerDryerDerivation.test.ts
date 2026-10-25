/**
 * PROPERTY INTELLIGENCE → the client's washer/dryer badge, where it conclusively applies.
 *
 *   npx tsx scripts/leads/washerDryerDerivation.test.ts
 *
 * The derivation exists to stop agents retyping a verified fact. What is worth proving is the
 * other half: that it stays silent everywhere the data does NOT settle the question, that it can
 * never overrule a person, and that running it twice writes nothing the second time — because
 * the share's reuse hash reads the column it writes.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  deriveWasherDryer, resolveWithOverride, shouldPersistDerived,
} from "@/lib/propertyIntel/washerDryerResolver"
import { planWasherDryerBackfill } from "@/lib/clientShare/washerDryerBackfill"
import { WASHER_DRYER_LABEL } from "@/lib/leads/washerDryer"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

// ── 1. THE TWO CONCLUSIVE READINGS ────────────────────────────────────────────────────────────
console.log("conclusive · Included:")
for (const conn of ["Yes", "No", "Select Units", null, undefined, ""]) {
  const d = deriveWasherDryer("Yes", conn)
  ok(`included=Yes, connections=${JSON.stringify(conn)} → included`, d.status === "included" && d.conclusive)
}
ok("…and it says why", /W\/D Included = Yes/.test(deriveWasherDryer("Yes", null).basis))

console.log("\nconclusive · Hookups — ONLY when included is a verified No:")
{
  const d = deriveWasherDryer("No", "Yes")
  ok("included=No + connections=Yes → hookups", d.status === "hookups" && d.conclusive)
  ok("…and it says why", /Included = No, Connections = Yes/.test(d.basis))
}

// ── 2. EVERYTHING ELSE STAYS SILENT ───────────────────────────────────────────────────────────
console.log("\nNOT conclusive — the badge stays off and a person still decides:")
for (const [inc, conn, why] of [
  ["Select Units", "Yes", "select units, even with connections"],
  ["Select Units", null, "select units"],
  ["Specific Floor Plans", "Yes", "specific floor plans"],
  ["Specific Floor Plans", null, "specific floor plans alone"],
  [null, "Yes", "connections only — included unknown (266 live properties)"],
  [null, "Select Units", "connections in select units"],
  ["No", "Select Units", "no included, connections in select units"],
  ["No", null, "nothing included, no connections — nothing to show"],
  [null, null, "nothing stored at all"],
  ["", "", "blank strings"],
  ["yes", "yes", "lowercase is not the stored vocabulary"],
  ["Maybe", "Sometimes", "values outside the vocabulary"],
  [true, 1, "non-strings"],
] as const) {
  const d = deriveWasherDryer(inc, conn)
  ok(`${why} → no badge`, d.status === null && !d.conclusive)
}
ok("an unreadable value is treated as blank, not compared as text",
  deriveWasherDryer("YES", null).status === null)
ok("…and the reason is recorded for each", deriveWasherDryer("Select Units", null).basis.includes("Select Units"))

// ── 3. A PERSON ALWAYS WINS ───────────────────────────────────────────────────────────────────
console.log("\na stored confirmation takes precedence over the catalog, always:")
{
  const r = resolveWithOverride("hookups", "Yes", "Yes")
  ok("manual hookups beats a conclusive Included", r.status === "hookups" && r.source === "manual")
  ok("…and the disagreement is REPORTED, not resolved", !!r.conflict && r.conflict.manual === "hookups" && r.conflict.derived === "included")
  ok("…with neither value altered", r.status === "hookups" && r.derivation.status === "included")
}
{
  const r = resolveWithOverride("included", "No", "Yes")
  ok("manual included beats a conclusive Hookups", r.status === "included" && !!r.conflict && r.conflict.derived === "hookups")
}
{
  const r = resolveWithOverride("included", "Yes", null)
  ok("agreement is not a conflict", r.status === "included" && r.source === "manual" && r.conflict === null)
}
{
  const r = resolveWithOverride("hookups", "Select Units", null)
  ok("a non-conclusive catalog never conflicts with a person", r.conflict === null && r.status === "hookups")
}
{
  const r = resolveWithOverride(null, "Yes", null)
  ok("an EMPTY pair takes the derivation", r.status === "included" && r.source === "derived")
}
{
  const r = resolveWithOverride(null, "Select Units", "Yes")
  ok("…but only when it is conclusive", r.status === null && r.source === "none")
}

console.log("\nonly an empty pair is ever written:")
ok("empty + conclusive → write", shouldPersistDerived(null, deriveWasherDryer("Yes", null)))
ok("empty + inconclusive → no write", !shouldPersistDerived(null, deriveWasherDryer("Select Units", null)))
ok("already set + conclusive AGREEING → no write", !shouldPersistDerived("included", deriveWasherDryer("Yes", null)))
ok("already set + conclusive DISAGREEING → no write", !shouldPersistDerived("hookups", deriveWasherDryer("Yes", null)))

// ── 4. THE SHARE-TIME PLAN ────────────────────────────────────────────────────────────────────
const cat = (rows: Record<string, [unknown, unknown]>) =>
  new Map(Object.entries(rows).map(([k, v]) => [k, { included: v[0], connections: v[1] }]))

console.log("\nthe share-prepare plan:")
{
  const pairs = [{ canonicalPropertyKey: "pid:A" }, { canonicalPropertyKey: "pid:B" }, { canonicalPropertyKey: "pid:C" }]
  const stored = new Map<string, "included" | "hookups" | null>([["pid:B", "hookups"]])
  const catalog = cat({ A: ["Yes", null], B: ["Yes", null], C: ["Select Units", null] })
  const plan = planWasherDryerBackfill(pairs, stored, catalog)
  ok("the empty + conclusive pair is filled", plan.filled.length === 1 && plan.filled[0].canonicalPropertyKey === "pid:A")
  ok("…with the derived status", plan.filled[0].status === "included")
  ok("the confirmed pair is left alone", !plan.filled.some((f) => f.canonicalPropertyKey === "pid:B"))
  ok("…and its disagreement is reported", plan.conflicts.length === 1 && plan.conflicts[0].canonicalPropertyKey === "pid:B")
  ok("the unit-specific pair is neither filled nor reported",
    !plan.filled.some((f) => f.canonicalPropertyKey === "pid:C") && !plan.conflicts.some((c) => c.canonicalPropertyKey === "pid:C"))
}
{
  const plan = planWasherDryerBackfill(
    [{ canonicalPropertyKey: "pid:A" }],
    new Map(),
    cat({}), // no catalog row at all
  )
  ok("a property with no catalog row is skipped", plan.filled.length === 0 && plan.conflicts.length === 0)
}
{
  const plan = planWasherDryerBackfill(
    [{ canonicalPropertyKey: "pid:A" }, { canonicalPropertyKey: "pid:A" }],
    new Map(),
    cat({ A: ["Yes", null] }),
  )
  ok("a duplicated pair yields ONE write, not two", plan.filled.length === 1)
}

console.log("\nSHARE-TIME IDEMPOTENCY — the second prepare writes nothing:")
{
  const pairs = [{ canonicalPropertyKey: "pid:A" }, { canonicalPropertyKey: "pid:B" }]
  const catalog = cat({ A: ["Yes", null], B: ["No", "Yes"] })

  const first = planWasherDryerBackfill(pairs, new Map(), catalog)
  ok("the first run fills both", first.filled.length === 2)

  // Exactly what the database would hold afterwards.
  const after = new Map<string, "included" | "hookups" | null>(first.filled.map((f) => [f.canonicalPropertyKey, f.status]))
  const second = planWasherDryerBackfill(pairs, after, catalog)
  ok("the second run fills NOTHING", second.filled.length === 0)
  ok("…and reports no conflict against its own writes", second.conflicts.length === 0)
  const third = planWasherDryerBackfill(pairs, after, catalog)
  ok("…and so does the third", third.filled.length === 0 && third.conflicts.length === 0)
}

console.log("\n…which is what keeps UNSENT SHARE REUSE working:")
{
  // The reuse hash includes coalesce(washer_dryer_status,''). A run that writes nothing cannot
  // move it, so an unsent snapshot is still matched and reused on a retry.
  const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261102000000_share_reuse_skips_completed.sql"), "utf8")
  ok("the reuse hash does read the column we write", /coalesce\(pr\.washer_dryer_status, ''\)/.test(SQL))
  const BF = read("lib/clientShare/washerDryerBackfill.ts")
  ok("so the writer returns early when there is nothing to fill", /if \(plan\.filled\.length === 0\) return plan/.test(BF))
  ok("…and reports whether it wrote at all", /wrote: true/.test(BF) && /wrote: false/.test(BF))
}

// ── 5. WHAT IT MUST NEVER TOUCH ───────────────────────────────────────────────────────────────
console.log("\nthe blast radius:")
{
  const BF = read("lib/clientShare/washerDryerBackfill.ts")
  ok("it writes exactly one table", (BF.match(/\.upsert\(/g) ?? []).length === 1 && /from\("lead_property_reasons"\)\.upsert/.test(BF))
  ok("…and exactly one column on it", /washer_dryer_status: f\.status/.test(BF) && !/reasons:|commute_minutes|avg_rent|sort_order/.test(BF))
  ok("it never writes property_catalog", !/property_catalog"\)\.(upsert|update|insert)/.test(BF))
  ok("it never touches a frozen snapshot", !/client_recommendation_share_items/.test(BF))
  ok("the pairs come from the CALLER's own read", /caller\.from\("lead_recommendations"\)/.test(BF))
  ok("…and the write goes back through the caller", /caller\.from\("lead_property_reasons"\)\.upsert/.test(BF))
  ok("only the catalog read uses the service role",
    /admin\s*\.from\("property_catalog"\)/.test(BF) && !/admin\s*\.from\("lead_/.test(BF))
  ok("a failure degrades to doing nothing", /catch \{\s*return EMPTY/.test(BF))

  const ROUTE = read("app/api/admin/client-shares/route.ts")
  ok("the backfill runs BEFORE the snapshot is prepared",
    ROUTE.indexOf("backfillDerivedWasherDryer") < ROUTE.indexOf('rpc("lb_prepare_client_share"'))
  ok("conflicts are logged for review", /washer\/dryer conflict lead=/.test(ROUTE))
  ok("…and returned, not acted on", /washerDryerConflicts: wd\.conflicts/.test(ROUTE))
}

// ── 6. THE CLIENT-FACING CARD IS UNTOUCHED ────────────────────────────────────────────────────
console.log("\nnothing about the client's card moved:")
{
  ok("the two labels are unchanged",
    WASHER_DRYER_LABEL.included === "Washer & Dryer Included" && WASHER_DRYER_LABEL.hookups === "Washer & Dryer Hookups")
  const LIST = readFileSync(join(process.cwd(), "app/locator-beast/r/[token]/RecommendationList.tsx"), "utf8")
  ok("the badge still reads the frozen snapshot field", /washerDryerLabel\(p\.washerDryer\)/.test(LIST))
  ok("…and nothing derives on the client page", !/deriveWasherDryer|washer_dryer_included|propertyIntel/.test(LIST))
  const PAGE = readFileSync(join(process.cwd(), "app/locator-beast/r/[token]/page.tsx"), "utf8")
  ok("the pill CSS is unchanged", /\.lbr-wd\{display:inline-flex;align-self:flex-start/.test(PAGE))
  ok("…including the mobile override", /\.lbr-wd\{font-size:15px;padding:5px 13px;margin-top:12px\}/.test(PAGE))
  const RESOLVER = read("lib/propertyIntel/washerDryerResolver.ts")
  ok("the resolver ships no client-page import", !/locator-beast|RecommendationList/.test(RESOLVER))
}

// ── 7. THE EDITOR STOPS ASKING TWICE ──────────────────────────────────────────────────────────
console.log("\nthe editor does not ask for what the property already proves:")
{
  const FIELD = read("components/crm/ClientUnitWasherDryer.tsx")
  ok("a conclusive derivation renders instead of a picker", /if \(!value && derived\?\.conclusive && derived\.status && !override\)/.test(FIELD))
  ok("…showing the client-facing label", /WASHER_DRYER_LABEL\[derived\.status\]/.test(FIELD))
  ok("…with its provenance", /derived\.basis/.test(FIELD))
  ok("…and a way to override it", /setOverride\(true\)/.test(FIELD))
  ok("a disagreement is shown, not silently resolved", /derived\.status !== value \? derived : null/.test(FIELD))
  const PPE = read("components/crm/PropertyPricingEditor.tsx")
  // From the pair the save WOULD leave behind — the loaded one while untouched, the menu's
  // canonical pair once changed — so an admin sees the consequence before committing it.
  ok("the editor derives from the pair the save would leave", /derived=\{deriveWasherDryer\(effectiveWd\.inc, effectiveWd\.conn\)\}/.test(PPE))
  ok("…and that pair is the loaded one until the menu is touched", /const effectiveWd = wdTouched/.test(PPE))
  ok("…and still never prefills the stored value from them", /setClientWd\(washerDryer\)/.test(PPE) && !/setClientWd\(derive/.test(PPE))
}

console.log(`\nWasher/dryer derivation: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
