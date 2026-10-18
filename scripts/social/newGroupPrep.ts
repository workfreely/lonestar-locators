// ELE → DECO GROUP: research + draft preparation. PREVIEW BY DEFAULT — writes nothing.
//
// Run:  npx tsx scripts/social/newGroupPrep.ts            (PREVIEW — writes nothing)
//       npx tsx scripts/social/newGroupPrep.ts --apply    (writes, only after approval)
//
// ── THE GROUP IS DERIVED, NOT TYPED ─────────────────────────────────────────────────────────
// The boundaries come from social_content's own upload order: the row whose property_name starts
// "Ele Dallas", through the row named exactly "Deco". Nothing in between is listed by hand, so a
// clip uploaded into the middle of the group is picked up rather than missed.
//
// ── WHERE EVERY RESEARCH VALUE COMES FROM ───────────────────────────────────────────────────
// Same rule as gapResearch.ts: address, city, official website, year built, management company,
// features and floor plans are READ LIVE from Property Intelligence (property_catalog,
// property_attributes, property_floor_plans) at the moment this runs. Those tables are opened
// READ-ONLY and this script has no write path to any of them. Nothing is typed from memory and
// nothing is taken from the open web.
//
// Hand-authored here is only the part no table holds: the geography layers, and the decision about
// what stays unresolved. A property whose geography is not in the POLICY table below is not
// researched — it is reported as needing a decision, never given a guessed district.
//
// ── DRAFTS USE THE EXISTING GENERATOR, NOT NEW COPY ─────────────────────────────────────────
// Captions, overlay headlines, overlay details and hashtags are produced by composePost's own
// buildCaption / buildTemplateHeadline / buildTemplateDetail / buildHashtags — the same functions
// the Post Editor calls, with the same source-video seed. The only decision this script makes is
// WHICH TEMPLATE each clip gets. No caption text is written here.

import { sb, OWNER, run } from "./_runner"
import { LABELS, COMMUNITY, AMBIGUOUS } from "./gapResearch"
import type { ResearchRecord } from "./saveResearch"
import type { Json } from "@/lib/social/mergeResearch"
import {
  buildCaption, buildTemplateHeadline, buildTemplateDetail, isGeneratedCaption,
  commentCtaKeyword, priceLabelMode,
  type OverlayTemplate, type SourceMeta,
} from "@/lib/social/composePost"
import { buildHashtags, MAX_HASHTAGS } from "@/lib/social/hashtags"

const APPLY = process.argv.includes("--apply")

/** THIS batch's verification date. _runner's V is the previous batch's and is left alone. */
const V = "2026-10-18"
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : V)
/** Refuses to put a raw attribute key into research — the same gate gapResearch applies. */
const label = (key: string): string => {
  const l = (LABELS as Record<string, string>)[key] ?? EXTRA_LABELS[key]
  if (!l) throw new Error(`NO LABEL for attribute key "${key}" — refusing to write a raw key into research. Add it to EXTRA_LABELS.`)
  return (AMBIGUOUS as Set<string>).has(key) ? `${l} (the source does not state in-unit or shared)` : l
}
/** Keys this group needs that the shared table does not yet carry. Hand-authored, same as LABELS. */
const EXTRA_LABELS: Record<string, string> = {
  coffee_bar: "Coffee bar",
  pendant_lighting: "Pendant lighting",
  chandelier: "Chandelier",
  linen_closet: "Linen closet",
  backlit_mirror: "Backlit mirror",
}

// ── HELD ────────────────────────────────────────────────────────────────────────────────────
// Carried forward from gapResearch.ts unchanged. Both have a place_id on one of our videos, so
// the identity gate in saveResearch would PASS — but passing the gate is not knowing what the
// building is, and neither has a property_catalog row to say.
const HELD: Record<string, string> = {
  "ChIJV48-wTeZToYR2uOsD7YuwUU": "The Katy Victory Park — NO property_catalog row. Identity unverified.",
  "ChIJ2eLPOgy1RIYRdTRl4BG-gko": "SEVEN Apartments — NO property_catalog row. Identity unverified.",
}

