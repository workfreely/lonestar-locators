// 10-DRAFT ENRICHMENT PILOT — hand-authored, evidence-backed, additive only.
//
// Run:  npx tsx scripts/social/pilotEnrich.ts           (PREVIEW — writes nothing)
//       npx tsx scripts/social/pilotEnrich.ts --apply
//
// ── WHY THIS IS HAND-AUTHORED ───────────────────────────────────────────────────────────────
// The keyword classifier was tried and rejected, twice. Even after six bug fixes it read "FOUR
// floor plans" as four storeys, counted the negation "not townhomes" as townhomes, and classified
// two properties from empty evidence. Every value below was read out of the property's own
// research record by eye, and the evidence is quoted beside it.
//
// ── THE FOUR RULES EVERY ENTRY OBEYS ────────────────────────────────────────────────────────
//  1. ADDITIVE ONLY. Nothing here overwrites a value a human entered. A field that already holds
//     something is skipped and reported, never replaced — see The Mustang, whose manual prices
//     disagree with the research and which therefore receives nothing at all.
//  2. VERIFIED-CURRENT ONLY. A price or concession is written only when the research marked it
//     verified_current from an official source. Across all 85 drafts that is 5 price sets and 2
//     specials; everything else was recorded as previously_recorded, conflicting or expired, and
//     advertising it would be exactly the mistake the research was built to prevent.
//  3. SELECT-UNIT FEATURES NEVER BECOME PROPERTY-WIDE. "Floor-to-ceiling windows — SELECT HOMES
//     ONLY" stays out of 3700M's highlights however well it would sell.
//  4. BLANK BEATS A GUESS. Four of the nine properties get no Building Type, because no source
//     states their height and nothing else settles it.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { BUILDING_TYPES, type BuildingType } from "@/lib/social/buildingTypes"
import { mergeStableResearch } from "@/lib/social/mergeResearch"

const APPLY = process.argv.includes("--apply")

type Entry = {
  property: string
  buildingType: BuildingType | null
  btEvidence: string
  /** Panel field -> value. Written only into an EMPTY field. */
  prices?: Record<string, string>
  /** Canonical amenity names for Features Observed. */
  features?: string[]
  /** Up to 3 marketing highlights; fills UNUSED slots only, never replaces. */
  highlights?: string[]
  notes: string[]
}

