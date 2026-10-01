// AUDIT PART 2 — can each area label qualify AT ALL?
//
// READ-ONLY. The per-lead walk (auditQualifiedPools.ts) showed the funnel loses its
// properties at QUALIFICATION, not at candidate generation, and that the tier mix is
// lopsided: rank 2 (location_keywords) produced 38 of 52 live qualified matches while
// rank 1 (neighborhood) and rank 3 (location) produced ZERO.
//
// assessLocationFit matches a keyword by EXACT EQUALITY after normalisation —
// `clientAreas.includes(norm(keyword))` — so "Stone Oak Area" in the catalog does NOT
// satisfy a client who chose "Stone Oak". This measures, for every area label the form
// can produce, how many catalogued properties could ever match it.
//
// Usage: npx tsx scripts/matching/auditAreaCoverage.ts
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { MARKETS, centerForDesiredArea } from "@/lib/markets/catalog"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** The EXACT normaliser assessLocationFit uses. */
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()

type Row = { city: string | null; neighborhood: string | null; location: string | null; location_keywords: string[] | null }

async function main() {
  const rows: Row[] = []
  let from = 0
  for (;;) {
    const { data, error } = await db.from("property_catalog")
      .select("city,neighborhood,location,location_keywords").range(from, from + 999)
    if (error) throw new Error(error.message)
    const batch = (data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < 1000) break
    from += 1000
  }
  console.log(`property_catalog: ${rows.length} rows\n`)

  // Every distinct normalised keyword in the catalog, with its frequency.
  const kwCount = new Map<string, number>()
  for (const r of rows) for (const k of r.location_keywords ?? []) {
    const n = norm(k)
    if (n) kwCount.set(n, (kwCount.get(n) ?? 0) + 1)
  }
  console.log(`distinct normalised location_keywords: ${kwCount.size}`)
  console.log(`\nTOP 25 KEYWORDS BY FREQUENCY (what the catalog actually says):`)
  for (const [k, c] of [...kwCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`   ${String(c).padStart(5)}  ${k}`)
  }

  console.log(`\n${"═".repeat(94)}`)
  console.log("PER-AREA QUALIFICATION HEADROOM — can a client who picks this area match anything?")
  console.log("═".repeat(94))
  console.log("  exact   = catalogued properties whose keyword EQUALS the label (what rank 2 needs)")
  console.log("  partial = properties whose keyword merely CONTAINS/is contained by it (currently NO match)")
  console.log("")

  let deadLabels = 0, liveLabels = 0, rescuableLabels = 0
  for (const m of MARKETS) {
    const opts = [...m.neighborhoods, ...m.submarkets]
    if (!opts.length) continue
    const marketRows = rows.filter((r) => norm(r.city ?? "") === norm(m.name))
    // Only the five markets with centroids can search at all.
    const anyCentroid = opts.some((o) => centerForDesiredArea(o, m.slug))
    console.log(`── ${m.name}  (${marketRows.length} catalogued rows${anyCentroid ? "" : ", NO CENTROIDS — cannot search"}) ──`)
    for (const o of opts) {
      const n = norm(o)
      let exact = 0, partial = 0
      for (const r of marketRows) {
        const kws = (r.location_keywords ?? []).map(norm)
        if (kws.includes(n)) exact++
        else if (kws.some((k) => k && (k.includes(n) || n.includes(k)))) partial++
      }
      const resolves = !!centerForDesiredArea(o, m.slug)
      const verdict = !resolves ? "no centroid" : exact === 0 ? (partial > 0 ? "DEAD (rescuable)" : "DEAD") : exact < 6 ? "thin" : "ok"
      if (resolves) {
        if (exact === 0 && partial > 0) rescuableLabels++
        else if (exact === 0) deadLabels++
        else liveLabels++
      }
      console.log(`   ${o.padEnd(30)} exact ${String(exact).padStart(4)}   partial ${String(partial).padStart(4)}   ${verdict}`)
    }
    console.log("")
  }

  console.log("═".repeat(94))
  console.log("SUMMARY — searchable markets only (the 5 with centroids)")
  console.log("═".repeat(94))
  console.log(`  labels that CAN produce a rank-2 match           ${liveLabels}`)
  console.log(`  labels with ZERO exact keywords but some partial ${rescuableLabels}   <- an alias layer would help these`)
  console.log(`  labels with no keyword coverage of any kind      ${deadLabels}   <- an alias layer CANNOT help these`)
  console.log(`\n  Rank 1 and rank 3 are effectively unavailable: of ${rows.length} catalogued rows,`)
  console.log(`  neighborhood is populated on ${rows.filter((r) => r.neighborhood).length} and location on ${rows.filter((r) => r.location).length}.`)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
