// LIBRARY ENRICHMENT — Building Types, Features Observed, and unused highlight slots.
//
// Run:  npx tsx scripts/social/enrichLibrary.ts            (PREVIEW)
//       npx tsx scripts/social/enrichLibrary.ts --apply
//
// ADDITIVE ONLY, AND LOUD ABOUT FAILURE. Every write is conditional on the value it read, and a
// write that matches zero or more than one row is reported as a failure and counted — the pilot's
// highlight writes updated zero rows and reported nothing, because an optimistic .eq() can never
// match a NULL column. Nothing here touches social_posts.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { BUILDING_TYPES } from "@/lib/social/buildingTypes"
import { BUILDING_TYPE_MANIFEST } from "./buildingTypeManifest"
import { mergeStableResearch } from "@/lib/social/mergeResearch"
import { AMENITY_BANK } from "@/lib/social/amenities"

const APPLY = process.argv.includes("--apply")

// ── RESEARCH PHRASE -> CANONICAL AMENITY ────────────────────────────────────────────────────
// Deliberately narrow. Each key is a phrase the research actually uses; anything unmatched is left
// out rather than approximated, which is why a property with rich research can still yield four
// features. "Pool" alone maps to nothing: Rooftop, Resort-Style and Infinity are three different
// claims and the bank has no plain Pool.
const FEATURE_MAP: [RegExp, string][] = [
  [/\bprivate (?:fenced )?yards?\b|\bfenced-in yards?\b|\bfully-fenced backyards?\b/i, "Private Yards"],
  [/\battached (?:two-car )?garages?\b/i, "Attached Garages"],
  [/\bdetached garages?\b/i, "Detached Garages"],
  [/\b(?:parking )?garage\b|\bgarage parking\b|\breserved garage\b/i, "Garage Parking"],
  [/\bfloor-to-ceiling windows?\b/i, "Floor-to-Ceiling Windows"],
  [/\bexposed concrete ceilings?\b/i, "Exposed Concrete Ceilings"],
  [/\bconcrete flooring\b|\bpolished concrete floors?\b/i, "Concrete Flooring"],
  [/\brooftop pool\b/i, "Rooftop Pool"],
  [/\bresort-(?:style|inspired) pool\b/i, "Resort-Style Pool"],
  [/\binfinity pool\b/i, "Infinity Pool"],
  [/\bstainless steel\b.*\bappliances?\b/i, "Stainless Steel Appliances"],
  [/\bquartz countertops?\b/i, "Quartz Countertops"],
  [/\bgranite countertops?\b/i, "Granite Countertops"],
  [/\bkitchen islands?\b/i, "Kitchen Islands"],
  [/\bwalk-in closets?\b/i, "Walk-In Closets"],
  [/\bev charging\b|\belectric (?:car |vehicle )?charg/i, "EV Charging"],
  [/\bdog park\b|\bpet park\b|\bdog run\b/i, "Dog Park"],
  [/\bpet spa\b|\bpet washing\b|\bpet grooming\b/i, "Pet Spa"],
  [/\bfitness (?:centre|center|studio)\b/i, "Fitness Center"],
  [/\byoga (?:studio|room)\b/i, "Yoga Studio"],
  [/\bco-?working\b/i, "Coworking Space"],
  [/\bbusiness (?:centre|center)\b/i, "Business Center"],
  [/\bclub ?room\b|\bclubhouse\b|\bresident lounge\b|\bsocial lounge\b/i, "Clubroom"],
  [/\bsky lounge\b|\bsky deck\b|\brooftop (?:deck|sundeck|terrace|lounge)\b|\bamenity deck\b/i, "Sky Lounge"],
  [/\bconcierge\b/i, "Concierge"],
  [/\bpackage lockers?\b|\bparcel pending\b/i, "Package Lockers"],
  [/\bcontrolled access\b|\blimited access gates\b/i, "Controlled Access"],
  [/\bgated community\b|\bdriving access gates\b|\bgated\b/i, "Gated Community"],
  [/\bdowntown views?\b/i, "Downtown Views"],
  [/\bskyline views?\b/i, "Skyline Views"],
  [/\blake views?\b/i, "Lake Views"],
  [/\bwasher and dryer\b|\bwashers? and dryers?\b|\bwasher\/dryer\b|\bw\/d\b/i, "Washer & Dryer Included"],
  [/\bsmart home\b|\bnest thermostat\b|\bkeyless (?:door )?entry\b/i, "Smart Home Features"],
  [/\bbuilt-in desks?\b/i, "Built-In Desks"],
  [/\bmud ?rooms?\b/i, "Mudrooms"],
  [/\bwine (?:fridge|refrigerator|storage)\b/i, "Wine Fridges"],
]
// A line carrying ANY of these describes some homes, not the property. It is dropped whole —
// "Washers and dryers included*" must never become a property-wide Washer & Dryer Included.
const QUALIFIED = /select\b|\*|asterisk|some (?:homes|units)\b|certain\b|rentable\b|paid add-on|upgrade only|hookups?\b|connections?\b/i