const PILOT: Entry[] = [
  { property: "Tin Top Flats at the Creamery",
    buildingType: "Mixed Community",
    btEvidence: 'official self-description: "an upscale apartment AND TOWNHOME community in downtown San Antonio"; B3-TH is the only townhome plan',
    prices: { onebr_starting_rent: "$1,374", twobr_starting_rent: "$2,325", townhome_starting_rent: "$3,903" },
    features: ["Washer & Dryer Included", "Stainless Steel Appliances", "Walk-In Closets", "Sky Lounge",
               "Fitness Center", "Yoga Studio", "Business Center", "Dog Park", "Pet Spa", "EV Charging"],
    notes: [
      'SPECIAL NOT WRITTEN. The only verified_current special is the banner "Specials Available" on every plan — that is a sign that concessions exist, not a concession anyone can advertise.',
      "18 interior features are marked SELECT UNITS ONLY (granite, quartz, kitchen island, garden tub, mud room, built-in desk, balcony, views). None were taken.",
      "9 ft ceilings are verified but 9 ft is standard, so High Ceilings was not claimed.",
    ] },

  { property: "Elev8", buildingType: null,
    btEvidence: "no source states the building's height. 372 homes in three types (flats, lofts, penthouses) does not settle Mid-Rise vs High-Rise.",
    prices: { studio_starting_rent: "$1,750 base rent (S2) · $1,903 total monthly",
              onebr_starting_rent: "$2,000 base rent (A3) · $2,153 total monthly",
              twobr_starting_rent: "$2,733 base rent (B1) · $2,886 total monthly",
              loft_starting_rent: "$4,600 base rent (L6) · $4,753 total monthly" },
    features: ["Quartz Countertops", "Stainless Steel Appliances", "Fitness Center", "Yoga Studio",
               "Clubroom", "Pet Spa", "Dog Park", "EV Charging", "Garage Parking"],
    notes: [
      "Base rent and total monthly leasing price are both kept in every value — Greystar advertises the total, which includes mandatory fees.",
      "SPECIAL NOT WRITTEN: 8/6 weeks free is previously_recorded from a third party.",
      "ONE HIGHLIGHT SLOT LEFT EMPTY ON PURPOSE. Its two strongest remaining verified features — the EXPANSIVE INDOOR POOL and the ROOF DECK — have no option in the 42-value bank. Flagged as future bank candidates rather than padded with a generic one.",
    ] },

  { property: "The Rice", buildingType: null,
    btEvidence: "a 1998 conversion of ~300 homes; no source states the building's height.",
    prices: { studio_starting_rent: "$1,088 base rent (A2) · $1,246 total monthly",
              onebr_starting_rent: "$1,293 base rent (A8) · $1,451 total monthly",
              twobr_starting_rent: "$1,890 base rent (L2C-AR) · $2,048 total monthly" },
    features: ["High Ceilings", "Quartz Countertops", "Fitness Center", "Concierge", "Controlled Access"],
    notes: [
      'PENTHOUSE LOFT PRICE NOT WRITTEN ($2,526 base / $2,684 total, plan C9). Greystar sells "Penthouse Lofts" as one category and the panel has separate Penthouse and Loft fields; putting it in either would invent a distinction the source does not make.',
      "10–18 ft is a RANGE across the building, so High Ceilings is claimed but no number is stated.",
      "Four interior features are asterisked SELECT HOMES (gourmet kitchens, maple flooring, walk-in showers, washer/dryer). None were taken — in particular the laundry, which must not read as included.",
      "SPECIAL NOT WRITTEN: the only one on record expired 15 June 2026.",
    ] },

  { property: "The Mustang", buildingType: null,
    btEvidence: 'a "5th-floor resident dining room" proves at least five floors but not the building height.',
    notes: [
      "NOTHING WRITTEN AT ALL — this draft already carries manually entered research, and it is the reason the pilot includes it.",
      "PRICE CONFLICT FOR YOUR REVIEW. Stored by hand vs research (official, verified_current):",
      "   1 bed   stored $2,592   research $2,300 base / $2,527 total",
      "   2 bed   stored $4,237   research $3,350 base / $3,577 total",
      "   3 bed   stored $4622    research $4,395 base / $4,622 total  (matches the total)",
      'CURRENT SPECIAL "8 Weeks Free" is stored by hand from the official floorplans page; research has it only as previously_recorded third-party. The stored value is better sourced and was left alone.',
      "Its 7 stored Features Observed include free text outside the 42-value bank (Private Yard, Lake View, 10 ft Ceilings, Putting Green, Oversized Windows, Wine Refrigerators). Preserved untouched.",
    ] },

  { property: "Merrick On Midway", buildingType: "Mid-Rise",
    btEvidence: '"FIVE STOREYS" — stated outright in its own research',
    features: ["Washer & Dryer Included", "Resort-Style Pool", "Sky Lounge", "Fitness Center",
               "Coworking Space", "Dog Park", "Pet Spa", "EV Charging"],
    highlights: ["Resort-Style Pool", "Sky Lounge", "Washer & Dryer Included"],
    notes: ["All three highlight slots were empty. The rooftop sky deck with sweeping views, the resort-style pool and in-unit laundry are the three strongest verified features."] },

  { property: "3700M", buildingType: null,
    btEvidence: '"Mixed TOWER and LOW-RISE" with ~380 homes across both — a single height classification would misdescribe half the property.',
    features: ["Washer & Dryer Included", "Walk-In Closets", "Resort-Style Pool", "Fitness Center",
               "Dog Park", "Sky Lounge", "Garage Parking", "EV Charging"],
    highlights: ["Resort-Style Pool", "Sky Lounge", "Washer & Dryer Included"],
    notes: ['FLOOR-TO-CEILING WINDOWS DELIBERATELY NOT TAKEN. Greystar marks them SELECT HOMES ONLY, so they cannot be a property-wide highlight — this is the single most tempting entry in the pilot.'] },

  { property: "Iron Rock Ranch", buildingType: "Mixed Community",
    btEvidence: '"22-acre rental community: 84 townhomes + 216 apartments"',
    notes: [
      "NO HIGHLIGHTS ADDED, though all three slots are free. Its research lists only Two pools, Fitness centre, Pet park and Basketball court — none distinctive, and two have no option in the bank. Padding the slots with generic amenities is not what the slots are for.",
      'The stored special "6 Weeks Free" and price "$1750" are existing manual content and were left untouched; research has both only as previously_recorded.',
      "This record's feature detail is the thinnest in the pilot — flagged for a research top-up rather than enrichment.",
    ] },

  { property: "Freestone Ladera", buildingType: "Apartment Community",
    btEvidence: 'the official amenities page describes "apartment" features and qualifies others as "SELECT APARTMENT HOMES ONLY"; 288 homes across 13 plans',
    features: ["Washer & Dryer Included", "Private Yards", "Granite Countertops", "Stainless Steel Appliances",
               "Walk-In Closets", "Resort-Style Pool", "Fitness Center", "Dog Park", "Business Center", "Gated Community"],
    highlights: ["Private Yards", "Washer & Dryer Included", "Resort-Style Pool"],
    notes: [
      "Fenced-in yards on an apartment community are genuinely distinctive, so they lead the highlights.",
      "RENTABLE garages and carports are paid add-ons and were NOT recorded as parking features — they must never read as included.",
      "9 ft ceilings are verified but standard; High Ceilings was not claimed.",
    ] },

  { property: "Modera Waugh", buildingType: "High-Rise",
    btEvidence: "stories = 17, a verified count in the research record itself",
    features: ["Washer & Dryer Included", "Quartz Countertops", "Resort-Style Pool", "Fitness Center",
               "Clubroom", "Coworking Space", "Sky Lounge", "Dog Park", "Pet Spa", "Garage Parking", "EV Charging"],
    highlights: ["Sky Lounge", "Resort-Style Pool", "Washer & Dryer Included"],
    notes: ['City Views was considered and skipped: the sweeping views are the ROOFTOP DECK\'s, and no source says the homes have them.'] },
]

