// PROPOSAL GENERATOR — structured geography for property_catalog. READ-ONLY.
//
// WRITES NOTHING. Produces a reviewable proposal, one row per proposed addition, with
// the exact evidence behind it.
//
// THE EVIDENCE RULE — two independent factors, both required:
//
//   1. NAME CLAIM. The property's own name contains a canonical area label for its
//      market, as a whole word ("Southtown Flats" claims Southtown; "Oakwood" does
//      not claim Oak Lawn).
//   2. GEOGRAPHIC CORROBORATION. The property's own latitude/longitude lies within
//      the Unleash search radius (3 km) of that area's catalogued centroid.
//
// Why both. A name alone is marketing: "Domain at Midtown Park" in Dallas contains
// "Domain", which is an AUSTIN area, and plenty of complexes are named after a
// district they merely advertise. Coordinates alone are proximity, which this project
// has repeatedly established is NOT membership. Together they are a membership claim
// the property makes about itself, confirmed by where it actually is — and both facts
// are already in the row, so nothing is fabricated or fetched.
//
// A name claim that FAILS corroboration is reported separately as REJECTED, with the
// measured distance, so the false positives are visible rather than silently dropped.
//
// WHAT IT PROPOSES TO WRITE: `location_keywords` only — appending the canonical label.
// Deliberately NOT `neighborhood` (rank 1) or `location` (rank 3): those are STRONGER
// and WEAKER tiers, so filling them would move properties between tiers and reorder
// results, which is a ranking change. Appending the keyword lands every newly
// qualified property at rank 2, exactly where exact and aliased keyword matches
// already sit — so the pool grows without the ordering changing.
//
// Usage: npx tsx scripts/matching/proposeGeographyEnrichment.ts [--csv out.csv] [--json out.json]
import { readFileSync, writeFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { MARKETS, centerForDesiredArea } from "@/lib/markets/catalog"
import { acceptedSpellings } from "@/lib/propertyExplorer/areaAliases"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()

/** The radius Unleash itself searches. Beyond it, a name claim is not corroborated. */
const RADIUS_M = 3000

function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type Row = {
  place_id: string | null
  property_name: string | null
  city: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  neighborhood: string | null
  location: string | null
  location_keywords: string[] | null
  submarket: string | null
  source: string | null
}

export type Proposal = {
  placeId: string
  propertyName: string
  city: string
  area: string
  /** What we would append to location_keywords. */
  addKeyword: string
  distanceM: number
  evidence: string
  /** Existing keywords, for conflict review. */
  existingKeywords: string[]
  /** True when the field is empty — the only case written without review. */
  fieldWasEmpty: boolean
  /** Surfaced for review rather than written. */
  conflict: string | null
}

export async function loadCatalog(): Promise<Row[]> {
  const rows: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await db.from("property_catalog")
      .select("place_id,property_name,city,address,latitude,longitude,neighborhood,location,location_keywords,submarket,source")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    const b = (data ?? []) as Row[]
    rows.push(...b)
    if (b.length < 1000) break
    from += 1000
  }
  return rows
}