// ── DRAFTS HELD FOR AN UNRESOLVED PROPERTY TYPE ─────────────────────────────────────────────
// Research for these is fine and stays. What cannot be written is a POST, because the caption
// bakes in a comment keyword derived from the property type — and publishing two posts for one
// building that ask for different keywords is a claim we cannot support.
//
// The Gabriella's two clips disagree: one says Apartment (LIST), the other High-Rise (RISE). The
// catalog cannot settle it — property_type is NULL, structural_scale is NULL, stories is NULL and
// confidence_status is unset. The only signal is inventory_type="high-rise", an internal
// classification with no storey count behind it, which is evidence and not verification.
const DRAFTS_HELD: Record<string, string> = {
  "ChIJV9ae39iYToYR-5EcwPHd3Ac": 'The Gabriella — clip 1 is typed "Apartment" (CTA LIST) and clip 2 "High-Rise" (CTA RISE) for the SAME place_id. property_type/structural_scale/stories are all NULL in the catalog and confidence_status is unset; inventory_type="high-rise" alone is an internal classification, not verification. Held so no conflicting LIST/RISE pair goes out.',
}

// ── EXISTING DRAFTS TO RE-TEMPLATE ──────────────────────────────────────────────────────────
// Two drafts were created in the app on Template 1. Converting them is approved, but ONLY where
// nothing was hand-authored: the gate below re-derives the caption, headline, detail and hashtags
// and refuses the conversion if any stored value is not the generator's own.
// Keyed by SOURCE CLIP ID, not property name: The Margaret has two clips and only one of them is
// the Template 1 draft. A name key converted the wrong one as well.
const CONVERT: Record<string, { tpl: OverlayTemplate; from: OverlayTemplate }> = {
  "8105ff7c-14f9-4d6c-985c-1de44c10d720": { tpl: "would_you_live_here", from: "market_type" }, // Deco
  "e68030de-9e2e-462d-884b-195cbaeecce9": { tpl: "upgrade", from: "market_type" },             // The Margaret, clip 1
}

// ── GEOGRAPHY POLICY — hand-authored, the only non-table values in the research ──────────────
// district: null means "no source states it". That is flagged in `unresolved`, never guessed.
type Policy = {
  pid: string; name: string; market: string; broaderArea: string
  /** Null means "no source states it". Flagged in `unresolved`, never guessed. */
  district: string | null
  /** Why this geography is what it is — the reasoning, kept with the value. */
  geoNote: string
  nearby: string[]
  onVideoName?: string
  nameNote?: string
  flags?: { field: string; issue: string }[]
}
const POLICY: Policy[] = [
  {
    pid: "ChIJVQRCTxwlTIYRBTc4bruNeOQ", name: "Tapestry at the Realm Apartments",
    market: "Dallas", broaderArea: "Lewisville", district: null,
    geoNote: '2901 Lady Bettye Dr, 75056. City of Lewisville, Dallas market — the same treatment Plano gets (a separate incorporated city inside the market). The catalog holds no submarket and no location keywords, so NO district is asserted.',
    nearby: ["Castle Hills", "The Colony", "Hebron"],
    flags: [{ field: "features", issue: "ZERO verified attributes and ZERO floor plans on file. This record is identity and geography only, and is a candidate for a Property Intelligence top-up." }],
  },
  {
    pid: "ChIJ3-VjQzKZToYRccLOdDyv32Y", name: "Gables Villa Rosa",
    market: "Dallas", broaderArea: "Uptown Dallas", district: "Uptown",
    geoNote: '2650 Cedar Springs Rd, 75201. The catalog states submarket "Uptown" and location keywords "Uptown Dallas / Turtle Creek / walkable city living", so the district is sourced rather than inferred.',
    nearby: ["Turtle Creek", "Oak Lawn", "Victory Park"],
    flags: [{ field: "propertyType", issue: 'Property Intelligence classifies inventory_type="townhome_loft" and structural_scale="Loft/Townhome Candidate", which does not agree with the library\'s "Apartment". Recorded under structuralScale as evidence; NOT reconciled and NOT used to change the library.' }],
  },
  {
    pid: "ChIJrXp5WqNxToYRrRoIpO7pnKY", name: "Deco 969", onVideoName: "Deco",
    market: "Dallas", broaderArea: "Fort Worth", district: "Downtown Fort Worth",
    geoNote: '969 Commerce St, 76102. The catalog states submarket "Downtown Fort Worth" and the location keyword "Downtown Fort Worth", so the district is sourced. Fort Worth is a separate incorporated city inside the market.',
    nameNote: 'The video says "Deco"; the catalog\'s official name is "Deco 969".',
    nearby: ["Sundance Square", "Near Southside", "Trinity Trails"],
    flags: [{ field: "buildingType", issue: 'Catalog inventory_type is "high-rise" and property_grade is "A+", but structural_scale is null and no source states a storey count. Recorded under structuralScale as evidence; buildingType left blank for confirmation.' }],
  },
]

