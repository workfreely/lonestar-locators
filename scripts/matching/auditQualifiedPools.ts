// AUDIT — why live leads still produce small or zero qualified pools.
//
// READ-ONLY. Changes nothing, writes nothing, and does not touch the algorithm.
//
// This runs the REAL pipeline for every live lead that has at least one saved area:
//
//   composeDesiredAreas  ->  centerForDesiredArea (per label)  ->  searchNearby
//     ->  merge/dedupe by place id  ->  property_catalog ENRICHMENT
//     ->  assessLocationFit  ->  computeSuggestions
//
// WHY THE ENRICHMENT STEP MATTERS. assessLocationFit has two independent paths:
// a STRUCTURED one (ranks 1-3: neighborhood / location keyword / broad location,
// all read from property_catalog) and an ADDRESS-TEXT fallback (rank 4). Only
// catalogued properties can take the structured path. scripts/matching/runFixtures.ts
// does NOT enrich, so every number it has ever reported was rank-4-only — the
// fixture pools were a FLOOR, not the real pool. This script closes that gap, which
// is itself one of the audit's findings.
//
// Usage: npx tsx scripts/matching/auditQualifiedPools.ts [--json out.json]
import { readFileSync, writeFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { composeDesiredAreas, resolveDesiredAreaCenters, MAX_UNLEASH_AREAS } from "@/lib/propertyExplorer/multiArea"
import { centerForDesiredArea, getMarketByName, isInsideState, MARKETS } from "@/lib/markets/catalog"
import { assessLocationFit } from "@/lib/propertyExplorer/locationFit"
import { computeSuggestions, MAX_SUGGESTIONS } from "@/lib/propertyExplorer/suggestions"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const KEY = process.env.GOOGLE_PLACES_API_KEY!
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()

/** The same parameters the explorer sends — only the transport differs. */
async function searchNearby(lat: number, lng: number) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 3000 } },
      includedPrimaryTypes: ["apartment_complex", "apartment_building"],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
    }),
  })
  if (!res.ok) throw new Error(`searchNearby ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return ((await res.json()).places ?? []) as Array<{
    id: string; displayName?: { text?: string }; formattedAddress?: string
    location?: { latitude: number; longitude: number }
  }>
}

type CatalogRow = { place_id: string | null; neighborhood: string | null; location: string | null; location_keywords: string[] | null }

async function loadCatalog(): Promise<Map<string, CatalogRow>> {
  const byPlace = new Map<string, CatalogRow>()
  let from = 0
  for (;;) {
    const { data, error } = await db.from("property_catalog")
      .select("place_id,neighborhood,location,location_keywords").range(from, from + 999)
    if (error) throw new Error(`property_catalog: ${error.message}`)
    const rows = (data ?? []) as CatalogRow[]
    for (const r of rows) if (r.place_id) byPlace.set(r.place_id, r)
    if (rows.length < 1000) break
    from += 1000
  }
  return byPlace
}

type AreaVerdict = { label: string; resolves: boolean; inCurrentForm: boolean; qualifiedVia: number }

async function main() {
  const catalog = await loadCatalog()
  const withGeo = [...catalog.values()].filter((r) => r.neighborhood || r.location || (r.location_keywords?.length ?? 0) > 0)
  console.log("═".repeat(96))
  console.log("CATALOG COVERAGE (the structured path's fuel)")
  console.log("═".repeat(96))
  console.log(`  property_catalog rows with a place_id      ${catalog.size}`)
  console.log(`  …carrying ANY structured geography          ${withGeo.length}  (${((withGeo.length / Math.max(catalog.size, 1)) * 100).toFixed(1)}%)`)
  console.log(`      neighborhood populated                 ${[...catalog.values()].filter((r) => r.neighborhood).length}`)
  console.log(`      location populated                     ${[...catalog.values()].filter((r) => r.location).length}`)
  console.log(`      location_keywords non-empty            ${[...catalog.values()].filter((r) => (r.location_keywords?.length ?? 0) > 0).length}`)

  // ── Form-label vs centroid coverage, per market ───────────────────────────
  console.log(`\n${"═".repeat(96)}`)
  console.log("CENTROID COVERAGE OF THE CURRENT FORM LABELS")
  console.log("═".repeat(96))
  for (const m of MARKETS) {
    const opts = [...m.neighborhoods, ...m.submarkets]
    if (!opts.length) continue
    const missing = opts.filter((o) => !centerForDesiredArea(o, m.slug))
    const flag = missing.length ? "✗" : "✓"
    console.log(`  ${flag} ${m.name.padEnd(22)} ${opts.length - missing.length}/${opts.length} resolve`
      + (missing.length ? `   MISSING: ${missing.join(" · ")}` : ""))
  }

  // ── Per-lead walk ─────────────────────────────────────────────────────────
  const { data: leads, error } = await db.from("leads")
    .select("id,first_name,city,neighborhoods,submarkets")
    .is("deleted_at", null).order("id")
  if (error) throw new Error(error.message)

  type Report = {
    id: number; name: string; city: string | null
    stored: string[]; resolved: string[]; unresolved: string[]
    centroids: number; candidates: number; enriched: number
    qualified: number; beastMatches: number
    byRank: Record<number, number>; loss: string
    detail: Array<{ placeId: string; name: string; rank: number; reason: string; viaAlias: boolean }>
  }
  const reports: Report[] = []

  for (const l of (leads ?? []) as Array<{ id: number; first_name: string | null; city: string | null; neighborhoods: string | null; submarkets: string | null }>) {
    const csv = composeDesiredAreas(l.neighborhoods, l.submarkets)
    const stored = csv.split(",").map((s) => s.trim()).filter(Boolean)
    if (!stored.length) continue

    const market = getMarketByName(l.city ?? "")
    const slug = market?.slug ?? null
    const formOpts = market ? [...market.neighborhoods, ...market.submarkets].map(norm) : []

    const resolved: string[] = []
    const unresolved: string[] = []
    for (const label of stored) {
      if (centerForDesiredArea(label, slug)) resolved.push(label)
      else unresolved.push(label)
    }

    const centers = resolveDesiredAreaCenters(csv, slug).filter((c) => isInsideState(c, "TX"))
    const seen = new Set<string>()
    const merged: ExplorerProperty[] = []
    for (const c of centers) {
      for (const p of await searchNearby(c.lat, c.lng)) {
        if (!p.id || !p.location || seen.has(p.id)) continue
        seen.add(p.id)
        const cat = catalog.get(p.id)
        merged.push({
          placeId: p.id, propertyId: p.id,
          propertyName: p.displayName?.text ?? "",
          propertyAddress: p.formattedAddress ?? null,
          propertyUrl: "", lat: p.location.latitude, lng: p.location.longitude,
          source: "google_places", marketSlug: slug,
          // THE REAL PIPELINE'S ENRICHMENT STEP.
          neighborhood: cat?.neighborhood ?? null,
          location: cat?.location ?? null,
          locationKeywords: cat?.location_keywords ?? [],
        } as ExplorerProperty)
      }
    }
    const enriched = merged.filter((p) => catalog.has(p.placeId)).length

    const client = { city: l.city, desiredAreas: csv }
    const fits = merged.map((p) => ({ p, fit: assessLocationFit(p, client) }))
    const qualified = fits.filter((x) => x.fit?.tone === "match")
    const byRank: Record<number, number> = {}
    for (const q of qualified) byRank[q.fit!.rank ?? 0] = (byRank[q.fit!.rank ?? 0] ?? 0) + 1
    // Attribution: for each qualified property, the tier and the exact evidence, so a
    // before/after diff can say WHICH alias admitted a newly-qualified property.
    const detail = qualified.map((q) => ({
      placeId: q.p.placeId, name: q.p.propertyName,
      rank: q.fit!.rank ?? 0, reason: q.fit!.reason,
      // An exact label hit needs no alias; anything else at rank 2 came via the table.
      viaAlias: q.fit!.rank === 2
        && !stored.some((a2) => norm(a2) === norm(q.fit!.reason.replace(/^Keyword:\s*/i, ""))),
    }))
    const beast = computeSuggestions(merged, client).size

    // Which stored areas actually produced a qualifying match?
    const qualifiedVia = new Set<string>()
    for (const q of qualified) {
      const r = q.fit!.reason.toLowerCase()
      for (const a of stored) if (r.includes(norm(a))) qualifiedVia.add(a)
    }

    let loss = ""
    if (unresolved.length === stored.length) loss = `NO AREA RESOLVES → no search centroid at all`
    else if (!merged.length) loss = `centroids searched but Places returned nothing`
    else if (!qualified.length) loss = `${merged.length} candidates, NONE qualified — no address names an area and no catalogued geography matched`
    else if (qualified.length < 6) loss = `only ${qualified.length} qualified of ${merged.length} candidates`
    else loss = "healthy"
    if (unresolved.length && unresolved.length < stored.length) {
      loss += ` · ${unresolved.length} of ${stored.length} labels unresolved (${unresolved.join(", ")})`
    }

    reports.push({
      id: l.id, name: l.first_name ?? "?", city: l.city, stored, resolved, unresolved,
      centroids: centers.length, candidates: merged.length, enriched,
      qualified: qualified.length, beastMatches: beast, byRank, loss, detail,
    })
  }

  console.log(`\n${"═".repeat(96)}`)
  console.log("PER-LEAD WALK (live leads with at least one saved area)")
  console.log("═".repeat(96))
  for (const r of reports) {
    const health = r.beastMatches >= 6 ? "✓" : r.beastMatches === 0 ? "✗" : "~"
    console.log(`\n${health} lead ${r.id} ${r.name} (${r.city})`)
    console.log(`    stored      ${r.stored.length}: ${r.stored.join(" · ")}`)
    console.log(`    resolves    ${r.resolved.length}: ${r.resolved.join(" · ") || "—"}`)
    if (r.unresolved.length) console.log(`    UNRESOLVED  ${r.unresolved.length}: ${r.unresolved.join(" · ")}`)
    console.log(`    centroids ${r.centroids}  candidates ${r.candidates}  (catalogued ${r.enriched})`)
    console.log(`    qualified ${r.qualified}  ranks ${JSON.stringify(r.byRank)}  →  BEAST MATCHES ${r.beastMatches}`)
    console.log(`    loss: ${r.loss}`)
  }

  // ── Roll-up ───────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(96)}`)
  console.log("ROLL-UP")
  console.log("═".repeat(96))
  const n = reports.length
  console.log(`  leads with ≥1 saved area                  ${n}`)
  console.log(`  …reaching the 6-8 healthy range           ${reports.filter((r) => r.beastMatches >= 6).length}`)
  console.log(`  …with 1-5 matches                         ${reports.filter((r) => r.beastMatches > 0 && r.beastMatches < 6).length}`)
  console.log(`  …with ZERO matches                        ${reports.filter((r) => r.beastMatches === 0).length}`)
  console.log(`  …having at least one unresolved label     ${reports.filter((r) => r.unresolved.length > 0).length}`)
  console.log(`  …where NOTHING resolves                   ${reports.filter((r) => r.resolved.length === 0).length}`)
  const allRanks: Record<number, number> = {}
  for (const r of reports) for (const [k, v] of Object.entries(r.byRank)) allRanks[+k] = (allRanks[+k] ?? 0) + v
  console.log(`  qualified matches by tier                 ${JSON.stringify(allRanks)}`)
  console.log(`      (1 neighborhood · 2 keyword · 3 location · 4 address text)`)
  const totalCand = reports.reduce((a, r) => a + r.candidates, 0)
  const totalEnr = reports.reduce((a, r) => a + r.enriched, 0)
  console.log(`  candidates seen / in catalog              ${totalCand} / ${totalEnr}  (${((totalEnr / Math.max(totalCand, 1)) * 100).toFixed(1)}% could use the structured path)`)

  // Every distinct unresolved label, with the nearest current form option.
  const unresolvedAll = new Map<string, Set<number>>()
  for (const r of reports) for (const u of r.unresolved) {
    if (!unresolvedAll.has(u)) unresolvedAll.set(u, new Set())
    unresolvedAll.get(u)!.add(r.id)
  }
  if (unresolvedAll.size) {
    console.log(`\n  DISTINCT UNRESOLVED LABELS (${unresolvedAll.size}) and the catalog option they most resemble:`)
    for (const [label, ids] of [...unresolvedAll.entries()].sort()) {
      const lead = reports.find((r) => ids.has(r.id))!
      const m = getMarketByName(lead.city ?? "")
      const opts = m ? [...m.neighborhoods, ...m.submarkets] : []
      const nl = norm(label)
      const near = opts.filter((o) => norm(o).includes(nl) || nl.includes(norm(o)))
      console.log(`    "${label}"  (leads ${[...ids].join(", ")}, ${lead.city})`)
      console.log(`        candidate alias → ${near.length ? near.map((x) => `"${x}"`).join(" | ") : "NO SIMILAR OPTION — genuinely absent from the catalog"}`)
    }
  }

  console.log(`\n  MAX_UNLEASH_AREAS ${MAX_UNLEASH_AREAS} · MAX_SUGGESTIONS ${MAX_SUGGESTIONS}`)

  const jsonIdx = process.argv.indexOf("--json")
  if (jsonIdx > 0) {
    writeFileSync(process.argv[jsonIdx + 1], JSON.stringify(reports, null, 2))
    console.log(`\n  wrote ${process.argv[jsonIdx + 1]}`)
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
