// READ-ONLY AUDIT — property_catalog location coverage.
//
// Prepared alongside the alias pass but DELIBERATELY NOT ACTING on anything: this
// measures the gap, it does not enrich. Nothing is written.
//
// Why it exists: the alias layer closed a SPELLING gap. What it cannot close is a
// DATA gap — a property with empty location_keywords carries no geography to compare
// at all, so it can only ever qualify through the rank-4 address-text fallback, which
// needs the area name to appear in the street address.
//
// Reports:
//   1. empty location_keywords, by market
//   2. neighborhood coverage (rank 1)
//   3. location coverage (rank 3)
//   4. properties whose NAME strongly indicates an area while structured geography is
//      missing — the highest-confidence enrichment candidates, because the evidence is
//      already in the row
//   5. coverage by market
//
// Usage: npx tsx scripts/matching/auditCatalogGeography.ts [--csv out.csv]
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

type Row = {
  place_id: string | null
  property_name: string | null
  city: string | null
  address: string | null
  neighborhood: string | null
  location: string | null
  location_keywords: string[] | null
  /** Catalog columns that hold geography but which assessLocationFit does NOT read. */
  submarket: string | null
  cross_streets: string | null
}

async function main() {
  const rows: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await db.from("property_catalog")
      .select("place_id,property_name,city,address,neighborhood,location,location_keywords,submarket,cross_streets")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    const b = (data ?? []) as Row[]
    rows.push(...b)
    if (b.length < 1000) break
    from += 1000
  }

  const hasKw = (r: Row) => (r.location_keywords?.length ?? 0) > 0
  console.log("═".repeat(100))
  console.log("1. OVERALL STRUCTURED-GEOGRAPHY COVERAGE")
  console.log("═".repeat(100))
  console.log(`  rows                                  ${rows.length}`)
  console.log(`  location_keywords non-empty           ${rows.filter(hasKw).length}  (${((rows.filter(hasKw).length / rows.length) * 100).toFixed(1)}%)`)
  console.log(`  location_keywords EMPTY               ${rows.filter((r) => !hasKw(r)).length}  (${((rows.filter((r) => !hasKw(r)).length / rows.length) * 100).toFixed(1)}%)`)
  console.log(`  neighborhood populated   (rank 1)     ${rows.filter((r) => r.neighborhood).length}  (${((rows.filter((r) => r.neighborhood).length / rows.length) * 100).toFixed(2)}%)`)
  console.log(`  location populated       (rank 3)     ${rows.filter((r) => r.location).length}  (${((rows.filter((r) => r.location).length / rows.length) * 100).toFixed(2)}%)`)
  console.log(`  NO structured geography at all        ${rows.filter((r) => !hasKw(r) && !r.neighborhood && !r.location).length}`)
  console.log(`\n  Ranks 1 and 3 are effectively unavailable to matching at these levels.`)
  console.log(`\n  GEOGRAPHY THE CATALOG HOLDS BUT MATCHING NEVER READS:`)
  console.log(`      submarket populated                  ${rows.filter((r) => r.submarket).length}`)
  console.log(`      cross_streets populated              ${rows.filter((r) => r.cross_streets).length}`)
  console.log(`      (assessLocationFit reads neighborhood, location, location_keywords and the`)
  console.log(`       address only — these two columns are invisible to it today.)`)

  // ── 5. Coverage by market ────────────────────────────────────────────────
  console.log(`\n${"═".repeat(100)}`)
  console.log("2. COVERAGE BY MARKET")
  console.log("═".repeat(100))
  console.log(`  ${"market".padEnd(20)}${"rows".padStart(6)}${"kw".padStart(7)}${"empty".padStart(8)}${"nbhd".padStart(7)}${"loc".padStart(6)}   searchable`)
  const byMarket = new Map<string, Row[]>()
  for (const r of rows) {
    const key = r.city ?? "(no city)"
    if (!byMarket.has(key)) byMarket.set(key, [])
    byMarket.get(key)!.push(r)
  }
  const searchable = new Set(MARKETS.filter((m) => [...m.neighborhoods, ...m.submarkets].some((o) => centerForDesiredArea(o, m.slug))).map((m) => norm(m.name)))
  for (const [city, rs] of [...byMarket.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const kw = rs.filter(hasKw).length
    console.log(`  ${city.slice(0, 19).padEnd(20)}${String(rs.length).padStart(6)}${String(kw).padStart(7)}${String(rs.length - kw).padStart(8)}`
      + `${String(rs.filter((r) => r.neighborhood).length).padStart(7)}${String(rs.filter((r) => r.location).length).padStart(6)}`
      + `   ${searchable.has(norm(city)) ? "yes" : "NO — no centroids"}`)
  }

  // ── 4. Name implies an area, structured geography missing ────────────────
  // Only areas that are SEARCHABLE matter: an enrichment that nothing can search is
  // not yet worth doing.
  console.log(`\n${"═".repeat(100)}`)
  console.log("3. HIGHEST-CONFIDENCE ENRICHMENT CANDIDATES")
  console.log("   (the property NAME contains a known area for its market, but that area is")
  console.log("    absent from its structured geography — the evidence is already in the row)")
  console.log("═".repeat(100))

  type Cand = { id: string; name: string; city: string; area: string; has: string }
  const cands: Cand[] = []
  for (const m of MARKETS) {
    const opts = [...m.neighborhoods, ...m.submarkets].filter((o) => centerForDesiredArea(o, m.slug))
    if (!opts.length) continue
    const mk = rows.filter((r) => norm(r.city ?? "") === norm(m.name))
    for (const r of mk) {
      const name = norm(r.property_name ?? "")
      if (!name) continue
      for (const o of opts) {
        // Match the area name as a WHOLE-WORD run inside the property name, so
        // "Southtown Flats" hits Southtown but "Oakwood" does not hit "Oak Lawn".
        const n = norm(o)
        if (n.length < 4) continue
        if (!new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(name)) continue
        // Would it ALREADY qualify for a client who chose this area?
        const accepted = new Set(acceptedSpellings(o, m.name))
        const kws = (r.location_keywords ?? []).map(norm)
        const already = kws.some((k) => accepted.has(k))
          || (r.neighborhood && accepted.has(norm(r.neighborhood)))
          || (r.location && accepted.has(norm(r.location)))
        if (already) continue
        cands.push({
          id: String(r.place_id ?? ""), name: r.property_name ?? "", city: m.name, area: o,
          has: kws.length ? `${kws.length} kw, none naming ${o}` : "EMPTY keywords",
        })
        break
      }
    }
  }
  console.log(`  ${cands.length} properties\n`)
  const byArea = new Map<string, Cand[]>()
  for (const c of cands) {
    const k = `${c.city} / ${c.area}`
    if (!byArea.has(k)) byArea.set(k, [])
    byArea.get(k)!.push(c)
  }
  for (const [area, list] of [...byArea.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ── ${area}  (${list.length}) ──`)
    for (const c of list.slice(0, 6)) console.log(`       ${c.name.slice(0, 48).padEnd(48)} ${c.has}`)
    if (list.length > 6) console.log(`       … and ${list.length - 6} more`)
  }

  // ── Empty-keyword rows in searchable markets ─────────────────────────────
  console.log(`\n${"═".repeat(100)}`)
  console.log("4. EMPTY location_keywords IN SEARCHABLE MARKETS (the rows matching cannot read)")
  console.log("═".repeat(100))
  let emptyTotal = 0
  for (const m of MARKETS) {
    if (!searchable.has(norm(m.name))) continue
    const mk = rows.filter((r) => norm(r.city ?? "") === norm(m.name))
    const empty = mk.filter((r) => !hasKw(r))
    emptyTotal += empty.length
    console.log(`  ${m.name.padEnd(16)} ${String(empty.length).padStart(4)} of ${String(mk.length).padStart(4)} rows empty  (${((empty.length / Math.max(mk.length, 1)) * 100).toFixed(0)}%)`)
  }
  console.log(`  ${"TOTAL".padEnd(16)} ${String(emptyTotal).padStart(4)}`)

  console.log(`\n${"═".repeat(100)}`)
  console.log("WHAT THIS DOES NOT DO")
  console.log("═".repeat(100))
  console.log("  Nothing here is written. Enrichment is a separate, approved pass:")
  console.log("  a property's name is strong evidence but not proof of its area, and the")
  console.log("  rank-1/rank-3 columns are nearly empty by choice, not by accident — filling")
  console.log("  them changes which tier a property qualifies in, which is a ranking decision.")

  const csvIdx = process.argv.indexOf("--csv")
  if (csvIdx > 0) {
    const out = ["id,city,area,property_name,current_state",
      ...cands.map((c) => `${c.id},"${c.city}","${c.area}","${c.name.replace(/"/g, '""')}","${c.has}"`)]
    writeFileSync(process.argv[csvIdx + 1], out.join("\n"))
    console.log(`\n  wrote ${process.argv[csvIdx + 1]} (${cands.length} rows)`)
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