export function buildProposals(rows: Row[]) {
  const accepted: Proposal[] = []
  const rejected: Array<{ name: string; city: string; area: string; distanceM: number | null; why: string }> = []

  for (const m of MARKETS) {
    const areas = [...m.neighborhoods, ...m.submarkets]
      .map((label) => ({ label, c: centerForDesiredArea(label, m.slug) }))
      .filter((a): a is { label: string; c: { lat: number; lng: number } } => !!a.c)
    if (!areas.length) continue
    const mk = rows.filter((r) => norm(r.city ?? "") === norm(m.name))

    for (const r of mk) {
      const name = norm(r.property_name ?? "")
      if (!name || !r.place_id) continue

      for (const { label, c } of areas) {
        const n = norm(label)
        if (n.length < 4) continue
        // FACTOR 1 — whole-word name claim.
        if (!new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(name)) continue

        // Already satisfied? Then there is nothing to add.
        const acceptedSp = new Set(acceptedSpellings(label, m.name))
        const kws = (r.location_keywords ?? []).map(norm)
        if (kws.some((k) => acceptedSp.has(k))) break
        if (r.neighborhood && acceptedSp.has(norm(r.neighborhood))) break
        if (r.location && acceptedSp.has(norm(r.location))) break

        // RANKING NEUTRALITY. If the property ALREADY qualifies for this area through
        // the rank-4 address-text fallback, adding a keyword would promote it from
        // rank 4 to rank 2 — a tier change, which reorders results. Measured on the
        // live leads: 3 such promotions, changing the starred order for 2 leads. So
        // these are excluded. Enrich only what currently carries NO signal for the
        // area; a property that already matches keeps matching exactly as it does now.
        const addr = norm(r.address ?? "")
        if (n.length >= 4 && addr.includes(n)) {
          rejected.push({ name: r.property_name ?? "", city: m.name, area: label, distanceM: null,
            why: `already qualifies at rank 4 (its address names ${label}) — enriching would PROMOTE it to rank 2 and reorder results` })
          break
        }

        // FACTOR 2 — geographic corroboration from the row's own coordinates.
        if (r.latitude == null || r.longitude == null) {
          rejected.push({ name: r.property_name ?? "", city: m.name, area: label, distanceM: null,
            why: "name claims the area but the row has no coordinates to corroborate it" })
          break
        }
        const d = Math.round(metres(r.latitude, r.longitude, c.lat, c.lng))
        if (d > RADIUS_M) {
          rejected.push({ name: r.property_name ?? "", city: m.name, area: label, distanceM: d,
            why: `name claims the area but sits ${(d / 1000).toFixed(1)} km from its centroid — marketing name, not geography` })
          break
        }

        accepted.push({
          placeId: r.place_id,
          propertyName: r.property_name ?? "",
          city: m.name,
          area: label,
          addKeyword: label,
          distanceM: d,
          evidence: `property name contains "${label}" AND coordinates are ${d} m from the "${label}" centroid (within the ${RADIUS_M} m Unleash radius)`,
          existingKeywords: r.location_keywords ?? [],
          fieldWasEmpty: (r.location_keywords?.length ?? 0) === 0,
          // A conflict is any existing keyword naming a DIFFERENT catalogued area.
          conflict: (() => {
            const others = areas.filter((a) => norm(a.label) !== n)
            const clash = kws.find((k) => others.some((a) => new Set(acceptedSpellings(a.label, m.name)).has(k)))
            return clash ? `already carries "${clash}", which names a different area — review before writing` : null
          })(),
        })
        break
      }
    }
  }
  return { accepted, rejected }
}

