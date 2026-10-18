// RESEARCH FOR THE 15 PROPERTIES THAT HAD NONE — 10 written, 5 held.
//
// Run:  npx tsx scripts/social/gapResearch.ts            (PREVIEW — writes nothing)
//       npx tsx scripts/social/gapResearch.ts --apply
//
// ── WHERE EVERY VALUE COMES FROM ────────────────────────────────────────────────────────────
// Nothing here is typed from memory and nothing is researched from the open web. Address, city,
// official website, Google rating, year built, features and floor plans are READ LIVE from
// Property Intelligence — property_catalog, property_attributes, property_floor_plans — at the
// moment the script runs. Those three tables are opened READ-ONLY; this script has no write path
// to any of them.
//
// What IS hand-authored is the part no table holds: the geography layers, and the decision about
// what each piece of evidence does and does not establish. Those sit in POLICY below, one entry
// per property, with the evidence quoted beside the call.
//
// ── THE FIVE RULES ──────────────────────────────────────────────────────────────────────────
//  1. APPLICABILITY IS CARRIED, NOT FLATTENED. property_attributes.applicability already says
//     whether a feature is property_wide, select_units or penthouses. Each lands in its own key:
//     interiorFeatures/communityAmenities (property-wide), selectUnitFeatures, penthouseCollection.
//     Crimson is the test — 8 of its 9 features are penthouses-only, so its property-wide list is
//     one item long. A select-unit feature never becomes a property-wide claim.
//  2. NO BUILDING TYPE IS WRITTEN. `stories` is null for all ten. Four carry a catalog
//     `structural_scale` or `inventory_type`, but those columns have no verification stamp
//     (confidence_status and classification_status are null on every row). The raw classification
//     is recorded under `structuralScale` as internal evidence and buildingType is left unset and
//     FLAGGED, so it can be confirmed in the editor rather than guessed here.
//  3. A DISTRICT IS WRITTEN ONLY WHERE A SOURCE STATES LOCATION. "Walkable to", "next door to"
//     and "close to" are proximity, not address. Two of the four proposed districts survive this;
//     the other two are flagged instead. See POLICY.
//  4. PRICES ARE OBSERVATIONS, NOT AVAILABILITY. Ferro's fifteen plans were verified against its
//     own site on 25 Sep 2026. Every rent is written with status "previously_recorded" and the
//     date it was observed, and an unresolved entry says current pricing must be re-verified
//     before it is advertised. Nothing claims a unit is available at a price today.
//  5. UNMAPPED KEY = HARD FAILURE. Every attribute key must have a human label in LABELS. An
//     unknown key aborts the run rather than writing a raw snake_case string into marketing copy.
//
// ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────────────────────
// social_content, social_posts, captions, CTAs, overlays, templates, hashtags, video files, draft
// status and schedules are not read for writing and not written. Research lives in its own table,
// keyed by (owner, place_id); the editor displays it and nothing regenerates from it.
import { sb, OWNER, run } from "./_runner"
import type { Json } from "@/lib/social/mergeResearch"

const APPLY = process.argv.includes("--apply")
const V = "2026-10-17"

// ── HOLDS ───────────────────────────────────────────────────────────────────────────────────
// Three were held in earlier sessions and stay held. Two are held because they have no
// property_catalog row at all: their place_id is on one of our videos, so the identity gate would
// pass, but passing the gate is not the same as knowing what the building is.
const HELD: Record<string, string> = {
  "ChIJWWnRZmBfXIYRcgg_Y8ns6go": "Elmira Flats — held. Its catalog row points at stmarysflats.com and 1811 N St Mary's St, which is the identity question that held it.",
  "ChIJs04wb4CbToYRQeODX8PW5t4": "Kessler Bluffs — held.",
  "ChIJOVidhhGfToYROs6LHSEUNiI": "Lofts at Mockingbird Station — held.",
  "ChIJV48-wTeZToYR2uOsD7YuwUU": "The Katy Victory Park — NO property_catalog row. Identity unverified; needs a Property Intelligence catalog fetch.",
  "ChIJ2eLPOgy1RIYRdTRl4BG-gko": "SEVEN Apartments — NO property_catalog row. Identity unverified; needs a Property Intelligence catalog fetch.",
}

type Policy = {
  /** Google place_id — the identity half that saveResearch proves against our own videos. */
  pid: string
  name: string
  market: string
  broaderArea: string
  /** Null means "no source states it". Flagged in `unresolved`, never guessed. */
  district: string | null
  geoNote: string
  /** Extra unresolved entries beyond the ones derived automatically. */
  flags?: { field: string; issue: string }[]
  /** Recorded under stable.names when the video's label differs from the official one. */
  nameNote?: string
}