// The ten drafts, by post id, so the pilot cannot drift onto a different video.
const DRAFTS: { post: string; property: string }[] = [
  { post: "1fae5c8b-cc6b-4fbe-89a4-2df31f6c1fdd", property: "Tin Top Flats at the Creamery" },
  { post: "01a369a9-ff27-4a1c-b502-b3181dc3a98f", property: "Tin Top Flats at the Creamery" },
  { post: "c87578d8-43ed-4ede-89db-0891ebaa1163", property: "Elev8" },
  { post: "fa4e555c-5e22-4abd-b701-b6847c1de743", property: "The Rice" },
  { post: "ca3e36b1-9297-41ee-861b-66090f3c9829", property: "The Mustang" },
  { post: "eecbac32-2433-40d2-8eba-36eb5a12ab8f", property: "Merrick On Midway" },
  { post: "525fb19c-e0f3-4bb6-a972-fe0b6aa85bfc", property: "3700M" },
  { post: "271f5a8a-1f71-48df-b1ff-e7d9e8cf661f", property: "Iron Rock Ranch" },
  { post: "94601b2e-5985-45cc-8027-64c5b974038a", property: "Freestone Ladera" },
  { post: "8eac5c43-7791-47ab-aa08-1651a6aaaead", property: "Modera Waugh" },
]

function client(): SupabaseClient {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
}

