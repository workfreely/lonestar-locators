// The commute reason — the rules that protect the locator's words, and the
// staleness rule that keeps this off the render path.
//
// Run: npx tsx scripts/leads/commuteReason.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { applyCommuteReason, commuteReasonText, isCommuteReason, needsCommute } from "@/lib/commute/commuteReason"
import { MAX_REASONS } from "@bc/companion-shared"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("COPY — the locator's own label, verbatim:")
ok("reads like the approved example", commuteReasonText(12, "Fort Sam") === "12 min to Fort Sam")
ok("the label is used exactly as saved, not re-derived",
  commuteReasonText(20, "Joint Base San Antonio: Fort Sam Houston") === "20 min to Joint Base San Antonio: Fort Sam Houston")
ok("a padded label is trimmed", commuteReasonText(9, "  Fort Sam  ") === "9 min to Fort Sam")

console.log("\nHIGHEST-PRIORITY automatic reason:")
{
  const r = applyCommuteReason(["In your preferred area"], 12, "Fort Sam")
  ok("a new commute reason goes FIRST", r.reasons[0] === "12 min to Fort Sam")
  ok("and the existing reason is kept, not replaced", r.reasons[1] === "In your preferred area")
  ok("outcome is reported as added", r.outcome === "added")
}
ok("on an empty list it is the only reason",
  applyCommuteReason([], 7, "Fort Sam").reasons.join("|") === "7 min to Fort Sam")

console.log("\nNEVER DUPLICATES — recomputing replaces in place:")
{
  const first = applyCommuteReason(["Within your budget"], 12, "Fort Sam").reasons
  const again = applyCommuteReason(first, 18, "Fort Sam")
  ok("a changed drive time REPLACES the old line", again.reasons.join("|") === "18 min to Fort Sam|Within your budget")
  ok("the array does not grow", again.reasons.length === first.length)
  ok("outcome is reported as updated", again.outcome === "updated")
}
{
  // The anchor was renamed "Joint Base San Antonio: Fort Sam Houston" → "Fort Sam".
  const renamed = applyCommuteReason(["12 min to Joint Base San Antonio: Fort Sam Houston"], 12, "Fort Sam")
  ok("a RENAMED anchor rewrites the old text instead of adding a second line",
    renamed.reasons.join("|") === "12 min to Fort Sam")
}
{
  const same = applyCommuteReason(["12 min to Fort Sam", "In your preferred area"], 12, "Fort Sam")
  ok("an unchanged recomputation is a no-op", same.outcome === "unchanged" && same.reasons.length === 2)
}
{
  // Replacement must not move the reason from wherever it currently sits.
  const r = applyCommuteReason(["Manual first", "12 min to Fort Sam"], 30, "Fort Sam")
  ok("replacement keeps its position, it does not jump to the front",
    r.reasons.join("|") === "Manual first|30 min to Fort Sam")
}

console.log("\nNEVER OVERWRITES A MANUAL REASON, NEVER EXCEEDS 3:")
{
  const full = ["Walk to the river", "Pet friendly", "Corner unit"]
  const r = applyCommuteReason(full, 12, "Fort Sam")
  ok("at the 3-reason limit the commute is SKIPPED", r.outcome === "skipped_at_limit")
  ok("and all three manual reasons survive untouched", r.reasons.join("|") === full.join("|"))
  ok("nothing is displaced to make room", r.reasons.length === 3)
}
{
  const two = ["Pet friendly", "Corner unit"]
  const r = applyCommuteReason(two, 12, "Fort Sam")
  ok("with room, it is added without dropping anything", r.reasons.length === 3 && two.every((x) => r.reasons.includes(x)))
  ok("the result never exceeds the DB check constraint", r.reasons.length <= MAX_REASONS)
}
{
  // Already at the cap but one of them IS the commute reason → replace, still 3.
  const r = applyCommuteReason(["12 min to Fort Sam", "Pet friendly", "Corner unit"], 25, "Fort Sam")
  ok("at the cap WITH a commute reason present it still updates", r.outcome === "updated")
  ok("and stays at exactly 3", r.reasons.length === 3)
}

console.log("\nRECOGNISING ITS OWN OUTPUT:")
ok("matches its own format", isCommuteReason("12 min to Fort Sam"))
ok("matches a longer variant", isCommuteReason("7 minutes to Lackland AFB"))
ok("does NOT match a hand-typed reason", !isCommuteReason("Minutes from downtown"))
ok("does NOT match a reason that merely mentions minutes", !isCommuteReason("Great location, 5 minutes away"))
ok("does NOT match an amenity reason", !isCommuteReason("Has the washer/dryer you wanted"))
ok("does NOT match the budget reason", !isCommuteReason("Within your budget"))