// ── TEMPLATE ASSIGNMENT ─────────────────────────────────────────────────────────────────────
// Templates 1 (market_type), 2 (market_type_centered) and 4 (special_feature) are used SPARINGLY
// per instruction. They are also the three whose whole job is to carry a price or a special, and
// NOT ONE clip in this group has a budget_range — so on this group they would render a hero
// headline over an empty detail line. T15/T16 (what_mo_gets_you*) are excluded outright: without a
// live price they generate an EMPTY headline by design, which is correct behaviour and an unusable
// post. The client_me_* family is excluded too — its caption is fixed copy whose CTA is hardcoded
// to commentCta(null) = "LIST", which would contradict the RISE keyword every High-Rise here needs.
//
// Clips of the SAME property always get DIFFERENT templates, so no two drafts share a caption.
const ASSIGN: Record<string, OverlayTemplate> = {
  // one clip each
  "Ele Dallas Apartments":           "next_property",
  "Ferro":                           "hits_different",
  "Hanover Turtle Creek":            "real_living",
  // your_sign collided with the live Margaret draft's caption — the gate caught it.
  "Lantower Midtown":                "imagine_coming_home",
  "The Hamilton":                    "pov_upgrade",
  "The Louise Apartments":           "affordable_luxury",
  "The Grand at Legacy West":        "trade_up",
  "Solaris House":                   "wanted_luxury",
  "The Kincaid at Legacy":           "property_tour",
  "Tapestry at the Realm Apartments":"imagine_coming_home",
  "Deco":                            "would_you_live_here",
}
// Multi-clip properties: one template per clip, in upload order.
const ASSIGN_MULTI: Record<string, OverlayTemplate[]> = {
  "The Gabriella Apartments":      ["pov_price", "real_living"],
  "Crimson Luxury Apartment Homes":["upgrade", "apartment_standards"],
  // clip 2 has moved twice, both times because the gate found a real collision: off next_property
  // (identical to Ele Dallas), then off upgrade (identical to clip 1, which is being converted TO
  // upgrade). real_living is the first assignment that is unique against both.
  "The Margaret at Riverfront":    ["__EXISTING_DRAFT__" as OverlayTemplate, "real_living"],
  "AMLI Fountain Place":           ["property_tour", "hits_different"],
  "The Case Bldg":                 ["your_sign", "pov_upgrade", "trade_up"],
  // clip 2 moved off affordable_luxury: it collided with The Louise.
  "Gables Villa Rosa":             ["wanted_luxury", "pov_price"],
}

