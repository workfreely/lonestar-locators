// READ-ONLY — what does Unleash Beast actually consume?
//
// For every client-profile signal, pairs it with its property_catalog counterpart,
// measures how populated that column is, and states whether the Unleash path reads it
// and whether it FILTERS, RANKS or only DISPLAYS.
//
// The read/filter/rank verdicts are derived from the code path, which is short:
//   DashboardClient -> activeClient = { id, city, desiredAreas }   <- THREE fields
//   BeastPropertyExplorer -> resolveDesiredAreaCenters -> searchNearby
//     -> enrichProperties -> assessLocationFit -> computeSuggestions
// assessLocationFit's ClientLocationContext is { id, city, desiredAreas }. `id` is
// explicitly documented as never used for location logic. So exactly TWO client
// fields can affect an Unleash outcome: city and desiredAreas.
//
// Usage: npx tsx scripts/matching/auditFitSignals.ts
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

type Row = { signal: string; clientField: string; propField: string; use: string; note: string }

/** use: FILTER | RANK | DISPLAY | NOT READ | NO FIELD */
const MATRIX: Row[] = [
  { signal: "Desired areas", clientField: "leads.neighborhoods + submarkets", propField: "location_keywords / neighborhood / location / address", use: "FILTER+RANK", note: "the ONLY signal that qualifies or orders anything" },
  { signal: "Market / city", clientField: "leads.city", propField: "city (via market centroid)", use: "FILTER", note: "picks centroids + the state guard" },
  { signal: "Latitude / longitude", clientField: "— none stored for the client", propField: "latitude / longitude", use: "FILTER", note: "property coords used for the 3 km radius; client has no coords at all" },
  { signal: "Budget", clientField: "leads.desired_rent", propField: "rent_min / rent_max / *_starting_rent", use: "NOT READ", note: "stored on both sides, consulted by nothing in Unleash" },
  { signal: "Beds", clientField: "leads.beds", propField: "beds_min / beds_max", use: "NOT READ", note: "" },
  { signal: "Baths", clientField: "leads.baths", propField: "baths_min / baths_max", use: "NOT READ", note: "" },
  { signal: "Move date / availability", clientField: "leads.move_date", propField: "has_live_pricing / pricing_last_verified", use: "NOT READ", note: "no availability-date column exists at all" },
  { signal: "Commute destination", clientField: "leads.commute_anchor_label / _place_id", propField: "latitude / longitude", use: "DISPLAY", note: "drive time computed for properties ALREADY in the pool; generates NO candidates" },
  { signal: "Property type", clientField: "leads.property_type", propField: "property_type / inventory_type / classification_tags", use: "NOT READ", note: "Places' includedPrimaryTypes gates apartment_complex/building, not the client's choice" },
  { signal: "Washer / dryer", clientField: "must_have_amenities (washer_dryer)", propField: "washer_dryer_included / washer_dryer_connections", use: "NOT READ", note: "" },
  { signal: "Private yard", clientField: "must_have_amenities (private_yard)", propField: "amenity_keywords only", use: "NOT READ", note: "no dedicated yard column" },
  { signal: "Garage", clientField: "must_have_amenities (attached/detached_garage)", propField: "amenity_keywords only", use: "NOT READ", note: "no dedicated garage column" },
  { signal: "First floor", clientField: "— NO client field", propField: "— NO property field", use: "NO FIELD", note: "stories exists, but no unit-level floor preference or availability" },
  { signal: "Pet requirements", clientField: "— NO client field", propField: "pets_allowed, breed_restrictions, pet_weight_limit, pet_fee, monthly_pet_rent…", use: "NO FIELD", note: "property side is rich; the CLIENT side does not collect pets at all" },
  { signal: "Specials / effective rent", clientField: "— (budget only)", propField: "current_special (+ *_checked_at/_source)", use: "DISPLAY", note: "rendered as a badge; never converted to an effective rent or compared to budget" },
  { signal: "Military fee waivers", clientField: "— NO client field", propField: "— NO property field", use: "NO FIELD", note: "application_fee / admin_fee / deposit_amount exist, but no military-waiver concept on either side" },
  { signal: "Approval criteria", clientField: "credit_score, credit_history, broken_lease_*, eviction_*, criminal_*", propField: "affordable_program, escort_required… (no credit_min)", use: "NOT READ", note: "LeadInsights scores these against a DIFFERENT table; Unleash reads none" },
  { signal: "Beast Sync / client notes", clientField: "leads.notes, locator_notes", propField: "—", use: "NOT READ", note: "free text; holds the locator's real shortlist and reasoning" },
]