const POLICY: Policy[] = [
  { pid: "ChIJ-dQqYK48TIYR9J0MuovIvXE", name: "The Grand at Legacy West",
    market: "Dallas", broaderArea: "North Dallas / Collin County",
    district: 'Legacy West — 6080 Water St, inside the Legacy West development. The property\'s own official name states the location, and its keywords list "Legacy West Shopping & Dining".',
    geoNote: 'Plano is a separate incorporated CITY inside the Dallas market; the video stores "Plano" in its area field and that is correct. Matches the LVL29 precedent.',
    flags: [{ field: "buildingType", issue: 'Catalog structural_scale is "Garden-Style", which is not one of the six Building Type values and does not state a height. Left blank for confirmation.' }] },

  { pid: "ChIJsVQzyD09TIYR8P489cI7gUs", name: "The Kincaid at Legacy",
    market: "Dallas", broaderArea: "North Dallas / Collin County", district: null,
    geoNote: 'City of Plano, Dallas market. 7200 Dallas Pkwy, 75024.',
    flags: [
      { field: "district", issue: 'NOT RESOLVED. The name says "at Legacy" and the keywords say "Legacy shopping & dining" — neither settles Legacy West (the mixed-use development) versus Legacy (the older business park). Left blank rather than assumed.' },
      { field: "buildingType", issue: 'Catalog structural_scale is "High-Rise", an exact match for one of the six Building Type values, but that column carries no verification stamp. Recorded under structuralScale as evidence; buildingType left blank for confirmation.' },
    ] },

  { pid: "ChIJd92SGqmbToYRIcwzuRMToDA", name: "The Margaret at Riverfront",
    market: "Dallas", broaderArea: "Design District",
    district: '196 Margaret Ave, 75207 — the riverfront edge of the Design District. Its keywords name "Design District" outright, not as proximity.',
    geoNote: 'Design District is already a canonical Dallas area in this library — the 1400HiLine precedent.',
    flags: [{ field: "features", issue: "Only ONE verified attribute on file (skyline views). This record is thin and is a candidate for a Property Intelligence top-up." }] },

  { pid: "ChIJL2d9BmCfToYRm2zcQx5mSz0", name: "Ele Dallas Apartments",
    market: "Dallas", broaderArea: "East Dallas",
    district: null,
    geoNote: '5714 Richmond Ave, 75206. East Dallas from the coordinates and ZIP; NO source names a neighbourhood, and the catalog holds no location keywords and no submarket.',
    flags: [
      { field: "district", issue: "NOT RESOLVED. No location keywords, no submarket, no neighbourhood on file. 75206 covers Lower Greenville and the M Streets, and nothing on record chooses between them." },
      { field: "features", issue: "ZERO verified attributes on file. This record carries address, geography, website and rating only — it needs a Property Intelligence attribute pass." },
    ] },

  { pid: "ChIJbT3TRIcZTIYRJNMJcCVPXos", name: "Ferro",
    market: "Dallas", broaderArea: "North Dallas / Collin County", district: null,
    geoNote: 'City of Plano, Dallas market. 1005 11th St, 75074.',
    flags: [{ field: "district", issue: 'NOT RESOLVED. The keyword is "Downtown Plano WALKABLE community" — a walkability claim, not a statement that the property is in Downtown Plano. 11th St sits a few blocks south of the historic downtown grid. Flagged rather than asserted.' }] },

  { pid: "ChIJM8f3OgWfToYRhyF1DRfwIes", name: "Lantower Midtown",
    market: "Dallas", broaderArea: "North Dallas",
    district: 'The video stores the area as "Midtown". 10658 N Central Expy, 75231 — the same ZIP this library files under Vickery Meadow for The Sevens and under Midtown Park for Luxia. Recorded as stored; see the flag.',
    geoNote: "North Dallas along the Central Expressway corridor.",
    flags: [
      { field: "district", issue: 'The stored area "Midtown" is the management brand name. 75231 is the Vickery Meadow neighbourhood, and nearby properties in this library are filed under both "Vickery Meadow" and "Midtown Park". The catalog holds no submarket for this property.' },
      { field: "features", issue: "ZERO verified attributes on file. Needs a Property Intelligence attribute pass." },
    ] },

  { pid: "ChIJV9ae39iYToYR-5EcwPHd3Ac", name: "The Gabriella Apartments",
    market: "Dallas", broaderArea: "East Dallas",
    district: 'Old East Dallas / Bryan Place — 770 Cantegral St, 75204. Property Intelligence files the submarket as "Old East Dallas". Its own keywords also list Deep Ellum and Downtown Dallas, which are PROXIMITY, not location.',
    geoNote: "East Dallas, matching the EastEnder precedent for Old East Dallas addresses.",
    nameNote: 'The video says "The Gabriella Apartments"; the catalog\'s official name is "The Gabriella".',
    flags: [{ field: "buildingType", issue: 'Catalog inventory_type is "high-rise" but structural_scale is null and no source states a storey count. Recorded under structuralScale as evidence; buildingType left blank for confirmation.' }] },

  { pid: "ChIJ86vQq4zNRIYRv7kcI3w51Oo", name: "Solaris House",
    market: "Austin", broaderArea: "North Austin", district: null,
    geoNote: "2800 Solaris St, 78758 — North Austin, on the former IBM Broadmoor campus now developed as Uptown ATX.",
    nameNote: 'The video says "Solaris House"; the catalog\'s official name is "Solaris House at Uptown ATX".',
    flags: [
      { field: "district", issue: 'NOT RESOLVED, and THE DOMAIN IS CONTRADICTED. The keyword reads "NEXT DOOR TO The Domain" — explicitly adjacency, not location, so Domain must not be used. "Uptown ATX" appears in the property\'s own official name and is the likely district, but no source on file states it as the neighbourhood.' },
      { field: "buildingType", issue: 'Catalog structural_scale is "High-Rise", an exact match for one of the six values, but the column carries no verification stamp. Recorded under structuralScale; buildingType left blank for confirmation.' },
    ] },

  { pid: "ChIJMbEDSMKYToYRdSgdisWUcoo", name: "The Case Bldg",
    market: "Dallas", broaderArea: "Deep Ellum",
    district: "3131 Main St, 75226 — on Deep Ellum's Main Street spine, at the Exposition Park edge.",
    geoNote: 'Deep Ellum is already a canonical Dallas area in this library — the Hamilton precedent. The video stores "Deep Ellum" and the address agrees.',
    flags: [
      { field: "features", issue: "ZERO verified attributes on file. Needs a Property Intelligence attribute pass." },
      { field: "buildingType", issue: "The video's Unit Type is High-Rise, but a Unit Type is not a building classification and the catalog holds no structural_scale, inventory_type or storey count. Left blank." },
    ] },

  { pid: "ChIJ_5pPZfHBQIYR7rFTwZs8C_w", name: "Crimson Luxury Apartment Homes",
    market: "Houston", broaderArea: "Inner Loop West",
    district: 'RIVER OAKS — 2220 Westcreek Ln, 77027, at the River Oaks District. Property Intelligence files the submarket as "Inner Loop West & Greenway"; the video stores "River Oaks".',
    geoNote: "Inner Loop West, matching the NOVEL River Oaks precedent for this part of Houston.",
    nameNote: 'The video says "Crimson Luxury Apartment Homes"; the catalog\'s official name is "Crimson". Managed by Gables Residential.',
    flags: [
      { field: "features", issue: "EIGHT of the nine verified features are PENTHOUSES ONLY (skyline views, high ceilings, private terrace, wet bar, wine rack, built-in desk, media room, den). Only the infinity pool is property-wide. Nothing from the penthouse collection may be advertised as a community feature." },
      { field: "buildingType", issue: 'Catalog structural_scale AND inventory_type both read High-Rise, agreeing with each other, but neither column carries a verification stamp. Recorded under structuralScale; buildingType left blank for confirmation.' },
    ] },
]

