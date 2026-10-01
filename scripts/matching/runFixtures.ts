// Run the matching fixtures and record what Unleash Beast would actually produce.
//
// WHY THIS CAN RUN HEADLESS. The browser-bound part of Unleash is one call —
// Places `searchNearby` through the Maps JS SDK. Everything that decides the
// OUTCOME is pure: resolving area labels to centroids, the market/state guards,
// the dedupe, and `assessLocationFit` ranking. So this substitutes the REST
// equivalent of that one call, using the SAME parameters the explorer sends
// (3 km locationRestriction, apartment_complex/apartment_building, 20 results,
// POPULARITY), and runs the real pure functions on the results.
//
// It is therefore a faithful measurement of candidate generation + ranking, not a
// re-implementation: the only thing swapped is the transport.
//
// Usage:
//   npx tsx scripts/matching/runFixtures.ts            print a run
//   npx tsx scripts/matching/runFixtures.ts --save a   save as baseline "a"
//   npx tsx scripts/matching/runFixtures.ts --diff a   diff this run against "a"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { MATCHING_FIXTURES, type MatchingFixture } from "./fixtures"
import { centerForDesiredArea, getMarketByName, isInsideState } from "@/lib/markets/catalog"
import { assessLocationFit } from "@/lib/propertyExplorer/locationFit"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const KEY = process.env.GOOGLE_PLACES_API_KEY!
const OUT = path.join(process.cwd(), "scripts/matching/baselines")

type Row = {
  fixtureId: string
  /** The CSV actually handed to the matcher — the thing Pass 1 changes. */
  desiredAreasInput: string
  /** Labels that survived to become search centres. */
  resolvedAreas: string[]
  centroidCount: number
  candidateCount: number
  /** tone === "match", rank-ordered — the pool MAX_SUGGESTIONS trims. */
  qualifiedNames: string[]
  qualifiedRanks: number[]
  /** What the locator would see starred today (the cap applies here). */
  starredNames: string[]
}

/** The CURRENT composition at every call site: `neighborhoods ?? submarkets`. */
function composeBefore(f: MatchingFixture): string {
  const n = f.neighborhoods.join(", ")
  const s = f.submarkets.join(", ")
  // `??` only falls through on null/undefined — an EMPTY neighborhoods string
  // still wins, which is exactly how Nearby Areas get discarded in production.
  return f.neighborhoods.length > 0 ? n : s
}

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
  if (!res.ok) throw new Error(`searchNearby ${res.status}: ${(await res.text()).slice(0, 180)}`)
  return ((await res.json()).places ?? []) as Array<{
    id: string; displayName?: { text?: string }; formattedAddress?: string
    location?: { latitude: number; longitude: number }
  }>
}

async function runFixture(f: MatchingFixture, compose: (f: MatchingFixture) => string, resolve: (csv: string, slug: string | null) => { labels: string[]; centers: Array<{ lat: number; lng: number }> }): Promise<Row> {
  const market = getMarketByName(f.city)
  const slug = market?.slug ?? null
  const desiredAreasInput = compose(f)
  const { labels, centers } = resolve(desiredAreasInput, slug)
  // The explorer's state guard.
  const inState = centers.filter((c) => isInsideState(c, "TX"))

  const seen = new Set<string>()
  const merged: ExplorerProperty[] = []
  for (const c of inState) {
    for (const p of await searchNearby(c.lat, c.lng)) {
      if (!p.id || !p.location || seen.has(p.id)) continue
      seen.add(p.id)
      merged.push({
        placeId: p.id, propertyId: p.id,
        propertyName: p.displayName?.text ?? "",
        propertyAddress: p.formattedAddress ?? null,
        propertyUrl: "", lat: p.location.latitude, lng: p.location.longitude,
        source: "google_places", marketSlug: slug,
      } as ExplorerProperty)
    }
  }

  // The REAL ranking pass: tone === "match", sorted by rank ascending.
  const client = { city: f.city, desiredAreas: desiredAreasInput }
  const qualified = merged
    .map((p) => ({ p, fit: assessLocationFit(p, client) }))
    .filter((x) => x.fit?.tone === "match")
    .sort((a, b) => (a.fit!.rank ?? 99) - (b.fit!.rank ?? 99))

  return {
    fixtureId: f.id,
    desiredAreasInput,
    resolvedAreas: labels,
    centroidCount: inState.length,
    candidateCount: merged.length,
    qualifiedNames: qualified.map((x) => x.p.propertyName),
    qualifiedRanks: qualified.map((x) => x.fit!.rank ?? 99),
    starredNames: qualified.slice(0, 5).map((x) => x.p.propertyName),
  }
}