console.log("\nSTALENESS — recompute on ANCHOR CHANGE, never on a timer:")
const A = "ChIJ_anchor_A", B = "ChIJ_anchor_B"
ok("a pair with no row needs computing", needsCommute(undefined, A))
ok("a row with no minutes and no attempt needs computing",
  needsCommute({ commute_minutes: null, commute_anchor_place_id: A, commute_computed_at: null }, A))
ok("a CACHED row against the same anchor does NOT recompute",
  !needsCommute({ commute_minutes: 12, commute_anchor_place_id: A, commute_computed_at: "2026-09-30T00:00:00Z" }, A))
ok("a DIFFERENT anchor invalidates the cache",
  needsCommute({ commute_minutes: 12, commute_anchor_place_id: A, commute_computed_at: "2026-09-30T00:00:00Z" }, B))
// Without this, an unroutable property is re-sent to Google on every single call.
ok("an attempted-but-unroutable pair is NOT retried forever",
  !needsCommute({ commute_minutes: null, commute_anchor_place_id: A, commute_computed_at: "2026-09-30T00:00:00Z" }, A))
ok("but it IS retried once the anchor changes",
  needsCommute({ commute_minutes: null, commute_anchor_place_id: A, commute_computed_at: "2026-09-30T00:00:00Z" }, B))

console.log("\nARCHITECTURE — one store, server-side Routes, not on the render path:")
{
  const routes = strip(read("lib/commute/routes.ts"))
  const api = strip(read("app/api/admin/leads/commute/route.ts"))
  const ensure = strip(read("lib/commute/ensureCommute.ts"))
  const dash = strip(read("components/crm/DashboardClient.tsx"))

  ok("Routes is called with the SERVER key, never the browser key",
    /process\.env\.GOOGLE_PLACES_API_KEY/.test(routes) && !/NEXT_PUBLIC/.test(routes))
  ok("place ids on BOTH ends — never coordinates",
    /placeId: placeIdFromKey/.test(routes) && /placeId: anchorPlaceId/.test(routes) && !/latLng/.test(routes))
  ok("one batched matrix call, not one request per property", /computeRouteMatrix/.test(routes))
  ok("traffic-unaware, so a cached figure stays stable", /TRAFFIC_UNAWARE/.test(routes))
  ok("no Routes call leaked into the browser bundle",
    !/routes\.googleapis/.test(ensure) && !/routes\.googleapis/.test(dash))

  // The single most important storage rule: the commute lives on the SAME canonical
  // row as the reasons, which is what the share snapshot joins.
  ok("writes the canonical client-property table only",
    /from\("lead_property_reasons"\)/.test(api) && !/from\("lead_recommendations"\)[\s\S]{0,200}upsert/.test(api))
  {
    // The real risk is not a second TABLE (reading the columns here is correct) but
    // the manual editor's upsert silently blanking the cache. saveReasons must send
    // ONLY `reasons`, so editing "Why I chose this" preserves the computed minutes.
    const pr = strip(read("lib/leads/propertyReasons.ts"))
    const upsertArgs = pr.slice(pr.indexOf(".upsert("), pr.indexOf("onConflict"))
    ok("the manual editor's save writes no commute column, so it cannot blank the cache",
      !/commute_/.test(upsertArgs))
    ok("commute columns are stored on the canonical row and nowhere else",
      !/commute_minutes/.test(strip(read("components/crm/ReasonsControl.tsx"))) &&
      !/commute_minutes/.test(strip(read("components/crm/BestMatches.tsx"))) &&
      !/commute_minutes/.test(strip(read("components/crm/LeadFavorites.tsx"))))
  }
  ok("keyed by the client-property PAIR", /onConflict: "lead_id,canonical_property_key"/.test(api))
  ok("only 'pid:' keys reach Routes (a url: key would fail the whole batch)",
    /startsWith\("pid:"\)/.test(api))
  ok("recomputes ONLY stale pairs", /needsCommute/.test(api) && /stale\.length === 0/.test(api))
  ok("an unroutable property stores no invented reason", /minutes == null/.test(api))
  ok("the caller's own session is used, so RLS and the ownership trigger apply",
    /@\/lib\/supabase\/server/.test(api) && !/supabaseAdmin/.test(api))

  // Triggered by EVENTS, never from a render.
  ok("triggered on client open", /mergeCommuteRows\(id, active\)/.test(dash))
  ok("triggered after the destination is saved", /void mergeCommuteRows\(updated\.id\)/.test(dash))
  ok("triggered after a property is added", /void mergeCommuteRows\(lead\.id\)/.test(dash))
}

console.log(`\nCommute reason: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
