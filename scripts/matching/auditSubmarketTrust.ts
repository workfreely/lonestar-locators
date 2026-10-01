// READ-ONLY — is property_catalog.submarket trustworthy enough to feed matching?
//
// WIRES NOTHING. `submarket` is populated on 706 rows and assessLocationFit does not
// read it. This measures whether it COULD, by the only standard that matters: does the
// value name a canonical area, and does the property's own position agree?
//
// The decisive test is the same two-factor rule the enrichment proposal uses — a claim
// plus geographic corroboration. For every row whose submarket matches a canonical
// area label for its market, measure the distance from that area's centroid. A
// trustworthy field agrees with the coordinates; an untrustworthy one does not.
//
// Usage: npx tsx scripts/matching/auditSubmarketTrust.ts
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { MARKETS, centerForDesiredArea, getMarketByName } from "@/lib/markets/catalog"
import { acceptedSpellings } from "@/lib/propertyExplorer/areaAliases"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()

function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

type Row = {
  place_id: string | null; property_name: string | null; city: string | null
  submarket: string | null; latitude: number | null; longitude: number | null
  location_keywords: string[] | null; source: string | null; intel_enriched_at: string | null
}

async function main() {
  const rows: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await db.from("property_catalog")
      .select("place_id,property_name,city,submarket,latitude,longitude,location_keywords,source,intel_enriched_at")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    const b = (data ?? []) as Row[]
    rows.push(...b)
    if (b.length < 1000) break
    from += 1000
  }
  const withSub = rows.filter((r) => r.submarket && r.submarket.trim())

  console.log("═".repeat(98))
  console.log("1. PROVENANCE QUALITY")
  console.log("═".repeat(98))
  console.log(`  rows with submarket                  ${withSub.length} of ${rows.length}`)
  console.log(`  distinct values                      ${new Set(withSub.map((r) => norm(r.submarket!))).size}`)
  console.log(`  …carrying a \`source\`                 ${withSub.filter((r) => r.source).length}`)
  console.log(`  …carrying intel_enriched_at          ${withSub.filter((r) => r.intel_enriched_at).length}`)
  console.log(`\n  There is no per-field provenance anywhere in this table: source is null on`)
  console.log(`  4,197 of 4,202 rows, and source_type / confidence_status / verification_notes`)
  console.log(`  are 100% null. So nothing records WHERE a submarket value came from or how it`)
  console.log(`  was verified — the value has to be judged on its own content.`)

  console.log(`\n${"═".repeat(98)}`)
  console.log("2. CONSISTENCY WITH CURRENT AREA LABELS")
  console.log("═".repeat(98))
  let matchesLabel = 0, isCityName = 0, directionalOnly = 0, compound = 0, garbage = 0, unknown = 0
  const unknownSamples = new Map<string, number>()
  const cityNames = new Set(MARKETS.map((m) => norm(m.name)))
  const allRowCities = new Set(rows.map((r) => norm(r.city ?? "")).filter(Boolean))
  const DIRECTIONAL = /^(far )?(north|south|east|west|northeast|northwest|southeast|southwest|central|downtown|inner loop|outer)( \w+)?$/

  for (const r of withSub) {
    const v = norm(r.submarket!)
    const m = getMarketByName(r.city ?? "")
    const labels = m ? [...m.neighborhoods, ...m.submarkets] : []
    const accepted = new Set(labels.flatMap((l) => acceptedSpellings(l, m!.name)))

    if (v === "svg" || v.length < 3) { garbage++; continue }
    if (/[&]| - /.test(r.submarket!)) { compound++; continue }
    if (accepted.has(v)) { matchesLabel++; continue }
    if (cityNames.has(v) || allRowCities.has(v)) { isCityName++; continue }
    if (DIRECTIONAL.test(v)) { directionalOnly++; continue }
    unknown++
    unknownSamples.set(r.submarket!, (unknownSamples.get(r.submarket!) ?? 0) + 1)
  }
  const pct = (n: number) => `${((n / withSub.length) * 100).toFixed(1)}%`
  console.log(`  matches a canonical area label       ${String(matchesLabel).padStart(4)}  ${pct(matchesLabel)}   ← the only directly usable shape`)
  console.log(`  is a CITY name, not a submarket      ${String(isCityName).padStart(4)}  ${pct(isCityName)}`)
  console.log(`  directional only ("North", "Far West")${String(directionalOnly).padStart(3)}  ${pct(directionalOnly)}`)
  console.log(`  compound ("Montrose & Museum District")${String(compound).padStart(2)}  ${pct(compound)}`)
  console.log(`  garbage ("svg")                      ${String(garbage).padStart(4)}  ${pct(garbage)}`)
  console.log(`  unrecognised                         ${String(unknown).padStart(4)}  ${pct(unknown)}`)
  console.log(`\n  sample of unrecognised values:`)
  for (const [v, c] of [...unknownSamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`     ${String(c).padStart(3)}  "${v}"`)
  }

  console.log(`\n${"═".repeat(98)}`)
  console.log("3. CONFLICT RATE — does the value agree with the property's own coordinates?")
  console.log("═".repeat(98))
  let tested = 0, agree = 0, conflict = 0
  const conflicts: Array<{ name: string; city: string; sub: string; d: number }> = []
  for (const r of withSub) {
    const m = getMarketByName(r.city ?? "")
    if (!m || r.latitude == null || r.longitude == null) continue
    const v = norm(r.submarket!)
    // Only rows whose submarket names a canonical area can be tested at all.
    const label = [...m.neighborhoods, ...m.submarkets].find((l) => new Set(acceptedSpellings(l, m.name)).has(v))
    if (!label) continue
    const c = centerForDesiredArea(label, m.slug)
    if (!c) continue
    tested++
    const d = Math.round(metres(r.latitude, r.longitude, c.lat, c.lng))
    if (d <= 3000) agree++
    else { conflict++; conflicts.push({ name: r.property_name ?? "", city: m.name, sub: r.submarket!, d }) }
  }
  console.log(`  testable rows (submarket names a canonical area)   ${tested}`)
  console.log(`  coordinates AGREE (within the 3 km radius)         ${agree}  ${tested ? `${((agree / tested) * 100).toFixed(1)}%` : ""}`)
  console.log(`  coordinates CONFLICT                               ${conflict}  ${tested ? `${((conflict / tested) * 100).toFixed(1)}%` : ""}`)
  if (conflicts.length) {
    console.log(`\n  worst conflicts:`)
    for (const c of conflicts.sort((a, b) => b.d - a.d).slice(0, 10)) {
      console.log(`     ${c.name.slice(0, 40).padEnd(40)} ${c.city}  submarket "${c.sub}"  but ${(c.d / 1000).toFixed(1)} km away`)
    }
  }

  console.log(`\n${"═".repeat(98)}`)
  console.log("4. VERDICT — could submarket safely become a structured geography signal?")
  console.log("═".repeat(98))
  console.log(`  NOT AS IT STANDS. Only ${matchesLabel} of ${withSub.length} values (${pct(matchesLabel)}) even name a canonical`)
  console.log(`  area, and the field mixes four incompatible kinds of value in one column:`)
  console.log(`    • city names ("Plano", "Frisco", "San Marcos") — a market, not an area within one`)
  console.log(`    • directional regions ("North", "Far West") — no catalogued centroid, not a client option`)
  console.log(`    • compound values ("Montrose & Museum District", "Katy & Far West") — TWO areas in`)
  console.log(`      one string, which exact-equality matching cannot read, and which also appear`)
  console.log(`      with two different separators ("Katy & Far West" / "Katy - Far West")`)
  console.log(`    • literal garbage ("svg" on ${garbage} rows) — a scraping artefact`)
  console.log(`  It also duplicates itself: "Uptown Dallas" and "Uptown" are both present.`)
  console.log(`\n  COULD IT LATER? Yes, for the ${matchesLabel}-row subset that names a canonical area and`)
  console.log(`  whose coordinates agree — and those are exactly the rows the enrichment proposal`)
  console.log(`  already covers through location_keywords, which matching DOES read. So wiring`)
  console.log(`  submarket in would add a second pathway to the same outcome while importing the`)
  console.log(`  other ${withSub.length - matchesLabel} rows' problems. Recommendation: leave it unwired, and treat it as`)
  console.log(`  a CANDIDATE SOURCE for enrichment review rather than a matching input.`)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
