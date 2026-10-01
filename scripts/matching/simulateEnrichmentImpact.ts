// SIMULATE the enrichment proposal against the live leads. READ-ONLY, WRITES NOTHING.
//
// Applies the proposal IN MEMORY only, then re-runs the real matching pipeline for
// every live lead with a saved area and reports the change. This is how "how many
// additional qualified matches would each enrichment create" is answered without
// touching a single row.
//
// Usage: npx tsx scripts/matching/simulateEnrichmentImpact.ts
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { composeDesiredAreas, resolveDesiredAreaCenters } from "@/lib/propertyExplorer/multiArea"
import { getMarketByName, isInsideState } from "@/lib/markets/catalog"
import { assessLocationFit } from "@/lib/propertyExplorer/locationFit"
import { computeSuggestions } from "@/lib/propertyExplorer/suggestions"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"
import { loadCatalog, buildProposals, type Row, type Proposal } from "./proposeGeographyEnrichment"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const KEY = process.env.GOOGLE_PLACES_API_KEY!
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function searchNearby(lat: number, lng: number, attempt = 0): Promise<Array<{
  id: string; displayName?: { text?: string }; formattedAddress?: string
  location?: { latitude: number; longitude: number }
}>> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 3000 } },
      includedPrimaryTypes: ["apartment_complex", "apartment_building"],
      maxResultCount: 20, rankPreference: "POPULARITY",
    }),
  })
  // 5xx and 429 are retried with backoff; anything else is a real error. Never
  // swallowed — an unretried failure would silently shrink a candidate pool and make
  // the before/after comparison meaningless.
  if (!res.ok) {
    if ((res.status >= 500 || res.status === 429) && attempt < 4) {
      await sleep(400 * 2 ** attempt)
      return searchNearby(lat, lng, attempt + 1)
    }
    throw new Error(`searchNearby ${res.status} after ${attempt + 1} attempt(s): ${(await res.text()).slice(0, 140)}`)
  }
  return ((await res.json()).places ?? []) as Array<{
    id: string; displayName?: { text?: string }; formattedAddress?: string
    location?: { latitude: number; longitude: number }
  }>
}