async function main() {
  const rows = await loadCatalog()
  const { accepted, rejected } = buildProposals(rows)

  console.log("═".repeat(100))
  console.log("COVERAGE (the gap this proposal addresses)")
  console.log("═".repeat(100))
  const hasKw = (r: Row) => (r.location_keywords?.length ?? 0) > 0
  console.log(`  rows                                       ${rows.length}`)
  console.log(`  missing location_keywords                  ${rows.filter((r) => !hasKw(r)).length}`)
  console.log(`  missing ALL structured geography            ${rows.filter((r) => !hasKw(r) && !r.neighborhood && !r.location).length}`)
  console.log(`  neighborhood populated (rank 1)            ${rows.filter((r) => r.neighborhood).length}`)
  console.log(`  location populated (rank 3)                ${rows.filter((r) => r.location).length}`)

  console.log(`\n${"═".repeat(100)}`)
  console.log("PROPOSED ADDITIONS — by market, then area")
  console.log("═".repeat(100))
  const byMarket = new Map<string, Proposal[]>()
  for (const p of accepted) {
    if (!byMarket.has(p.city)) byMarket.set(p.city, [])
    byMarket.get(p.city)!.push(p)
  }
  for (const [city, list] of [...byMarket.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n── ${city}  (${list.length} proposed) ──`)
    const byArea = new Map<string, Proposal[]>()
    for (const p of list) {
      if (!byArea.has(p.area)) byArea.set(p.area, [])
      byArea.get(p.area)!.push(p)
    }
    for (const [area, ps] of [...byArea.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const empty = ps.filter((p) => p.fieldWasEmpty).length
      const conf = ps.filter((p) => p.conflict).length
      console.log(`   ${area.padEnd(26)} ${String(ps.length).padStart(3)} properties   (${empty} with EMPTY keywords, ${ps.length - empty} appending, ${conf} conflicts)`)
    }
  }

  console.log(`\n${"═".repeat(100)}`)
  console.log("REJECTED BY THE CORROBORATION TEST — name claims an area it is not in")
  console.log("═".repeat(100))
  console.log(`  ${rejected.length} rejected\n`)
  for (const r of rejected.sort((a, b) => (b.distanceM ?? 0) - (a.distanceM ?? 0)).slice(0, 20)) {
    console.log(`  ✗ ${r.name.slice(0, 44).padEnd(44)} ${r.city}/${r.area.padEnd(22)} ${r.distanceM == null ? "no coords" : `${(r.distanceM / 1000).toFixed(1)} km`}`)
  }
  if (rejected.length > 20) console.log(`  … and ${rejected.length - 20} more`)

  console.log(`\n${"═".repeat(100)}`)
  console.log("CONFLICTS — surfaced for review, NOT written")
  console.log("═".repeat(100))
  const conflicts = accepted.filter((p) => p.conflict)
  console.log(`  ${conflicts.length} conflicts`)
  for (const p of conflicts.slice(0, 15)) {
    console.log(`  ! ${p.propertyName.slice(0, 40).padEnd(40)} → ${p.area.padEnd(20)} ${p.conflict}`)
  }

  console.log(`\n${"═".repeat(100)}`)
  console.log("SUMMARY")
  console.log("═".repeat(100))
  console.log(`  proposed additions (corroborated)          ${accepted.length}`)
  console.log(`      …into an EMPTY location_keywords        ${accepted.filter((p) => p.fieldWasEmpty).length}  ← fill, no review needed`)
  console.log(`      …appending to existing keywords        ${accepted.filter((p) => !p.fieldWasEmpty && !p.conflict).length}  ← additive, existing values untouched`)
  console.log(`      …carrying a conflict                   ${conflicts.length}  ← HOLD for review`)
  console.log(`  rejected by corroboration                 ${rejected.length}`)
  console.log(`\n  Field written: location_keywords ONLY (append). neighborhood and location are`)
  console.log(`  deliberately untouched — they are different TIERS, and moving a property between`)
  console.log(`  tiers would reorder results.`)

  const csvIdx = process.argv.indexOf("--csv")
  if (csvIdx > 0) {
    const out = ["place_id,city,area,property_name,add_keyword,distance_m,field_was_empty,conflict,evidence",
      ...accepted.map((p) => [p.placeId, p.city, p.area, `"${p.propertyName.replace(/"/g, '""')}"`,
        p.addKeyword, p.distanceM, p.fieldWasEmpty, `"${p.conflict ?? ""}"`, `"${p.evidence}"`].join(","))]
    writeFileSync(process.argv[csvIdx + 1], out.join("\n"))
    console.log(`\n  wrote ${process.argv[csvIdx + 1]}`)
  }
  const jsonIdx = process.argv.indexOf("--json")
  if (jsonIdx > 0) {
    writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ accepted, rejected }, null, 2))
    console.log(`  wrote ${process.argv[jsonIdx + 1]}`)
  }
}

if (process.argv[1]?.includes("proposeGeographyEnrichment")) {
  main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
}