/** BEFORE Pass 1: slice to 3 FIRST, then resolve — unresolvable labels waste slots. */
function resolveBefore(csv: string, slug: string | null) {
  const labels = csv.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3)
  const centers: Array<{ lat: number; lng: number }> = []
  const kept: string[] = []
  for (const label of labels) {
    const c = centerForDesiredArea(label, slug)
    if (c) { centers.push({ lat: c.lat, lng: c.lng }); kept.push(label) }
  }
  return { labels: kept, centers }
}

async function main() {
  const saveIdx = process.argv.indexOf("--save")
  const diffIdx = process.argv.indexOf("--diff")
  const useCurrent = process.argv.includes("--current")

  // --current runs the SHIPPING code; otherwise the pre-Pass-1 emulation above.
  let compose = composeBefore
  let resolve = resolveBefore
  if (useCurrent) {
    const m = await import("@/lib/propertyExplorer/multiArea")
    const compose2 = (m as unknown as { composeDesiredAreas?: (a: string | null, b: string | null) => string }).composeDesiredAreas
    compose = compose2
      ? (f: MatchingFixture) => compose2(f.neighborhoods.join(", "), f.submarkets.join(", "))
      : composeBefore
    resolve = (csv: string, slug: string | null) => {
      const centers = m.resolveDesiredAreaCenters(csv, slug)
      // Re-derive which labels survived, for the readable report.
      const kept = csv.split(",").map((s) => s.trim()).filter(Boolean)
        .filter((l) => centerForDesiredArea(l, slug))
      return { labels: kept.slice(0, centers.length), centers }
    }
  }

  const rows: Row[] = []
  for (const f of MATCHING_FIXTURES) {
    const r = await runFixture(f, compose, resolve)
    rows.push(r)
    console.log(`\n── ${r.fixtureId} ──`)
    console.log(`   input      ${JSON.stringify(r.desiredAreasInput)}`)
    console.log(`   centroids  ${r.centroidCount}  [${r.resolvedAreas.join(" | ")}]`)
    console.log(`   candidates ${r.candidateCount}`)
    console.log(`   qualified  ${r.qualifiedNames.length}  ranks[${r.qualifiedRanks.join(",")}]`)
    console.log(`   starred(5) ${r.starredNames.length}  ${r.starredNames.slice(0, 5).join(" · ")}`)
  }

  if (saveIdx > 0) {
    const name = process.argv[saveIdx + 1]
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })
    writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(rows, null, 2))
    console.log(`\nsaved baseline "${name}" (${rows.length} fixtures)`)
  }
  if (diffIdx > 0) {
    const prev: Row[] = JSON.parse(readFileSync(path.join(OUT, `${process.argv[diffIdx + 1]}.json`), "utf8"))
    console.log(`\n${"=".repeat(74)}\nDIFF vs "${process.argv[diffIdx + 1]}"\n${"=".repeat(74)}`)
    console.log("fixture                  centroids      candidates      qualified")
    for (const r of rows) {
      const p = prev.find((x) => x.fixtureId === r.fixtureId)
      if (!p) { console.log(`  ${r.fixtureId}: NEW`); continue }
      const d = (a: number, b: number) => (a === b ? `${b}` : `${a} → ${b}`)
      const changed = p.centroidCount !== r.centroidCount || p.candidateCount !== r.candidateCount || p.qualifiedNames.length !== r.qualifiedNames.length
      console.log(`  ${changed ? "▲" : " "} ${r.fixtureId.padEnd(22)} ${d(p.centroidCount, r.centroidCount).padEnd(14)} ${d(p.candidateCount, r.candidateCount).padEnd(15)} ${d(p.qualifiedNames.length, r.qualifiedNames.length)}`)
      const lost = p.qualifiedNames.filter((n) => !r.qualifiedNames.includes(n))
      if (lost.length) console.log(`       LOST: ${lost.join(" · ")}`)
    }
  }
}
main()