async function main() {
  const rows = await loadCatalog()
  const { accepted } = buildProposals(rows)
  // CONFLICTS ARE HELD BACK — they are for review, not for the first pass.
  const applied = accepted.filter((p) => !p.conflict)
  const byPlace = new Map<string, Proposal[]>()
  for (const p of applied) {
    if (!byPlace.has(p.placeId)) byPlace.set(p.placeId, [])
    byPlace.get(p.placeId)!.push(p)
  }
  const base = new Map<string, Row>()
  for (const r of rows) if (r.place_id) base.set(r.place_id, r)

  console.log(`proposal: ${accepted.length} additions, ${applied.length} applied in this simulation`)
  console.log(`(${accepted.length - applied.length} conflicts held back for review)\n`)

  const { data: leads } = await db.from("leads")
    .select("id,first_name,city,neighborhoods,submarkets").is("deleted_at", null).order("id")

  type Res = { id: number; name: string; qBefore: number; qAfter: number; bBefore: number; bAfter: number; gained: string[] }
  const out: Res[] = []

  for (const l of (leads ?? []) as Array<{ id: number; first_name: string | null; city: string | null; neighborhoods: string | null; submarkets: string | null }>) {
    const csv = composeDesiredAreas(l.neighborhoods, l.submarkets)
    if (!csv.split(",").map((s) => s.trim()).filter(Boolean).length) continue
    const slug = getMarketByName(l.city ?? "")?.slug ?? null
    const centers = resolveDesiredAreaCenters(csv, slug).filter((c) => isInsideState(c, "TX"))

    const seen = new Set<string>()
    const raw: Array<{ id: string; name: string; addr: string | null; lat: number; lng: number }> = []
    for (const c of centers) {
      for (const p of await searchNearby(c.lat, c.lng)) {
        if (!p.id || !p.location || seen.has(p.id)) continue
        seen.add(p.id)
        raw.push({ id: p.id, name: p.displayName?.text ?? "", addr: p.formattedAddress ?? null, lat: p.location.latitude, lng: p.location.longitude })
      }
    }

    const build = (withProposal: boolean): ExplorerProperty[] => raw.map((p) => {
      const cat = base.get(p.id)
      const extra = withProposal ? (byPlace.get(p.id) ?? []).map((x) => x.addKeyword) : []
      return {
        placeId: p.id, propertyId: p.id, propertyName: p.name, propertyAddress: p.addr,
        propertyUrl: "", lat: p.lat, lng: p.lng, source: "google_places", marketSlug: slug,
        neighborhood: cat?.neighborhood ?? null, location: cat?.location ?? null,
        locationKeywords: [...(cat?.location_keywords ?? []), ...extra],
      } as ExplorerProperty
    })

    const client = { city: l.city, desiredAreas: csv }
    const qual = (ps: ExplorerProperty[]) => ps
      .map((p) => ({ p, fit: assessLocationFit(p, client) }))
      .filter((x) => x.fit?.tone === "match")

    const before = qual(build(false))
    const after = qual(build(true))
    const bNames = new Set(before.map((x) => x.p.placeId))
    const gained = after.filter((x) => !bNames.has(x.p.placeId)).map((x) => x.p.propertyName)
    // A lost property would mean the simulation changed something it must not.
    const aNames = new Set(after.map((x) => x.p.placeId))
    const lost = before.filter((x) => !aNames.has(x.p.placeId)).map((x) => x.p.propertyName)
    if (lost.length) console.log(`  !! lead ${l.id} LOST ${JSON.stringify(lost)}`)

    out.push({
      id: l.id, name: l.first_name ?? "?",
      qBefore: before.length, qAfter: after.length,
      bBefore: computeSuggestions(build(false), client).size,
      bAfter: computeSuggestions(build(true), client).size,
      gained,
    })
  }

  console.log("═".repeat(96))
  console.log("LIVE-LEAD IMPACT OF THE PROPOSAL (simulated — nothing written)")
  console.log("═".repeat(96))
  console.log(`  ${"lead".padEnd(26)}${"qualified".padEnd(16)}${"Beast Matches".padEnd(18)}gained`)
  for (const r of out) {
    const d = (a: number, b: number) => (a === b ? `${a}` : `${a} → ${b}`)
    const mark = r.qAfter > r.qBefore ? "▲" : " "
    console.log(`  ${mark} ${(r.id + " " + r.name).slice(0, 23).padEnd(24)}${d(r.qBefore, r.qAfter).padEnd(16)}${d(r.bBefore, r.bAfter).padEnd(18)}${r.gained.length}`)
    for (const g of r.gained) console.log(`       + ${g}`)
  }
  const tb = out.reduce((a, r) => a + r.qBefore, 0), ta = out.reduce((a, r) => a + r.qAfter, 0)
  const bb = out.reduce((a, r) => a + r.bBefore, 0), ba = out.reduce((a, r) => a + r.bAfter, 0)
  console.log(`\n  qualified total      ${tb} → ${ta}   (${ta - tb >= 0 ? "+" : ""}${ta - tb})`)
  console.log(`  Beast Matches total  ${bb} → ${ba}   (${ba - bb >= 0 ? "+" : ""}${ba - bb})`)
  console.log(`  leads reaching 6-8   ${out.filter((r) => r.bBefore >= 6).length} → ${out.filter((r) => r.bAfter >= 6).length}`)
  console.log(`  leads at ZERO        ${out.filter((r) => r.bBefore === 0).length} → ${out.filter((r) => r.bAfter === 0).length}`)

  // ── The named test case ──────────────────────────────────────────────────
  console.log(`\n${"═".repeat(96)}`)
  console.log("KA'LEAH (lead 84) — the three Southtown properties")
  console.log("═".repeat(96))
  const south = accepted.filter((p) => p.area === "Southtown")
  for (const p of south) {
    const r = base.get(p.placeId)!
    console.log(`\n  ${p.propertyName}`)
    console.log(`     place_id              ${p.placeId}`)
    console.log(`     address               ${r.address ?? "—"}`)
    console.log(`     location_keywords NOW ${JSON.stringify(r.location_keywords ?? [])}`)
    console.log(`     PROPOSED              append "${p.addKeyword}"  →  ${JSON.stringify([...(r.location_keywords ?? []), p.addKeyword])}`)
    console.log(`     neighborhood          ${r.neighborhood ?? "(unchanged — not proposed)"}`)
    console.log(`     location              ${r.location ?? "(unchanged — not proposed)"}`)
    console.log(`     EVIDENCE              ${p.evidence}`)
  }
  const kl = out.find((r) => r.id === 84)
  if (kl) {
    console.log(`\n  RESULT  qualified ${kl.qBefore} → ${kl.qAfter}   Beast Matches ${kl.bBefore} → ${kl.bAfter}`)
    for (const g of kl.gained) console.log(`     + ${g}`)
  }
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
