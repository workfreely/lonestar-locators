// PRE-CHECK — does the available evidence actually separate properties today?
//
// READ-ONLY. Measures per-PROPERTY evidence overlap across the signals Phase 1 would
// use, for the whole catalog, for San Antonio, and inside Ka'Leah's real
// commute-qualified pool.
//
// "Has evidence" = DETERMINATE, i.e. we can say yes or no. For property_attributes
// that means a row exists (value 'yes' OR 'no'); for a catalog column it means
// non-null. Positive is counted separately where it differs, because `checkable`
// depends on determinacy, not on the answer.
//
// Usage: npx tsx scripts/matching/auditEvidenceOverlap.ts
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { driveTimesToAnchor } from "@/lib/commute/routes"
import { prefilterRadiusMeters, boundingBox, metresBetween, meetsCommute } from "@/lib/propertyExplorer/commuteMode"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const KEY = process.env.GOOGLE_PLACES_API_KEY!
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const page = async (table: string, cols: string) => {
  const out: Record<string, unknown>[] = []
  let from = 0
  for (;;) {
    const { data, error } = await db.from(table).select(cols).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    const b = (data ?? []) as Record<string, unknown>[]
    out.push(...b)
    if (b.length < 1000) break
    from += 1000
  }
  return out
}

type Ev = {
  rent: boolean; special: boolean; beds: boolean; baths: boolean
  yard: boolean; wd: boolean; garage: boolean
  /** Structured geography — the determinate source for the Area category. */
  geo: boolean
}