// ── RULE 5: every attribute key needs a human label, or the run aborts ──────────────────────
// These are literal renamings of the attribute key. They add no adjective the source did not use.
const LABELS: Record<string, string> = {
  abundant_natural_light: "Abundant natural light",
  attached_garage: "Attached garage",
  built_in_bar: "Built-in bar",
  built_in_desk: "Built-in desk",
  built_in_shelving: "Built-in shelving",
  built_in_wine_rack: "Built-in wine rack",
  butlers_pantry: "Butler's pantry",
  carpet_in_bedrooms: "Carpet in bedrooms",
  custom_closet: "Custom closet",
  den_study_workspace: "Den / study workspace",
  double_vanity: "Double vanity",
  floor_to_ceiling_windows: "Floor-to-ceiling windows",
  freestanding_tub: "Freestanding tub",
  french_door_refrigerator: "French-door refrigerator",
  gas_range: "Gas range",
  glass_enclosed_shower: "Glass-enclosed shower",
  golf_simulator: "Golf simulator",
  hardwood_flooring: "Hardwood flooring",
  high_ceilings: "High ceilings",
  infinity_pool: "Infinity pool",
  interior_corridor: "Interior corridors",
  kitchen_island: "Kitchen island",
  large_oversized_windows: "Oversized windows",
  manual_roller_shades: "Manual roller shades",
  media_room: "Media room",
  mudroom: "Mud room",
  open_loft_layout: "Open loft-style layout",
  oversized_walk_in_closet: "Oversized walk-in closet",
  private_yard: "Private yard or terrace",
  rainfall_showerhead: "Rainfall showerhead",
  recessed_lighting: "Recessed lighting",
  single_basin_sink: "Single-basin sink",
  skyline_views: "Skyline views",
  soaking_tub: "Soaking tub",
  stainless_appliances: "Stainless steel appliances",
  statement_lighting: "Statement lighting",
  tile_flooring: "Tile flooring",
  tub_shower_combo: "Tub and shower combination",
  under_cabinet_lighting: "Under-cabinet lighting",
  undermount_sink: "Undermount sink",
  walk_in_closet: "Walk-in closet",
  walk_in_shower: "Walk-in shower",
  wet_bar: "Wet bar",
  wine_beverage_refrigerator: "Wine and beverage refrigerator",
  wood_style_plank: "Wood-style plank flooring",
  vaulted_ceilings: "Vaulted ceilings",
  polished_concrete: "Polished concrete floors",
  exposed_brick: "Exposed brick",
  historic_conversion: "Historic conversion",
  frameless_glass_shower: "Frameless glass shower",
  hardware_matte_black: "Matte black hardware",
  induction_cooktop: "Induction cooktop",
  double_oven: "Double oven",
}