async function main() {
  const sb = client()
  const say = (s = "") => console.log(s)
  say(`\n${"=".repeat(90)}\n10-DRAFT ENRICHMENT PILOT — ${APPLY ? "APPLY" : "PREVIEW (writes nothing)"}\n${"=".repeat(90)}`)

  // Guard: every entry's building type must be one of the six.
  for (const e of PILOT) {
    if (e.buildingType && !(BUILDING_TYPES as readonly string[]).includes(e.buildingType)) {
      throw new Error(`REFUSED — ${e.property} proposes "${e.buildingType}", not one of the six`)
    }
  }

  const postIds = DRAFTS.map((d) => d.post)
  const { data: posts } = await sb.from("social_posts")
    .select("id, source_content_id, status, caption, hashtags, overlay_headline, overlay_template, cover_thumb_offset_ms").in("id", postIds)
  const { data: content } = await sb.from("social_content").select("*")
  const { data: research } = await sb.from("social_property_research").select("place_id, property_name, stable")
  const { data: obs } = await sb.from("social_property_observations").select("*")

  const C = new Map((content ?? []).map((c) => [c.id as string, c]))
  const R = new Map((research ?? []).map((r) => [r.place_id as string, r]))
  const obsBy = new Map<string, Set<string>>()
  for (const o of obs ?? []) {
    const k = o.social_content_id as string
    if (!obsBy.has(k)) obsBy.set(k, new Set())
    obsBy.get(k)!.add(o.field as string)
  }

  const plan: { label: string; table: string; action: string }[] = []
  const btDone = new Set<string>()

  for (const d of DRAFTS) {
    const post = (posts ?? []).find((p) => p.id === d.post)
    if (!post) { say(`\n✗ ${d.property} — post ${d.post} not found`); continue }
    if (post.status !== "draft") { say(`\n✗ ${d.property} — not a draft (${post.status}); skipped`); continue }
    const c = C.get(post.source_content_id as string)
    const e = PILOT.find((x) => x.property === d.property)!
    const r = c?.place_id ? R.get(c.place_id as string) : null
    const stable = (r?.stable ?? {}) as Record<string, unknown>
    const have = obsBy.get(c!.id as string) ?? new Set<string>()
    const existingAm = String(c!.amenities ?? "").split("\n").map((s) => s.trim()).filter(Boolean)

    say(`\n${"─".repeat(90)}`)
    say(`${d.property}   ·   ${c!.market}   ·   Unit Type: ${c!.property_type ?? "—"}   ·   template: ${post.overlay_template}`)
    say(`post ${post.id}   content ${c!.id}`)

    // ── BUILDING TYPE (property-level, written once per place_id) ────────────────────────────
    const btNow = (stable.buildingType as string | undefined) ?? null
    if (e.buildingType && !btNow && c?.place_id && !btDone.has(c.place_id as string)) {
      say(`  Building Type   ${JSON.stringify(btNow)} → ${JSON.stringify(e.buildingType)}`)
      say(`                  evidence: ${e.btEvidence}`)
      plan.push({ label: `${d.property} buildingType`, table: "social_property_research", action: "merge one key" })
      btDone.add(c.place_id as string)
      if (APPLY) {
        const next = mergeStableResearch(stable as never, { buildingType: e.buildingType } as never)
        const { error } = await sb.from("social_property_research").update({ stable: next }).eq("place_id", c.place_id)
        if (error) say(`  ✗ buildingType write failed: ${error.message}`)
      }
    } else if (e.buildingType && btNow) {
      say(`  Building Type   already ${JSON.stringify(btNow)} — left alone`)
    } else if (e.buildingType) {
      say(`  Building Type   ${JSON.stringify(e.buildingType)} (already written for this property)`)
    } else {
      say(`  Building Type   LEFT BLANK — ${e.btEvidence}`)
    }

    // ── STARTING PRICES + FEATURES (per-video observations, EMPTY fields only) ───────────────
    const writes: Record<string, string> = {}
    for (const [k, v] of Object.entries(e.prices ?? {})) {
      if (have.has(k)) { say(`  ${k.padEnd(24)} SKIPPED — already holds a value`); continue }
      writes[k] = v
    }
    if (e.features?.length) {
      if (have.has("observed_features")) say(`  observed_features        SKIPPED — already holds a value`)
      else writes.observed_features = e.features.join("\n")
    }
    for (const [k, v] of Object.entries(writes)) {
      say(`  ${k.padEnd(24)} (empty) → ${JSON.stringify(v).slice(0, 110)}`)
      plan.push({ label: `${d.property} ${k}`, table: "social_property_observations", action: "insert" })
    }
    if (APPLY && Object.keys(writes).length) {
      const rows = Object.entries(writes).map(([field, value]) => ({
        place_id: c!.place_id, social_content_id: c!.id, observed_by: c!.owner_user_id,
        field, value,
        source_url: (stable.officialWebsite as string | undefined) ?? null,
        observed_at: new Date().toISOString().slice(0, 10),
      }))
      const { error } = await sb.from("social_property_observations").insert(rows)
      if (error) say(`  ✗ observation insert failed: ${error.message}`)
    }

    // ── HIGHLIGHTS (social_content.amenities — UNUSED SLOTS ONLY) ────────────────────────────
    if (e.highlights?.length) {
      const free = 3 - existingAm.length
      if (free <= 0) say(`  Highlights               full (${existingAm.join(" · ")}) — left alone`)
      else {
        const add = e.highlights.filter((h) => !existingAm.includes(h)).slice(0, free)
        const next = [...existingAm, ...add]
        say(`  Highlights               [${existingAm.join(" · ") || "empty"}] → [${next.join(" · ")}]`)
        plan.push({ label: `${d.property} highlights`, table: "social_content", action: "amenities" })
        if (APPLY) {
          // OPTIMISTIC CONCURRENCY, and NULL IS NOT "". The first version of this filter used
          // .eq("amenities", c.amenities ?? "") — against a NULL column that matches nothing, so
          // every write silently updated zero rows and reported no error at all. .is() is the only
          // thing that matches NULL, and the row count is now checked rather than assumed.
          let q = sb.from("social_content").update({ amenities: next.join("\n") }).eq("id", c!.id)
          q = c!.amenities == null ? q.is("amenities", null) : q.eq("amenities", c!.amenities)
          const { data: updated, error } = await q.select("id")
          if (error) say(`  ✗ highlight write failed: ${error.message}`)
          else if ((updated ?? []).length !== 1) say(`  ✗ highlight write matched ${(updated ?? []).length} rows — nothing written`)
        }
      }
    }

    for (const n of e.notes) say(`  · ${n}`)
  }

  say(`\n${"─".repeat(90)}`)
  const byTable = plan.reduce<Record<string, number>>((a, p) => ({ ...a, [p.table]: (a[p.table] ?? 0) + 1 }), {})
  say(`${APPLY ? "WROTE" : "WOULD WRITE"}: ${plan.length} changes — ${Object.entries(byTable).map(([t, n]) => `${t} ${n}`).join(" · ")}`)
  say("No post row is addressed by this script: captions, hashtags, overlays, templates and cover offsets are untouched.")
}

void main().catch((e) => { console.error(e); process.exit(1) })