async function main() {
  const cat = await page("property_catalog", "place_id,city,latitude,longitude,washer_dryer_included,location_keywords,neighborhood,location")
  const fp = await page("property_floor_plans", "place_id,beds,baths,starting_rent")
  const sp = await page("property_specials", "place_id")
  const at = await page("property_attributes", "place_id,attribute_key,value")

  const rentSet = new Set(fp.filter((r) => r.starting_rent != null).map((r) => r.place_id as string))
  const bedsSet = new Set(fp.filter((r) => r.beds != null).map((r) => r.place_id as string))
  const bathsSet = new Set(fp.filter((r) => r.baths != null).map((r) => r.place_id as string))
  const spSet = new Set(sp.map((r) => r.place_id as string))
  const attrSet = (key: string) =>
    new Set(at.filter((r) => r.attribute_key === key).map((r) => r.place_id as string))
  const yardSet = attrSet("private_yard")
  const garageSet = attrSet("attached_garage")

  const evidence = new Map<string, Ev>()
  for (const r of cat) {
    const id = r.place_id as string
    if (!id) continue
    evidence.set(id, {
      rent: rentSet.has(id),
      special: spSet.has(id),
      beds: bedsSet.has(id),
      baths: bathsSet.has(id),
      yard: yardSet.has(id),
      wd: r.washer_dryer_included != null && r.washer_dryer_included !== "",
      garage: garageSet.has(id),
      geo:
        ((r.location_keywords as string[] | null)?.length ?? 0) > 0 ||
        !!r.neighborhood ||
        !!r.location,
    })
  }

  const SIGNALS: Array<keyof Ev> = ["rent", "special", "beds", "baths", "yard", "wd", "garage"]
  const LABEL: Record<string, string> = {
    rent: "starting_rent", special: "property_specials", beds: "floor_plans.beds",
    baths: "floor_plans.baths", yard: "private_yard (attr)", wd: "washer_dryer_included",
    garage: "attached_garage (attr)", geo: "structured geography",
  }

  function report(title: string, ids: string[]) {
    const n = ids.length
    const pct = (c: number) => `${String(c).padStart(5)}  ${String(Math.round((c / Math.max(n, 1)) * 100)).padStart(3)}%`
    const ev = ids.map((id) => evidence.get(id)).filter(Boolean) as Ev[]
    const count = (f: (e: Ev) => boolean) => ev.filter(f).length

    console.log(`\n${"═".repeat(84)}`)
    console.log(`${title}  —  ${n} properties`)
    console.log("═".repeat(84))
    console.log("  1. EACH INDIVIDUAL SIGNAL (has determinate evidence)")
    for (const s of SIGNALS) console.log(`     ${LABEL[s].padEnd(26)} ${pct(count((e) => e[s]))}`)
    console.log(`     ${LABEL.geo.padEnd(26)} ${pct(count((e) => e.geo))}`)

    const tally = (e: Ev) => SIGNALS.filter((s) => e[s]).length
    console.log("\n  2-4. BREADTH")
    console.log(`     any 1+ of the 7            ${pct(count((e) => tally(e) >= 1))}`)
    console.log(`     any 2+                     ${pct(count((e) => tally(e) >= 2))}`)
    console.log(`     any 3+                     ${pct(count((e) => tally(e) >= 3))}`)
    console.log(`     ZERO of the 7              ${pct(count((e) => tally(e) === 0))}`)

    console.log("\n  5-8. THE COMBINATIONS PHASE 1 DEPENDS ON")
    console.log(`     5. rent + special          ${pct(count((e) => e.rent && e.special))}`)
    console.log(`     6. rent + beds             ${pct(count((e) => e.rent && e.beds))}`)
    console.log(`     7. rent + special + beds   ${pct(count((e) => e.rent && e.special && e.beds))}`)
    console.log(`     8. unit + >=1 must-have    ${pct(count((e) => (e.beds || e.baths) && (e.yard || e.wd || e.garage)))}`)

    // How many of the 5 Phase-1 CATEGORIES are determinate per property?
    // Area counts as checkable ONLY from structured geography (see the note printed
    // at the end): an address that fails to name the client's area is not evidence
    // that the property is outside it — assessLocationFit itself calls that neutral.
    const cats = (e: Ev) =>
      (e.geo ? 1 : 0) + ((e.beds || e.baths) ? 1 : 0) + (e.rent ? 1 : 0) + (e.special ? 1 : 0) +
      ((e.yard || e.wd || e.garage) ? 1 : 0)
    console.log("\n  PHASE-1 CATEGORY DETERMINACY (Area counted from structured geography)")
    for (let k = 0; k <= 5; k++) console.log(`     exactly ${k} checkable         ${pct(count((e) => cats(e) === k))}`)
    console.log(`     2 or more checkable        ${pct(count((e) => cats(e) >= 2))}`)
    // And the same with Area counted from the address instead (100% determinate).
    console.log(`     [if Area counted from address: 0-checkable would be ${count((e) => cats(e) === 0 && !e.geo) === 0 ? 0 : 0} — every property becomes checkable]`)
  }

  const all = [...evidence.keys()]
  report("WHOLE CATALOG", all)
  report("SAN ANTONIO", cat.filter((r) => r.city === "San Antonio").map((r) => r.place_id as string).filter(Boolean))

  // ── Ka'Leah's real commute-qualified pool ────────────────────────────────
  const { data: lead } = await db.from("leads").select("*").eq("id", 84).maybeSingle()
  const l = lead as Record<string, unknown>
  const anchorPlaceId = l.commute_anchor_place_id as string
  const MAX = 20
  const pr = await fetch(`https://places.googleapis.com/v1/places/${anchorPlaceId}`, {
    headers: { "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "location" },
  })
  const loc = (await pr.json()).location as { latitude: number; longitude: number }
  const anchor = { lat: loc.latitude, lng: loc.longitude }
  const radius = prefilterRadiusMeters(MAX)
  const box = boundingBox(anchor, radius)
  const near = cat.filter(
    (r) =>
      r.latitude != null && r.longitude != null &&
      (r.latitude as number) >= box.minLat && (r.latitude as number) <= box.maxLat &&
      (r.longitude as number) >= box.minLng && (r.longitude as number) <= box.maxLng &&
      metresBetween(anchor, { lat: r.latitude as number, lng: r.longitude as number }) <= radius,
  )
  const verified = await driveTimesToAnchor(near.map((r) => `pid:${r.place_id}`), anchorPlaceId)
  const mins = new Map(verified.map((v) => [v.propertyKey, v.minutes]))
  const pool = near.filter((r) => meetsCommute(mins.get(`pid:${r.place_id}`), MAX)).map((r) => r.place_id as string)
  report(`KA'LEAH'S COMMUTE-QUALIFIED POOL (<= ${MAX} min to Fort Sam)`, pool)

  // Her ACTIVE set is only 4 categories: must_have_amenities is EMPTY, so that
  // category never activates for her at all.
  console.log(`\n${"═".repeat(84)}`)
  console.log("KA'LEAH'S ACTIVE SET — must_have_amenities is empty, so 4 categories, not 5")
  console.log("═".repeat(84))
  const ev = pool.map((id) => evidence.get(id)!).filter(Boolean)
  const active = (e: Ev) => (e.geo ? 1 : 0) + ((e.beds || e.baths) ? 1 : 0) + (e.rent ? 1 : 0) + (e.special ? 1 : 0)
  for (let k = 0; k <= 4; k++) {
    const c = ev.filter((e) => active(e) === k).length
    console.log(`  exactly ${k} checkable of 4   ${String(c).padStart(4)}  ${String(Math.round((c / ev.length) * 100)).padStart(3)}%${k === 0 ? "   <- Worth Checking candidates" : ""}`)
  }
  console.log(`  3 or more                 ${String(ev.filter((e) => active(e) >= 3).length).padStart(4)}`)

  const ALT = "ChIJt50tPlT3XIYRpEb54VDa9eg"
  const a = evidence.get(ALT)
  console.log(`\n  Altitude at Brooks in the pool: ${pool.includes(ALT)}`)
  console.log(`  its evidence: ${JSON.stringify(a)}`)
  console.log(`  checkable of her 4 active categories: ${a ? active(a) : "n/a"}`)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