function featuresFrom(stable: Record<string, unknown>): { picked: string[]; dropped: string[] } {
  const src = [stable.interiorFeatures, stable.communityAmenities]
    .flatMap((v) => (Array.isArray(v) ? v : [])).map(String)
  const picked = new Set<string>(); const dropped: string[] = []
  for (const line of src) {
    if (QUALIFIED.test(line)) { dropped.push(line); continue }
    for (const [re, name] of FEATURE_MAP) if (re.test(line)) picked.add(name)
  }
  const out = [...picked].filter((f) => (AMENITY_BANK as readonly string[]).includes(f))
  return { picked: out, dropped }
}

function client(): SupabaseClient {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
}
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16)

/**
 * The ONLY features allowed to claim a highlight slot, strongest first.
 *
 * A HIGHLIGHT IS A REASON TO WATCH THE VIDEO, so the list stops at features that are genuinely
 * distinctive. Quartz countertops, stainless appliances, walk-in closets, smart thermostats and
 * garage parking are all verified on dozens of these properties and none of them sells anything —
 * they belong in Features Observed, which keeps every one of them.
 *
 * The cut matters: an earlier run offered Elev8 "Quartz Countertops" for its one free slot purely
 * because nothing better was left. That is filling a slot to reach three, which is the one thing
 * these slots must never be used for. Elev8 keeps the empty slot instead.
 */
const HIGHLIGHT_RANK = [
  "Infinity Pool", "Rooftop Pool", "Floor-to-Ceiling Windows", "Private Yards", "Skyline Views",
  "Downtown Views", "Lake Views", "Sky Lounge", "Resort-Style Pool", "Exposed Concrete Ceilings",
  "Attached Garages", "Washer & Dryer Included", "Concrete Flooring", "Wine Fridges", "Mudrooms",
]