async function main() {
  // Refuse before doing anything if a held property ever appears in POLICY.
  for (const p of POLICY) {
    if (HELD[p.pid]) throw new Error(`POLICY contains a HELD property (${p.name}). Aborting without writing anything.`)
  }

  const { data: all, error: libErr } = await sb.from("social_content")
    .select("id, created_at, property_name, display_name, market, area_neighborhood, property_type, place_id, special, budget_range, amenities, price_label_mode, overlay_mode, details")
    .order("created_at", { ascending: true })
  if (libErr) throw new Error(`could not read the Video Library: ${libErr.message}`)
  const rows = all ?? []
  const s = rows.findIndex((r) => /^ele dallas/i.test(String(r.property_name ?? "")))
  const t = rows.findIndex((r) => String(r.property_name ?? "").trim().toLowerCase() === "deco")
  if (s < 0 || t < 0 || t < s) throw new Error("could not locate the Ele→Deco group boundaries")
  const group = rows.slice(s, t + 1)

  console.log(`${APPLY ? "APPLY" : "PREVIEW"} — Ele→Deco group: library rows ${s + 1}..${t + 1} (${group.length} clips)\n`)

  // ── existing state, so nothing is duplicated ──────────────────────────────────────────────
  const pids = [...new Set(group.map((r) => r.place_id).filter(Boolean))] as string[]
  const { data: research } = await sb.from("social_property_research").select("place_id, property_name, updated_at").in("place_id", pids)
  const researched = new Set((research ?? []).map((r) => r.place_id))
  const { data: drafts } = await sb.from("social_posts").select("id, source_content_id, status, overlay_template").in("source_content_id", group.map((r) => r.id))
  const draftBy = new Map((drafts ?? []).map((d) => [d.source_content_id, d]))

  // ── 1. RESEARCH ───────────────────────────────────────────────────────────────────────────
  // Same structure gapResearch.ts writes: a geography block, applicability kept in separate keys
  // (property-wide vs SELECT UNITS ONLY vs PENTHOUSES ONLY), the internal classification recorded
  // as evidence rather than promoted to a Building Type, and one source entry per table actually
  // read. VERIFIED attributes and plans only — an unverified row is not evidence.
  console.log("━".repeat(90))
  console.log("1. RESEARCH — proposed records for social_property_research")
  console.log("━".repeat(90))
  const records: ResearchRecord[] = []
  for (const pol of POLICY) {
    if (researched.has(pol.pid)) { console.log(`\n  SKIP  ${pol.name} — already has a research row. Not re-written.`); continue }
    const { data: cat, error: ce } = await sb.from("property_catalog").select("*").eq("place_id", pol.pid).maybeSingle()
    if (ce) throw new Error(`catalog read failed for ${pol.name}: ${ce.message}`)
    if (!cat) { console.log(`\n  HOLD  ${pol.name} — no property_catalog row; identity cannot be verified from internal data.`); continue }
    const c = cat as Record<string, unknown>

    const { data: attrsRaw, error: ae } = await sb.from("property_attributes")
      .select("attribute_key, applicability, verification_status, source_reference, checked_at").eq("place_id", pol.pid)
    if (ae) throw new Error(`attributes read failed for ${pol.name}: ${ae.message}`)
    const attrs = (attrsRaw ?? []).filter((a) => a.verification_status === "verified")

    const { data: plansRaw, error: pe } = await sb.from("property_floor_plans")
      .select("name, beds, baths, sqft_min, sqft_max, starting_rent, checked_at, source_reference, verification_status").eq("place_id", pol.pid)
    if (pe) throw new Error(`floor plan read failed for ${pol.name}: ${pe.message}`)
    const plans = (plansRaw ?? []).filter((x) => x.verification_status === "verified")

    const pick = (app: string) => attrs.filter((a) => (a.applicability ?? "property_wide") === app).map((a) => a.attribute_key as string)
    const wide = pick("property_wide")
    const interior = wide.filter((k) => !(COMMUNITY as Set<string>).has(k)).map(label)
    const community = wide.filter((k) => (COMMUNITY as Set<string>).has(k)).map(label)
    const selectUnits = pick("select_units").map((k) => `SELECT UNITS ONLY — ${label(k)}`)
    const penthouse = pick("penthouses").map((k) => `PENTHOUSES ONLY — ${label(k)}`)

    const website = (c.website_url as string | null) ?? null
    const attrSrc = (attrs[0]?.source_reference as string | undefined) ?? website
    const attrDay = day(attrs[0]?.checked_at as string | undefined)
    const libRow = group.find((g) => g.place_id === pol.pid)

    const stable: Record<string, Json> = {
      address: c.address as string,
      city: c.city as string,
      officialWebsite: website,
      geography: {
        market: pol.market, city: c.city as string, broaderArea: pol.broaderArea, district: pol.district,
        note: pol.geoNote, verifiedAt: V,
        sources: ["internal:property_catalog (address, city, ZIP, submarket, location_keywords)"],
      },
    }
    if (typeof c.google_rating === "number") {
      stable.googleRating = `${c.google_rating} from ${c.google_review_count ?? "?"} Google reviews (as recorded by Property Intelligence)`
    }
    if (typeof c.year_built === "number") stable.yearBuilt = String(c.year_built)
    if (c.management_company) stable.managementCompany = c.management_company as string
    if (pol.nameNote) stable.names = { onVideo: pol.onVideoName ?? pol.name, official: (c.property_name as string) ?? pol.name, note: pol.nameNote }
    // The raw internal classification, labelled as such. NOT promoted to a Building Type.
    const scale = (c.structural_scale as string | null) ?? null
    const inv = (c.inventory_type as string | null) ?? null
    if (scale || inv) {
      stable.structuralScale = `Property Intelligence classification${scale ? ` structural_scale="${scale}"` : ""}${inv ? ` inventory_type="${inv}"` : ""}. INTERNAL CLASSIFICATION, NOT A VERIFIED STOREY COUNT — stories is ${c.stories == null ? "null" : String(c.stories)}. Building Type is deliberately left blank.`
    }
    if (interior.length) stable.interiorFeatures = interior
    if (community.length) stable.communityAmenities = community
    if (selectUnits.length) stable.selectUnitFeatures = selectUnits
    if (penthouse.length) stable.penthouseCollection = penthouse
    if (plans.length) {
      stable.floorPlans = plans.slice().sort((a, b) => (a.beds ?? 0) - (b.beds ?? 0)).map((x) => ({
        name: x.name, beds: x.beds === 0 ? "studio" : x.beds, baths: x.baths,
        sqft: x.sqft_min && x.sqft_max && x.sqft_min !== x.sqft_max ? `${x.sqft_min}–${x.sqft_max}` : (x.sqft_min ?? null),
        price: x.starting_rent ? `$${Number(x.starting_rent).toLocaleString("en-US")} — starting rent OBSERVED ${day(x.checked_at as string)}, not a current quote` : "not published per plan",
      })) as Json
    }

    // No verified rent on file for any of these three, so `pricing` stays empty. Nothing claimed.
    const pricing: Record<string, Json> = {}

    const sources: Json[] = []
    if (website) {
      sources.push({ url: website, kind: "official", verifiedAt: attrDay,
        covers: ["address", "officialWebsite", ...(attrs.length ? ["interiorFeatures", "communityAmenities"] : []), ...(plans.length ? ["floorPlans"] : [])],
        note: attrs.length
          ? "The property's own site, as fetched and verified by Property Intelligence."
          : "The property's own site as recorded in the catalog. NOT read for features — no verified attributes are on file." })
    }
    sources.push({ url: `internal:property_catalog#${pol.pid}`, kind: "internal", verifiedAt: day(c.intel_enriched_at as string | null),
      covers: ["address", "city", "geography", "googleRating", ...(c.year_built ? ["yearBuilt"] : []), ...(scale || inv ? ["structuralScale"] : [])],
      note: "Lone Star Property Intelligence catalog row. READ ONLY — this script does not write to it." })
    if (attrs.length) {
      sources.push({ url: `internal:property_attributes#${pol.pid}`, kind: "internal", verifiedAt: attrDay,
        covers: ["interiorFeatures", "communityAmenities", "selectUnitFeatures", "penthouseCollection"],
        note: `${attrs.length} verified attributes, each carrying its own applicability (${wide.length} property-wide, ${selectUnits.length} select-unit, ${penthouse.length} penthouses-only). Source: ${attrSrc}` })
    }

    const unresolved: Json[] = (pol.flags ?? []).map((f) => ({ field: f.field, issue: f.issue, raisedAt: V }))
    unresolved.push({ field: "buildingType", issue: `No Building Type written. stories is ${c.stories == null ? "null" : String(c.stories)} and confidence_status is unset, so no source on file states the building's height or unit form.`, raisedAt: V })
    if (!pol.district) unresolved.push({ field: "district", issue: "No source on file names a district for this address. The broader area is recorded instead; no district asserted.", raisedAt: V })
    if (!plans.length) unresolved.push({ field: "floorPlans", issue: "No floor plans on file. Beds, baths, square footage and per-plan pricing are all unknown for this property.", raisedAt: V })
    if (c.rent_min == null && c.rent_max == null) unresolved.push({ field: "pricing", issue: "No verified rent on file. This record makes NO pricing claim; nothing here may be advertised as a price.", raisedAt: V })
    if (!interior.length && !community.length && !selectUnits.length) unresolved.push({ field: "interiorFeatures", issue: "No verified features on file, so this record states none. Nothing may be claimed about the interiors or amenities from this record.", raisedAt: V })
    if (libRow && !c.property_type) unresolved.push({ field: "propertyType", issue: `property_catalog.property_type is null. The library's "${libRow.property_type}" is operator-set, not source-verified, and is not treated as evidence.`, raisedAt: V })

    const rec: ResearchRecord = { owner_user_id: OWNER, place_id: pol.pid, property_name: (c.property_name as string) ?? pol.name, stable, pricing, sources, unresolved }
    records.push(rec)

    console.log(`\n  WRITE ${rec.property_name}   [${pol.pid}]`)
    console.log(`    stable      ${JSON.stringify(stable, null, 2).split("\n").join("\n                ")}`)
    console.log(`    pricing     {} — no verified rent on file, nothing claimed`)
    console.log(`    sources     ${JSON.stringify(sources, null, 2).split("\n").join("\n                ")}`)
    console.log(`    unresolved  ${JSON.stringify(unresolved, null, 2).split("\n").join("\n                ")}`)
  }

  // ── 2. DRAFT PROPOSALS ────────────────────────────────────────────────────────────────────
  console.log(`\n${"━".repeat(90)}`)
  console.log("2. DRAFTS — proposed posts, copy generated by composePost (not written here)")
  console.log("━".repeat(90))
  const multiSeen: Record<string, number> = {}
  const tplTally: Record<string, number> = {}
  /** New drafts to INSERT. */
  const proposed: { name: string; clip: string; tpl: OverlayTemplate; caption: string; headline: string }[] = []
  /** Re-templated existing posts: their captions join the uniqueness check but they are UPDATEs,
   *  so they must never reach the insert loop. */
  const captionsToCheck: typeof proposed = []
  let planned = 0, held = 0, skipped = 0
  for (const r of group) {
    const name = String(r.property_name)
    const pid = r.place_id as string | null
    // Claim this clip's slot FIRST, so a held or already-drafted clip still consumes its position
    // and every later clip of the same property keeps the template it was assigned.
    let tpl: OverlayTemplate | undefined = ASSIGN[name]
    if (!tpl && ASSIGN_MULTI[name]) {
      const i = multiSeen[name] ?? 0
      multiSeen[name] = i + 1
      tpl = ASSIGN_MULTI[name][i]
    }

    if (pid && HELD[pid]) { console.log(`\n  HOLD  ${name} — ${HELD[pid]}`); held++; continue }
    if (pid && DRAFTS_HELD[pid]) { console.log(`\n  HOLD  ${name} [clip ${r.id.slice(0, 8)}] — ${DRAFTS_HELD[pid]}`); held++; continue }
    if (draftBy.has(r.id)) { console.log(`\n  SKIP  ${name} [clip ${r.id.slice(0, 8)}] — a draft already exists (${draftBy.get(r.id)!.status} / ${draftBy.get(r.id)!.overlay_template}). Untouched.`); skipped++; continue }
    if (!tpl || String(tpl) === "__EXISTING_DRAFT__") { console.log(`\n  ???   ${name} [clip ${r.id.slice(0, 8)}] — no template assigned. Needs a decision.`); continue }

    const meta: SourceMeta = {
      market: r.market as string | null,
      propertyType: r.property_type as string | null,
      special: (r.special as string | null) ?? null,
      budgetRange: (r.budget_range as string | null) ?? null,
      priceLabelMode: priceLabelMode(r.price_label_mode),
      amenities: (r.amenities as string | null) ?? null,
    }
    const caption = buildCaption(meta, r.id, tpl)
    const headline = buildTemplateHeadline(tpl, meta)
    const detail = buildTemplateDetail(tpl, meta)
    const tags = buildHashtags(meta.market, MAX_HASHTAGS, meta.propertyType)
    tplTally[tpl] = (tplTally[tpl] ?? 0) + 1
    proposed.push({ name, clip: r.id, tpl, caption, headline })
    planned++

    console.log(`\n  DRAFT ${name} [clip ${r.id.slice(0, 8)}]`)
    console.log(`    template        ${tpl}`)
    console.log(`    post_name       ${r.display_name}`)
    console.log(`    CTA keyword     ${commentCtaKeyword(meta.propertyType)}  (from property_type "${meta.propertyType}")`)
    console.log(`    overlay         headline: ${JSON.stringify(headline)}`)
    console.log(`                    detail:   ${JSON.stringify(detail)}`)
    console.log(`    hashtags        ${tags.join(" ")}`)
    console.log(`    caption:`)
    for (const line of caption.split("\n")) console.log(`      │ ${line}`)
  }

  // ── 2b. RE-TEMPLATE THE TWO EXISTING TEMPLATE-1 DRAFTS ────────────────────────────────────
  // PRESERVE-EXISTING GATE. A conversion rewrites caption, headline, detail and template, so it
  // must be refused outright if any stored value is the operator's own rather than the generator's.
  // isGeneratedCaption compares the stored caption against every template × market × type the
  // generator could have produced, including superseded wordings — so a caption that merely looks
  // unfamiliar is still recognised, and only genuinely hand-written copy is protected.
  console.log(`\n${"━".repeat(90)}`)
  console.log("2b. RE-TEMPLATE — existing Template 1 drafts")
  console.log("━".repeat(90))
  const conversions: { postId: string; name: string; from: string; tpl: OverlayTemplate; caption: string; headline: string; detail: string }[] = []
  for (const r of group) {
    const name = String(r.property_name)
    const want = CONVERT[r.id]
    if (!want) continue
    const tpl = want.tpl
    const existing = draftBy.get(r.id)
    if (!existing) continue
    // Already on the target: nothing to do. This is what makes a second run a no-op instead of a
    // self-collision, and it means an interrupted run can simply be run again.
    if (existing.overlay_template === tpl) { console.log(`\n  DONE  ${name} [post ${existing.id.slice(0, 8)}] — already on ${tpl}. Nothing to change.`); continue }
    if (existing.overlay_template !== want.from) {
      console.log(`\n  REFUSE ${name} [post ${existing.id.slice(0, 8)}] — expected to find it on ${want.from} but it is on ${existing.overlay_template}. Left alone.`)
      continue
    }
    const meta: SourceMeta = {
      market: r.market as string | null, propertyType: r.property_type as string | null,
      special: (r.special as string | null) ?? null, budgetRange: (r.budget_range as string | null) ?? null,
      priceLabelMode: priceLabelMode(r.price_label_mode), amenities: (r.amenities as string | null) ?? null,
    }
    const { data: full } = await sb.from("social_posts")
      .select("id, post_name, caption, overlay_headline, overlay_subheadline, hashtags, overlay_template, status, render_status, rendered_storage_path, approved_at, published_at, external_post_id")
      .eq("id", existing.id).maybeSingle()
    if (!full) continue

    const reasons: string[] = []
    if (full.published_at || full.external_post_id) reasons.push("the post is PUBLISHED")
    if (full.status !== "draft") reasons.push(`status is "${full.status}", not draft`)
    if (full.rendered_storage_path || full.render_status === "ready") reasons.push("a render already exists — converting would invalidate it")
    if (full.approved_at) reasons.push("the post is APPROVED")
    if (!isGeneratedCaption(full.caption as string | null, meta, r.id)) reasons.push("the caption is HAND-AUTHORED")
    const curHead = buildTemplateHeadline(full.overlay_template as OverlayTemplate, meta)
    const curDet = buildTemplateDetail(full.overlay_template as OverlayTemplate, meta)
    if ((full.overlay_headline ?? "") !== curHead) reasons.push("overlay_headline was edited by hand")
    if ((full.overlay_subheadline ?? "") !== curDet) reasons.push("overlay_subheadline was edited by hand")
    const curTags = buildHashtags(meta.market, MAX_HASHTAGS, meta.propertyType)
    if (JSON.stringify(full.hashtags) !== JSON.stringify(curTags)) reasons.push("hashtags were edited by hand")

    if (reasons.length) {
      console.log(`\n  REFUSE ${name} [post ${full.id.slice(0, 8)}] — left on ${full.overlay_template}.`)
      for (const x of reasons) console.log(`           · ${x}`)
      continue
    }
    const caption = buildCaption(meta, r.id, tpl)
    const headline = buildTemplateHeadline(tpl, meta)
    const detail = buildTemplateDetail(tpl, meta)
    conversions.push({ postId: full.id, name, from: String(full.overlay_template), tpl, caption, headline, detail })
    captionsToCheck.push({ name: `${name} (re-templated)`, clip: r.id, tpl, caption, headline })
    console.log(`\n  CONVERT ${name} [post ${full.id.slice(0, 8)}]  ${full.overlay_template} → ${tpl}`)
    console.log(`    every stored value is the generator's own — nothing hand-authored to preserve`)
    console.log(`    CTA      ${commentCtaKeyword(meta.propertyType)}  (market "${meta.market}" kept as-is)`)
    console.log(`    overlay  headline ${JSON.stringify(headline)}  detail ${JSON.stringify(detail)}`)
    console.log(`    caption:`)
    for (const l of caption.split("\n")) console.log(`      │ ${l}`)
  }

  console.log(`\n${"━".repeat(90)}`)
  console.log(`3. TALLY`)
  console.log("━".repeat(90))
  console.log(`  drafts planned ${planned}   held ${held}   already had a draft ${skipped}`)
  console.log(`\n  template distribution:`)
  for (const [k, v] of Object.entries(tplTally).sort((a, b) => b[1] - a[1])) console.log(`    ${String(v).padStart(2)}  ${k}`)
  const sparing = ["market_type", "market_type_centered", "special_feature"]
  console.log(`\n  Templates 1 / 2 / 4 used: ${sparing.map((k) => `${k}=${tplTally[k] ?? 0}`).join("  ")}`)

  // ── DUPLICATE CAPTION GATE ────────────────────────────────────────────────────────────────
  // A template plus the same market, property type, special and amenity list produces the SAME
  // caption, byte for byte — two properties can collide without either assignment looking wrong.
  // Checked here, against the generator's real output, and compared against EVERY caption already
  // in social_posts as well as the ones proposed in this batch.
  const norm = (c: string) => c.split("\n").map((l) => l.trim()).filter(Boolean).join("\n")
  const { data: existingPosts } = await sb.from("social_posts").select("id, post_name, caption, status")
  // A post being re-templated is excluded from the live set: its OWN current caption is the thing
  // being replaced, so matching it would be a false collision. Equally, a caption this run already
  // wrote on a previous pass is excluded, which is what makes a re-run a clean no-op.
  const convertingIds = new Set(conversions.map((c) => c.postId))
  const existingByCaption = new Map<string, string>()
  for (const p of existingPosts ?? []) {
    if (convertingIds.has(p.id as string)) continue
    if (typeof p.caption === "string" && p.caption.trim()) existingByCaption.set(norm(p.caption), String(p.post_name))
  }
  const collisions: string[] = []
  const batchByCaption = new Map<string, { name: string; tpl: string }>()
  for (const x of [...proposed, ...captionsToCheck]) {
    const k = norm(x.caption)
    const prior = batchByCaption.get(k)
    if (prior) collisions.push(`BATCH   "${x.name}" (${x.tpl}) has the SAME caption as "${prior.name}" (${prior.tpl})`)
    else batchByCaption.set(k, { name: x.name, tpl: x.tpl })
    const live = existingByCaption.get(k)
    if (live) collisions.push(`EXISTING "${x.name}" (${x.tpl}) has the SAME caption as the live post "${live}"`)
  }
  console.log(`\n  duplicate-caption check across ${proposed.length + captionsToCheck.length} proposed + ${existingByCaption.size} existing captions:`)
  if (collisions.length === 0) console.log(`    PASS — every caption is unique.`)
  else { for (const c of collisions) console.log(`    FAIL — ${c}`) }

  if (collisions.length > 0) throw new Error(`${collisions.length} duplicate caption(s). Reassign templates before applying.`)

  if (!APPLY) {
    console.log(`\n  PREVIEW ONLY — nothing was written. Re-run with --apply after approval.`)
    return
  }

  // ── 4. APPLY ──────────────────────────────────────────────────────────────────────────────
  console.log(`\n${"━".repeat(90)}`)
  console.log("4. APPLYING")
  console.log("━".repeat(90))

  console.log(`\n  research → social_property_research (through saveResearch, so omission cannot delete):`)
  await run(records)

  console.log(`\n  drafts → social_posts:`)
  let ok = 0, failed = 0
  for (const x of proposed) {
    const r = group.find((g) => g.id === x.clip)!
    const meta: SourceMeta = {
      market: r.market as string | null, propertyType: r.property_type as string | null,
      special: (r.special as string | null) ?? null, budgetRange: (r.budget_range as string | null) ?? null,
      priceLabelMode: priceLabelMode(r.price_label_mode), amenities: (r.amenities as string | null) ?? null,
    }
    // Exactly the row POST /posts inserts, plus the template and the template-aware copy the Post
    // Editor writes when the template is chosen. post_type/platform/overlay_mode/audio_choice and
    // created_via all keep their existing semantics; status stays 'draft' and approved_at stays
    // NULL, so nothing here is publishable until it is rendered and approved by hand.
    const { error } = await sb.from("social_posts").insert({
      owner_user_id: OWNER,
      source_content_id: r.id,
      platform: "instagram",
      post_type: "reel",
      post_name: r.display_name as string,
      caption: x.caption,
      overlay_headline: x.headline,
      overlay_subheadline: buildTemplateDetail(x.tpl, meta),
      hashtags: buildHashtags(meta.market, MAX_HASHTAGS, meta.propertyType),
      overlay_template: x.tpl,
      overlay_mode: r.overlay_mode === "existing" ? "existing" : "generate",
      audio_choice: "original",
      render_status: "none",
      status: "draft",
      created_via: "edit_initial",
    })
    if (error) { console.log(`    FAILED  ${x.name} [${x.clip.slice(0, 8)}]: ${error.message}`); failed++ }
    else { console.log(`    created ${x.tpl.padEnd(20)} ${x.name}`); ok++ }
  }
  console.log(`\n  drafts created ${ok} | failed ${failed}`)

  console.log(`\n  re-templating existing drafts:`)
  let conv = 0, convFailed = 0
  for (const cv of conversions) {
    // Guarded UPDATE: still a draft, still unrendered, still unapproved, still on the template we
    // read. Anything changed underneath us and this updates 0 rows and reports it.
    const { data: done, error } = await sb.from("social_posts")
      .update({ overlay_template: cv.tpl, caption: cv.caption, overlay_headline: cv.headline, overlay_subheadline: cv.detail, updated_at: new Date().toISOString() })
      .eq("id", cv.postId).eq("status", "draft").eq("overlay_template", cv.from)
      .is("approved_at", null).is("rendered_storage_path", null).is("published_at", null)
      .select("id").maybeSingle()
    if (error) { console.log(`    FAILED  ${cv.name}: ${error.message}`); convFailed++ }
    else if (!done) { console.log(`    SKIPPED ${cv.name}: the post changed underneath us — 0 rows matched. Left alone.`); convFailed++ }
    else { console.log(`    ${cv.from} → ${cv.tpl.padEnd(20)} ${cv.name}`); conv++ }
  }
  console.log(`\n  re-templated ${conv} | not changed ${convFailed}`)
}

main().catch((err) => { console.error(`\nFAILED: ${err.message}`); process.exit(1) })