async function main() {
  const rows: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await db.from("property_catalog").select("*").range(from, from + 999)
    if (error) throw new Error(error.message)
    const b = (data ?? []) as Record<string, unknown>[]
    rows.push(...b)
    if (b.length < 1000) break
    from += 1000
  }
  const n = rows.length
  const pop = (col: string) => {
    if (!(col in (rows[0] ?? {}))) return null
    return rows.filter((r) => {
      const v = r[col]
      return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)
    }).length
  }
  const pct = (c: number | null) => (c === null ? "no column" : `${c}/${n} (${((c / n) * 100).toFixed(0)}%)`)

  console.log("═".repeat(104))
  console.log("PROPERTY-SIDE POPULATION of every column the audit touches")
  console.log("═".repeat(104))
  const cols = [
    "location_keywords", "neighborhood", "location", "submarket", "address", "latitude", "longitude",
    "rent_min", "rent_max", "onebr_starting_rent", "twobr_starting_rent",
    "beds_min", "beds_max", "baths_min", "baths_max", "sqft_min", "sqft_max",
    "property_type", "inventory_type", "classification_tags", "stories",
    "washer_dryer_included", "washer_dryer_connections", "amenity_keywords",
    "pets_allowed", "breed_restrictions", "pet_weight_limit", "pet_fee", "monthly_pet_rent",
    "current_special", "current_special_checked_at",
    "application_fee", "admin_fee", "deposit_amount", "flexible_deposit_option",
    "affordable_program", "escort_required", "has_live_pricing", "pricing_last_verified",
    "minimum_lease_term", "short_term_lease_available", "year_built",
  ]
  for (const c of cols) {
    const p = pop(c)
    const bar = p === null ? "" : "█".repeat(Math.round(((p / n) * 28)))
    console.log(`  ${c.padEnd(28)} ${pct(p).padEnd(20)} ${bar}`)
  }

  console.log(`\n${"═".repeat(104)}`)
  console.log("THE SIGNAL MATRIX — what Unleash Beast reads")
  console.log("═".repeat(104))
  console.log(`  ${"signal".padEnd(26)}${"use".padEnd(13)}property-side population`)
  console.log(`  ${"-".repeat(100)}`)
  const PRIMARY: Record<string, string[]> = {
    "Desired areas": ["location_keywords", "neighborhood", "location"],
    "Market / city": ["address"],
    "Latitude / longitude": ["latitude"],
    Budget: ["rent_min", "twobr_starting_rent"],
    Beds: ["beds_min"],
    Baths: ["baths_min"],
    "Move date / availability": ["has_live_pricing", "pricing_last_verified"],
    "Commute destination": ["latitude"],
    "Property type": ["property_type", "inventory_type"],
    "Washer / dryer": ["washer_dryer_included", "washer_dryer_connections"],
    "Private yard": ["amenity_keywords"],
    Garage: ["amenity_keywords"],
    "First floor": ["stories"],
    "Pet requirements": ["pets_allowed"],
    "Specials / effective rent": ["current_special"],
    "Military fee waivers": ["application_fee", "admin_fee"],
    "Approval criteria": ["affordable_program"],
    "Beast Sync / client notes": [],
  }
  for (const r of MATRIX) {
    const cs = PRIMARY[r.signal] ?? []
    const popStr = cs.length ? cs.map((c) => `${c} ${pct(pop(c))}`).join(" · ") : "—"
    console.log(`  ${r.signal.padEnd(26)}${r.use.padEnd(13)}${popStr}`)
    if (r.note) console.log(`  ${"".padEnd(26)}${"".padEnd(13)}↳ ${r.note}`)
  }

  console.log(`\n${"═".repeat(104)}`)
  console.log("SUMMARY")
  console.log("═".repeat(104))
  const by = (u: string) => MATRIX.filter((r) => r.use.startsWith(u)).length
  console.log(`  signals that FILTER or RANK          ${MATRIX.filter((r) => /FILTER|RANK/.test(r.use)).length}  (all three are location/geography)`)
  console.log(`  signals that only DISPLAY            ${by("DISPLAY")}`)
  console.log(`  signals STORED BUT NOT READ          ${by("NOT READ")}`)
  console.log(`  signals with NO FIELD on one side    ${by("NO FIELD")}`)
  console.log(`\n  Unleash receives exactly 3 client fields ({id, city, desiredAreas}) and \`id\` is`)
  console.log(`  documented as never used for location logic — so TWO client fields can change an`)
  console.log(`  Unleash outcome. Every other signal above is inert on this surface.`)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