/** Shared facilities rather than in-unit finishes. Everything else stays an interior feature. */
const COMMUNITY = new Set(["infinity_pool", "golf_simulator", "interior_corridor"])
/** The source records these without saying whether they are in-unit or shared. Say so. */
const AMBIGUOUS = new Set(["media_room", "built_in_bar"])

const label = (key: string): string => {
  const l = LABELS[key]
  if (!l) throw new Error(`NO LABEL for attribute key "${key}" — refusing to write a raw key into research. Add it to LABELS.`)
  return AMBIGUOUS.has(key) ? `${l} (the source does not state in-unit or shared)` : l
}

const money = (n: number) => `$${n.toLocaleString("en-US")}`
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : V)

type CatRow = Record<string, unknown>
type AttrRow = { attribute_key: string; applicability: string | null; verification_status: string | null; source_reference: string | null; checked_at: string | null }
type PlanRow = { name: string | null; beds: number | null; baths: number | null; sqft_min: number | null; sqft_max: number | null; starting_rent: number | null; is_loft: boolean | null; is_townhome: boolean | null; is_penthouse: boolean | null; checked_at: string | null; source_reference: string | null; verification_status: string | null }

async function build(p: Policy) {
  const { data: cat, error: ce } = await sb.from("property_catalog").select("*").eq("place_id", p.pid).maybeSingle()
  if (ce) throw new Error(`catalog read failed for ${p.name}: ${ce.message}`)
  if (!cat) throw new Error(`REFUSING ${p.name}: no property_catalog row. Identity cannot be verified from internal data.`)
  const c = cat as CatRow

  const { data: attrsRaw, error: ae } = await sb.from("property_attributes")
    .select("attribute_key, applicability, verification_status, source_reference, checked_at").eq("place_id", p.pid)
  if (ae) throw new Error(`attributes read failed for ${p.name}: ${ae.message}`)
  // VERIFIED ONLY. An unverified attribute is not evidence.
  const attrs = ((attrsRaw ?? []) as AttrRow[]).filter((a) => a.verification_status === "verified")

  const { data: plansRaw, error: pe } = await sb.from("property_floor_plans")
    .select("name, beds, baths, sqft_min, sqft_max, starting_rent, is_loft, is_townhome, is_penthouse, checked_at, source_reference, verification_status")
    .eq("place_id", p.pid)
  if (pe) throw new Error(`floor plan read failed for ${p.name}: ${pe.message}`)
  const plans = ((plansRaw ?? []) as PlanRow[]).filter((x) => x.verification_status === "verified")

  const pick = (app: string) => attrs.filter((a) => (a.applicability ?? "property_wide") === app).map((a) => a.attribute_key)
  const wide = pick("property_wide")
  const interior = wide.filter((k) => !COMMUNITY.has(k)).map(label)
  const community = wide.filter((k) => COMMUNITY.has(k)).map(label)
  const selectUnits = pick("select_units").map((k) => `SELECT UNITS ONLY — ${label(k)}`)
  const penthouse = pick("penthouses").map((k) => `PENTHOUSES ONLY — ${label(k)}`)

  const website = (c.website_url as string | null) ?? null
  const attrSrc = attrs[0]?.source_reference ?? website
  const attrDay = day(attrs[0]?.checked_at ?? null)

  const stable: Record<string, Json> = {
    address: c.address as string,
    city: c.city as string,
    officialWebsite: website,
    geography: {
      market: p.market,
      city: c.city as string,
      broaderArea: p.broaderArea,
      district: p.district,
      note: p.geoNote,
      verifiedAt: V,
      sources: ["internal:property_catalog (address, city, ZIP, coordinates, location_keywords, submarket)"],
    },
  }
  if (typeof c.google_rating === "number") {
    stable.googleRating = `${c.google_rating} from ${c.google_review_count ?? "?"} Google reviews (as recorded by Property Intelligence)`
  }
  if (typeof c.year_built === "number") stable.yearBuilt = String(c.year_built)
  if (p.nameNote) {
    stable.names = { onVideo: p.name, official: (c.property_name as string) ?? p.name, note: p.nameNote }
  }
  // RULE 2 — the raw internal classification, labelled as such. NOT buildingType.
  const scale = (c.structural_scale as string | null) ?? null
  const inv = (c.inventory_type as string | null) ?? null
  if (scale || inv) {
    stable.structuralScale = `Property Intelligence classification${scale ? ` structural_scale="${scale}"` : ""}${inv ? ` inventory_type="${inv}"` : ""}. INTERNAL CLASSIFICATION, NOT A VERIFIED STOREY COUNT — stories is null and confidence_status is unset. Building Type is deliberately left blank.`
  }
  if (interior.length) stable.interiorFeatures = interior
  if (community.length) stable.communityAmenities = community
  if (selectUnits.length) stable.selectUnitFeatures = selectUnits
  if (penthouse.length) stable.penthouseCollection = penthouse

  const pricing: Record<string, Json> = {}
  if (plans.length) {
    const sqft = (x: PlanRow) => (x.sqft_min && x.sqft_max && x.sqft_min !== x.sqft_max ? `${x.sqft_min}–${x.sqft_max}` : (x.sqft_min ?? null))
    stable.floorPlans = plans
      .slice()
      .sort((a, b) => (a.beds ?? 0) - (b.beds ?? 0) || (a.sqft_min ?? 0) - (b.sqft_min ?? 0))
      .map((x) => ({
        name: x.name,
        beds: x.beds === 0 ? "studio" : x.beds,
        baths: x.baths,
        sqft: sqft(x),
        // RULE 4 — an observation with its date, never a claim of present availability.
        price: x.starting_rent ? `${money(x.starting_rent)} — starting rent OBSERVED ${day(x.checked_at)}, not a current quote` : "not published per plan",
        note: `Verified against the official site on ${day(x.checked_at)} by Property Intelligence.`,
      })) as Json
    const beds = [...new Set(plans.map((x) => (x.beds === 0 ? "studio" : `${x.beds}-bedroom`)))]
    const sqs = plans.flatMap((x) => [x.sqft_min, x.sqft_max]).filter((n): n is number => typeof n === "number")
    stable.layouts = [
      `${plans.length} published plans: ${beds.join(", ")}`,
      `${Math.min(...sqs).toLocaleString()}–${Math.max(...sqs).toLocaleString()} sq ft across the published plans`,
    ]
    const rents = plans.map((x) => x.starting_rent).filter((n): n is number => typeof n === "number")
    if (rents.length) {
      pricing.overallRange = {
        value: `${money(Math.min(...rents))}–${money(Math.max(...rents))}`,
        status: "previously_recorded",
        sourceKind: "official",
        sourceUrl: plans[0].source_reference,
        verifiedAt: day(plans[0].checked_at),
        note: "Range across the property's own published starting rents as OBSERVED on that date. NOT a statement that any unit is available at these prices today — re-verify before advertising.",
      }
    }
  }

  const sources: Json[] = []
  if (website) {
    sources.push({ url: website, kind: "official", verifiedAt: attrDay,
      covers: ["address", "officialWebsite", ...(attrs.length ? ["interiorFeatures", "communityAmenities"] : []), ...(plans.length ? ["floorPlans", "pricing"] : [])],
      note: "The property's own site, as fetched and verified by Property Intelligence." })
  }
  sources.push({ url: `internal:property_catalog#${p.pid}`, kind: "internal", verifiedAt: day((c.intel_enriched_at as string | null) ?? null),
    covers: ["address", "city", "geography", "googleRating", ...(c.year_built ? ["yearBuilt"] : []), ...(scale || inv ? ["structuralScale"] : [])],
    note: "Lone Star Property Intelligence catalog row. READ ONLY — this script does not write to it." })
  if (attrs.length) {
    sources.push({ url: `internal:property_attributes#${p.pid}`, kind: "internal", verifiedAt: attrDay,
      covers: ["interiorFeatures", "communityAmenities", "selectUnitFeatures", "penthouseCollection"],
      note: `${attrs.length} verified attributes, each carrying its own applicability (${wide.length} property-wide, ${selectUnits.length} select-unit, ${penthouse.length} penthouses-only). Source: ${attrSrc}` })
  }
  if (plans.length) {
    sources.push({ url: `internal:property_floor_plans#${p.pid}`, kind: "internal", verifiedAt: day(plans[0].checked_at),
      covers: ["floorPlans", "layouts", "pricing"],
      note: `${plans.length} verified plans from the official site.` })
  }

  const unresolved: Json[] = (p.flags ?? []).map((f) => ({ field: f.field, issue: f.issue, raisedAt: V }))
  if (!stable.buildingType) {
    unresolved.push({ field: "buildingType", issue: "No Building Type written. The catalog's `stories` is null, so no source on file states the building's height or unit form.", raisedAt: V })
  }
  if (plans.length) {
    unresolved.push({ field: "pricing", issue: `Every rent here was observed on ${day(plans[0].checked_at)} and is recorded as previously_recorded. RE-VERIFY against the official site before any of it is advertised as current.`, raisedAt: V })
  } else {
    unresolved.push({ field: "floorPlans", issue: "No floor plans on file. Beds, baths, square footage and per-plan pricing are all unknown for this property.", raisedAt: V })
  }
  if (!stable.interiorFeatures && !stable.communityAmenities) {
    unresolved.push({ field: "interiorFeatures", issue: "No property-wide features on file, so this record states none. Nothing may be claimed about the interiors from this record.", raisedAt: V })
  }

  return {
    rec: { owner_user_id: OWNER, place_id: p.pid, property_name: p.name, stable, pricing, sources, unresolved },
    counts: { wide: wide.length, interior: interior.length, community: community.length, select: selectUnits.length, ph: penthouse.length, plans: plans.length, sources: sources.length, unresolved: unresolved.length },
  }
}

