// "Why I chose this for you" — V1 generator rules + the manual editor.
//
// The section answers how a property matches THIS client. It is not a second
// marketing surface, which is why specials were removed: a real client's list had a
// card whose only "reason" was a truncated Look & Lease gift-card blurb.
//
// Run: npx tsx scripts/leads/recommendationReasons.test.ts
import { readFileSync } from "node:fs"
import { join } from "node:path"
import path from "node:path"
import { collectRecommendationReasons, AUTO_REASON_LIMIT, MAX_REASONS } from "@bc/companion-shared"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const gen = strip(read("packages/companion-shared/src/recommendationReasons.ts"))
const dash = strip(read("components/crm/DashboardClient.tsx"))
const best = strip(read("components/crm/BestMatches.tsx"))
// The editor moved into its own component so Favorites and Recommendations share ONE
// implementation rather than two that could drift.
const ctrl = strip(read("components/crm/ReasonsControl.tsx"))
const favs = strip(read("components/crm/LeadFavorites.tsx"))
const canon = strip(read("lib/leads/propertyReasons.ts"))
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
ok("the control exists with the approved label", /Why I chose this · Edit/.test(ctrl))
// The reasons now own a FULL-WIDTH row of their own; the commission badge sits on the next
// row, right-aligned. They no longer share a justify-between row.
ok("the reasons get a full-width row", /<div className="mt-2 w-full">[\s\S]{0,600}ReasonsControl/.test(best))

// ── Readability + the commission badge's protected space ────────────────────
// Measured in a harness built from these exact class strings: BEFORE, the badge
// WRAPPED to two lines (30px tall) and its width varied 175/193/217px with the
// reason length. AFTER it is 19px tall and exactly 234.1px at every card width.
ok("the CONTROL text stays muted", /Why I chose this · Edit[\s\S]{0,40}<\/button>/.test(ctrl) &&
  /text-\[var\(--crm-text-muted\)\][\s\S]{0,400}Why I chose this · Edit/.test(ctrl))
ok("the saved REASON text uses the Google-rating colour, not the muted tone",
  /min-w-0 truncate text-\[10\.5px\] leading-\[1\.35\] text-\[var\(--crm-text-secondary\)\]/.test(ctrl))
ok("that is the same token the Google rating figure uses",
  /tabular-nums text-\[var\(--crm-text-secondary\)\]/.test(best))