async function main() {
  const sb = client()
  let wrote = 0, failed = 0
  const say = (s = "") => console.log(s)
  say(`\n${"=".repeat(88)}\nLIBRARY ENRICHMENT — ${APPLY ? "APPLY" : "PREVIEW"}\n${"=".repeat(88)}`)

  for (const e of BUILDING_TYPE_MANIFEST) {
    if (!(BUILDING_TYPES as readonly string[]).includes(e.type)) throw new Error(`REFUSED — ${e.property}: "${e.type}" is not one of the six`)
  }

  const { data: research } = await sb.from("social_property_research").select("place_id, property_name, stable")
  const { data: content } = await sb.from("social_content").select("id, owner_user_id, place_id, property_name, amenities")
  const { data: posts } = await sb.from("social_posts").select("id, source_content_id, status")
  const { data: obs } = await sb.from("social_property_observations").select("social_content_id, field")
  const postsBefore = (await sb.from("social_posts").select("*").order("id")).data

  const draftContent = new Set((posts ?? []).filter((p) => p.status === "draft").map((p) => p.source_content_id as string))
  const nonDraftContent = new Set((posts ?? []).filter((p) => p.status !== "draft").map((p) => p.source_content_id as string))
  const haveObs = new Map<string, Set<string>>()
  for (const o of obs ?? []) {
    const k = o.social_content_id as string
    if (!haveObs.has(k)) haveObs.set(k, new Set())
    haveObs.get(k)!.add(o.field as string)
  }
  const R = new Map((research ?? []).map((r) => [r.property_name as string, r]))

  // ── 1. BUILDING TYPES ─────────────────────────────────────────────────────────────────────
  say(`\n── Building Types ──`)
  let btWritten = 0, btSkipped = 0
  for (const e of BUILDING_TYPE_MANIFEST) {
    const r = R.get(e.property)
    if (!r) { say(`  ✗ ${e.property} — no research record`); failed++; continue }
    const stable = (r.stable ?? {}) as Record<string, unknown>
    if (stable.buildingType) { btSkipped++; continue }
    if (!APPLY) { btWritten++; continue }
    const next = mergeStableResearch(stable as never, { buildingType: e.type } as never)
    const { data: up, error } = await sb.from("social_property_research").update({ stable: next })
      .eq("place_id", r.place_id).select("place_id")
    if (error || (up ?? []).length !== 1) {
      say(`  ✗ ${e.property} — ${error?.message ?? `matched ${(up ?? []).length} rows`}`); failed++
    } else { btWritten++; wrote++ }
  }
  say(`  ${APPLY ? "wrote" : "would write"} ${btWritten} · already set ${btSkipped}`)

  // ── 2. FEATURES OBSERVED, per DRAFT video with none ───────────────────────────────────────
  say(`\n── Features Observed ──`)
  let fWritten = 0, fSkipped = 0, fNone = 0
  const dropSamples: string[] = []
  for (const c of content ?? []) {
    if (!draftContent.has(c.id as string)) continue
    if (nonDraftContent.has(c.id as string)) { fSkipped++; continue } // shared with a published/ready post
    if ((haveObs.get(c.id as string) ?? new Set()).has("observed_features")) { fSkipped++; continue }
    const r = (research ?? []).find((x) => x.place_id === c.place_id)
    if (!r) { fNone++; continue }
    const stable = (r.stable ?? {}) as Record<string, unknown>
    const { picked, dropped } = featuresFrom(stable)
    if (dropSamples.length < 3 && dropped.length) dropSamples.push(`${c.property_name}: "${dropped[0].slice(0, 70)}"`)
    if (picked.length === 0) { fNone++; continue }
    if (!APPLY) { fWritten++; continue }
    const { data: ins, error } = await sb.from("social_property_observations").insert({
      place_id: c.place_id, social_content_id: c.id, observed_by: c.owner_user_id,
      field: "observed_features", value: picked.join("\n"),
      source_url: (stable.officialWebsite as string | undefined) ?? null,
      observed_at: new Date().toISOString().slice(0, 10),
    }).select("id")
    if (error || (ins ?? []).length !== 1) { say(`  ✗ ${c.property_name} — ${error?.message ?? "no row inserted"}`); failed++ }
    else { fWritten++; wrote++ }
  }
  say(`  ${APPLY ? "wrote" : "would write"} ${fWritten} · already present or shared with a published post ${fSkipped} · nothing verifiable ${fNone}`)
  for (const d of dropSamples) say(`  dropped as select-unit: ${d}`)

  // ── 3. HIGHLIGHTS — unused slots only ─────────────────────────────────────────────────────
  say(`\n── Highlights ──`)
  let hWritten = 0, hFull = 0, hNone = 0
  const hHeld: string[] = []
  for (const c of content ?? []) {
    if (!draftContent.has(c.id as string)) continue
    // A video shared with a PUBLISHED or READY post keeps its marketing fields untouched. Features
    // Observed is research and skips these too; highlights feed composePost's SourceMeta, so the
    // rule matters more here, not less.
    if (nonDraftContent.has(c.id as string)) { hHeld.push(String(c.property_name)); continue }
    const existing = String(c.amenities ?? "").split("\n").map((s) => s.trim()).filter(Boolean)
    const free = 3 - existing.length
    if (free <= 0) { hFull++; continue }
    const r = (research ?? []).find((x) => x.place_id === c.place_id)
    if (!r) { hNone++; continue }
    const { picked } = featuresFrom((r.stable ?? {}) as Record<string, unknown>)
    const add = HIGHLIGHT_RANK.filter((h) => picked.includes(h) && !existing.includes(h)).slice(0, free)
    if (add.length === 0) { hNone++; continue }
    const next = [...existing, ...add]
    say(`  ${String(c.property_name).padEnd(40).slice(0, 40)} [${existing.join(" · ") || "empty"}] → [${next.join(" · ")}]`)
    if (!APPLY) { hWritten++; continue }
    let q = sb.from("social_content").update({ amenities: next.join("\n") }).eq("id", c.id)
    q = c.amenities == null ? q.is("amenities", null) : q.eq("amenities", c.amenities)
    const { data: up, error } = await q.select("id")
    if (error || (up ?? []).length !== 1) { say(`  ✗ ${c.property_name} — ${error?.message ?? `matched ${(up ?? []).length} rows`}`); failed++ }
    else { hWritten++; wrote++ }
  }
  say(`  ${APPLY ? "wrote" : "would write"} ${hWritten} · already full ${hFull} · no verified option available ${hNone}`)
  if (hHeld.length) say(`  HELD — shared with a published/ready post: ${hHeld.join(", ")}`)

  if (APPLY) {
    const after = (await sb.from("social_posts").select("*").order("id")).data
    say(`\nsocial_posts whole-table hash ${sha(postsBefore)} → ${sha(after)}  ${sha(postsBefore) === sha(after) ? "✓ identical" : "✗ CHANGED"}`)
  }
  say(`\n${APPLY ? "WROTE" : "WOULD WRITE"} ${wrote} · FAILURES ${failed}`)
  if (failed) process.exitCode = 1
}
void main().catch((e) => { console.error(e); process.exit(1) })