async function main() {
  // Refuse before doing anything if a held property ever appears in POLICY.
  for (const p of POLICY) {
    if (HELD[p.pid]) throw new Error(`POLICY contains a HELD property (${p.name}). Aborting without writing anything.`)
  }
  console.log(`${APPLY ? "APPLY" : "PREVIEW"} — ${POLICY.length} eligible, ${Object.keys(HELD).length} held\n`)
  const built = []
  for (const p of POLICY) built.push(await build(p))

  for (const b of built) {
    const c = b.counts
    console.log(`── ${b.rec.property_name}`)
    console.log(`   geography: ${JSON.stringify((b.rec.stable.geography as Record<string, unknown>).broaderArea)} / district=${(b.rec.stable.geography as Record<string, unknown>).district ? "set" : "NULL (flagged)"}`)
    console.log(`   features: ${c.interior} interior + ${c.community} community (property-wide) | ${c.select} select-unit | ${c.ph} penthouses-only`)
    console.log(`   plans: ${c.plans} | sources: ${c.sources} | unresolved: ${c.unresolved} | buildingType: ${b.rec.stable.buildingType ?? "BLANK"}`)
    console.log(`   stable keys: ${Object.keys(b.rec.stable).join(", ")}`)
  }
  console.log("\nHELD (nothing read, nothing written):")
  for (const [pid, why] of Object.entries(HELD)) console.log(`   ${why}`)

  if (!APPLY) { console.log("\nPREVIEW ONLY — nothing written. Re-run with --apply."); return }
  console.log("\nwriting…")
  await run(built.map((b) => b.rec))
}

main().catch((e) => { console.error(e); process.exit(1) })