// EACH reason is its own line now — joined into one ellipsed line, the amenities a locator
// picked by hand were always the part that fell off a narrow column. Every line still
// truncates individually, so one long reason cannot widen the card.
ok("each reason is its own line", /\{shown\.map\(\(line, i\) => \(/.test(ctrl))
ok("…and each still ellipses on its own", /truncate/.test(ctrl))
ok("the reasons half can shrink, so the ellipsis can engage",
  /flex min-w-0 flex-1 flex-col/.test(ctrl))
ok("…and no reason is dropped from the preview", !/shown\.slice\(/.test(ctrl))
// The three inline pills became the shared CommissionBadge, on its own row.
ok("the commission badge is the shared component on the bottom row",
  /<div className="mt-1\.5 flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-1">[\s\S]{0,260}?<CommissionBadge/.test(best))
ok("…and no inline commission pill is left in the card", !/bg-\[#(dff5e6|fdeaea|eef1f5)\]/.test(best))
// Truncation is VISUAL only: the joined string is ellipsed by CSS, so no reason is
// dropped, reordered, or preferentially shortened — the commute reason included.
ok("the display string is the reasons joined in their stored order",
  /reasons\.join\(" · "\)/.test(ctrl))
ok("no reason is sliced or filtered for display",
  !/reasons\.slice\(/.test(ctrl.split("if (!open)")[1] ?? ""))
ok("the editor still seeds from the FULL saved reasons",
  /setStructured\(parseReasons\(reasons\)\)/.test(ctrl))
// It no longer SLICES at MAX_REASONS — truncating silently deleted a line when a price pushed
// a legacy reason past the limit. The cap is now enforced by refusing the save and showing the
// locator exactly which lines would not be sent.
ok("the editor refuses to save past MAX_REASONS rather than truncating",
  !/slice\(0, MAX_REASONS\)/.test(ctrl) && /cleaned\.length > MAX_REASONS/.test(ctrl))
// There are no blank rows to drop any more — a slot with nothing in it emits no line at all.
ok("an empty slot emits no line", /if \(bp\) lines\.push\(bp\)/.test(
  readFileSync(join(process.cwd(), "lib/leads/structuredReasons.ts"), "utf8")))
ok("zero reasons is a valid save (not blocked)", !/disabled=\{[^}]*draft\.length === 0/.test(ctrl))
ok("it re-seeds from the saved value on open, so a cancel cannot leak",
  /setStructured\(parseReasons\(reasons\)\)/.test(ctrl))
ok("a failed save surfaces an error and keeps the editor open",
  /if \(!okSaved\) \{ setError/.test(ctrl))
// Free-text length no longer applies: the lines are GENERATED, so their length is bounded by
// the formats themselves rather than by a maxLength on an input nobody types into.
ok("reason text is generated, not typed", !/maxLength=\{40\}/.test(ctrl) && /formatBedroomPrice/.test(ctrl))

console.log("\nPERSISTENCE — client-property specific, reuses the existing column:")
ok("writes the CANONICAL client-property table", /from\("lead_property_reasons"\)/.test(canon) && /\.upsert\(/.test(canon))
ok("keyed by the client-property PAIR, never a collection row id",
  /onConflict: "lead_id,canonical_property_key"/.test(canon) && !/recommendationId/.test(canon))
ok("refuses to save without the canonical key", /refusing to save: no canonical_property_key/.test(canon))

console.log("\nONE live copy — both collections read and write the same row:")
ok("Recommendations reads the shared map", /reasonsByKey\?\.get\(String\(r\.canonical_property_key\)\)/.test(best))
ok("Favorites reads the SAME shared map", /reasonsByKey\?\.get\(String\(fav\.canonical_property_key\)\)/.test(favs))
ok("both call the same save handler", /onSaveReasons=\{handleSaveReasons\}/.test(dash) && (dash.match(/onSaveReasons=\{handleSaveReasons\}/g) ?? []).length === 2)
ok("Favorites uses the SAME editor component, not a second one",
  /import ReasonsControl from ".\/ReasonsControl"/.test(favs) && /import ReasonsControl from ".\/ReasonsControl"/.test(best))
ok("the map is keyed by property, so a deleted collection row cannot orphan it",
  /new Map\(prev\)\.set\(String\(canonicalPropertyKey\), next\)/.test(dash))
ok("never writes a global property table",
  !/from\("property_catalog"\)[\s\S]{0,200}reasons/.test(dash))
ok("no second storage system was introduced",
  !/reasons_edited|reasons_generated|recommendation_reasons/.test(dash + best + gen))
ok("no Regenerate/Reset was added", !/Regenerate|Reset reasons/.test(best))
// Mirrored into the CANONICAL map now, not into localRecommendations — the whole
// point is that the value no longer lives on the recommendation row.
ok("the edit is mirrored locally so it survives without a refetch",
  /setReasonsByKey\(\(prev\) => new Map\(prev\)\.set\(String\(canonicalPropertyKey\), next\)\)/.test(dash))

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

console.log("\nFAVORITES ACTION LAYOUT — one row for the actions, Commission beneath:")
{
  // The two actions used to STACK on a narrow Favorites column: Commission shared the
  // row via `justify-between` and was `flex-none`, so it never shrank and the
  // wrap-enabled action group gave way first. Commission now has its own row.
  // RAW source, not `favs` — `favs` is comment-stripped, and the region is anchored
  // on a comment marker, so slicing the stripped copy finds nothing.
  const favsRaw = read("components/crm/LeadFavorites.tsx")
  const row = favsRaw.slice(favsRaw.indexOf("Operational block, stacked"), favsRaw.indexOf('schedStep === "confirm"'))
  ok("the action group and Commission are no longer siblings in one justify-between row",
    !/flex items-center justify-between gap-2/.test(row))
  ok("the block stacks them instead", /<div className="space-y-2">/.test(row))
  ok("Send Guest Card and Schedule Tour share ONE flex row",
    /flex flex-wrap items-center gap-x-5 gap-y-1/.test(row))
  ok("…containing both actions and the divider between them",
    /Send Guest Card/.test(row) && /Schedule Tour/.test(row) && /h-3 w-px bg-\[var\(--crm-border\)\]/.test(row))
  // The brief said: allow wrapping ONLY on narrower widths — so flex-wrap stays.
  ok("wrapping is still permitted when the column is genuinely too narrow",
    /flex-wrap/.test(row))
  ok("Commission sits on its own row, right-aligned like the no-actions fallback",
    /<div className="flex items-center justify-end">\{favCommissionPill\}<\/div>/.test(row))
  ok("Commission is guarded, so a card without one renders no empty row",
    /\{favCommissionPill && \(/.test(row))
  // "Why I chose this" must remain its OWN row above the actions, not merge into them.
  ok("the reasons control is still a separate row above the actions",
    favsRaw.indexOf("<ReasonsControl") > 0
      && favsRaw.indexOf("<ReasonsControl") < favsRaw.indexOf("Operational block, stacked"))
}

console.log(`\nRecommendation reasons: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
