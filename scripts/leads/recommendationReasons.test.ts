// "Why I chose this for you" — V1 generator rules + the manual editor.
//
// The section answers how a property matches THIS client. It is not a second
// marketing surface, which is why specials were removed: a real client's list had a
// card whose only "reason" was a truncated Look & Lease gift-card blurb.
//
// Run: npx tsx scripts/leads/recommendationReasons.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { collectRecommendationReasons, AUTO_REASON_LIMIT, MAX_REASONS } from "@bc/companion-shared"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const gen = strip(read("packages/companion-shared/src/recommendationReasons.ts"))
const dash = strip(read("components/crm/DashboardClient.tsx"))
const best = strip(read("components/crm/BestMatches.tsx"))
const clientList = strip(read("app/locator-beast/r/[token]/RecommendationList.tsx"))

console.log("SPECIALS ARE GONE from automatic reasons:")
ok("the collector's input type no longer accepts `special`", !/special\?:/.test(gen))
ok("no special branch remains in the body", !/e\.special/.test(gen))
{
  // The exact shape that produced the bad card: Map/Explorer, no area match, a special.
  const r = collectRecommendationReasons({ locationMatch: false } as never)
  ok("Map path with no area match → ZERO reasons (was a gift-card blurb)", r.length === 0)
}
ok("a special can no longer be smuggled in via an extra field",
  collectRecommendationReasons({ special: "Look & Lease $200 Gift Card" } as never).length === 0)
ok("DashboardClient stops passing special to the collector", (() => {
  const calls = dash.split("collectRecommendationReasons({").slice(1)
  return calls.length === 2 && calls.every((c) => !/special:/.test(c.slice(0, c.indexOf("})"))))
})())
ok("the card's own special field is still populated", /special: recSpecial/.test(dash))

console.log("\nAUTOMATIC generation is capped at 2, never padded:")
ok("AUTO_REASON_LIMIT is 2", AUTO_REASON_LIMIT === 2)
ok("MAX_REASONS (manual ceiling) is 3, mirroring the DB constraint", MAX_REASONS === 3)
{
  const all = collectRecommendationReasons({
    amenities: ["Washer/Dryer", "Private Yard"],
    locationMatch: true,
    budget: "Within budget",
    approvalReason: "Second chance",
  })
  ok("four eligible sources still yield only 2", all.length === 2)
  ok("priority order holds — amenities then location", /you wanted/.test(all[0]) && all[1] === "In your preferred area")
}
ok("one source yields exactly one (never padded to 2)",
  collectRecommendationReasons({ locationMatch: true }).length === 1)
ok("no evidence yields zero", collectRecommendationReasons({}).length === 0)
ok("empty amenity array is not a reason", collectRecommendationReasons({ amenities: [] }).length === 0)

console.log("\nNO FABRICATION — every reason needs real evidence:")
ok("blank/whitespace evidence is ignored",
  collectRecommendationReasons({ budget: "   ", approvalReason: "  ", amenities: ["", " "] }).length === 0)
ok("an unrecognised budget string is not turned into a reason",
  collectRecommendationReasons({ budget: "maybe affordable" }).length === 0)
ok("the generator still runs no LLM and reads no free text",
  !/locator_notes|notes|openai|anthropic|fetch\(/.test(gen))
ok("budget wording is only the two vetted forms",
  collectRecommendationReasons({ budget: "Within budget" })[0] === "Within your budget" &&
  collectRecommendationReasons({ budget: "Options within budget" })[0] === "Options within your budget")

console.log("\nMANUAL EDITOR — 0–3, saved to the existing row:")
ok("the control exists with the approved label", /Why I chose this · Edit/.test(best))
ok("it sits on the LEFT of the operational row (card's left edge)",
  /justify-between gap-2">[\s\S]{0,400}ReasonsControl/.test(best))
ok("the editor caps at MAX_REASONS", /draft\.length >= MAX_REASONS/.test(best) && /slice\(0, MAX_REASONS\)/.test(best))
ok("blank rows are dropped rather than saved as empty bullets",
  /draft\.map\(\(r\) => r\.trim\(\)\)\.filter\(Boolean\)/.test(best))
ok("zero reasons is a valid save (not blocked)", !/disabled=\{[^}]*draft\.length === 0/.test(best))
ok("it re-seeds from the saved value on open, so a cancel cannot leak",
  /setDraft\(reasons\.length \? reasons : \[""\]\)/.test(best))
ok("a failed save surfaces an error and keeps the editor open",
  /if \(!okSaved\) \{ setError/.test(best))
// The client card scales reasons UP to 18px on mobile; ~40 chars is the last width
// that stays on one line at 375px. 60 allowed a silent two-line wrap.
ok("input is capped at 40 chars so a fragment cannot wrap on mobile", /maxLength=\{40\}/.test(best))

console.log("\nPERSISTENCE — client-property specific, reuses the existing column:")
ok("writes lead_recommendations.reasons", /from\("lead_recommendations"\)\s*\.update\(\{ reasons \}\)/.test(dash))
ok("scoped to ONE recommendation row by id", /\.eq\("id", recommendationId\)/.test(dash))
ok("never writes a global property table",
  !/from\("property_catalog"\)[\s\S]{0,200}reasons/.test(dash))
ok("no second storage system was introduced",
  !/reasons_edited|reasons_generated|recommendation_reasons/.test(dash + best + gen))
ok("no Regenerate/Reset was added", !/Regenerate|Reset reasons/.test(best))
ok("the edit is mirrored locally so it survives without a refetch",
  /setLocalRecommendations\(\(prev: any\[\]\) =>[\s\S]{0,200}\{ \.\.\.row, reasons \}/.test(dash))

console.log("\nCLIENT-FACING page is untouched:")
ok("the section still renders directly under the Google rating",
  clientList.indexOf("lbr-rating") < clientList.indexOf("lbr-why"))
ok("zero reasons hides the section entirely", /\{reasons\.length > 0 && \(/.test(clientList))
ok("no edit control leaked onto the client page",
  !/Why I chose this · Edit/.test(clientList) && !/ReasonsControl/.test(clientList))
ok("the client card markup was not restyled",
  /lbr-why-lbl">Why I chose this for you<\/p>/.test(clientList))

console.log("\nSNAPSHOT boundary unchanged:")
{
  const prep = read("supabase/migrations/20260910000002_lb_prepare_client_share.sql")
  ok("prepare still fingerprints reasons, so an edit mints a NEW snapshot",
    /coalesce\(to_jsonb\(r\.reasons\), '\[\]'::jsonb\)::text/.test(prep))
  ok("already-SENT snapshots are never reused or altered", /s\.sent_at is null/.test(prep))
}

console.log(`\nRecommendation reasons: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
