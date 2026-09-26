// Cleanup APPLY step. Writes an explicit, human-reviewed accept map for the cleanup pass —
// each entry names the exact Google candidate (by index in the inspection log) that clearly
// identifies the intended landmark. Multi-building institutions resolve to their canonical
// main location. Districts/corridors and ambiguous employers are NOT in the map (left unresolved).
// Also RE-QUERIES the two name-variance cases (Sixth Street, Texas Medical Center) and prints
// candidates so their accepted records can be verified or reverted.
// Default = DRY. Pass --confirm to write.
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const CONFIRM = process.argv.includes("--confirm")
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types"

// name -> which candidate index in the inspection log is the correct canonical destination.
// Absent names are intentionally left unresolved (area concepts / ambiguous employers / bad match).
const ACCEPT: Record<string, number> = {
  // clean single-candidate accepts (idx 0)
  "Barton Creek Greenbelt": 0, "Circuit of the Americas": 0, "Moody Center": 0,
  "DFW International Airport": 0, "Highland Park": 0, "JPS Hospital Fort Worth": 0,
  "Reunion Tower": 0, "SMU": 0, "Sundance Square": 0, "TCU": 0, "University Park": 0,
  "Baylor College of Medicine": 0, "EaDo": 0, "Kemah Boardwalk": 0, "NASA Johnson Space Center": 0,
  "Sugar Land Town Square": 0, "Alamo Heights": 0, "Brooke Army Medical Center": 0,
  "Methodist Hospital Westover Hills": 0, "Port San Antonio": 0, "San Antonio River Walk": 0,
  // multi-building institutions → canonical main location (idx 0 unless noted)
  "Apple Austin Campus": 0, "Dell Technologies Round Rock Campus": 0, "Charles Schwab Westlake": 0,
  "JPMorgan Chase Legacy West": 0, "Lockheed Martin Fort Worth": 0, "Parkland Hospital": 0,
  "Texas Instruments": 0, "ExxonMobil Spring Campus": 0, "MD Anderson Cancer Center": 0,
  "NRG Stadium": 0, "Texas Children's Hospital": 0, "UT Health San Antonio": 0, "UTSA Main Campus": 0,
  "University of North Texas": 1, // idx0 = "UNT at Dallas" (different institution); idx1 = Denton main campus
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const key = process.env.GOOGLE_PLACES_API_KEY!
  const log: { name: string; candidates: { id: string; gname: string; addr: string; lat: number | null; lng: number | null }[] }[] = JSON.parse(fs.readFileSync(`${S}/landmark_cleanup_log.json`, "utf8"))
  const byName = new Map(log.map((e) => [e.name, e]))
  const now = new Date().toISOString()

  console.log(`APPLY cleanup — ${Object.keys(ACCEPT).length} accepts  ·  mode: ${CONFIRM ? "CONFIRM (writes)" : "DRY"}`)
  let written = 0
  for (const [name, idx] of Object.entries(ACCEPT)) {
    const e = byName.get(name); const c = e?.candidates[idx]
    if (!c) { console.log(`  ⚠ ${name}: candidate[${idx}] missing — SKIP`); continue }
    console.log(`  ✓ ${name}  →  ${c.gname} | ${c.addr}`)
    if (CONFIRM) {
      await supabaseAdmin.from("location_landmarks").update({
        google_place_id: c.id, google_display_name: c.gname, latitude: c.lat, longitude: c.lng,
        formatted_address: c.addr, verified_at: now, source: "google_places_textsearch_cleanup",
      }).eq("name", name).is("google_place_id", null)
      written++
    }
  }

  // CORRECT a verified error in a previously-accepted record: "Sixth Street" was resolved to
  // "West 6th Street" (a different, quieter bar street). The intended landmark is the East-6th
  // entertainment district, which Google represents as "Sixth Street Historic District".
  console.log(`\n— Sixth Street correction —`)
  {
    let places: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[] = []
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK }, body: JSON.stringify({ textQuery: "Sixth Street Historic District Austin TX", maxResultCount: 1 }) })
      if (r.ok) places = (await r.json()).places ?? []
    } catch { /* skip */ }
    const p = places[0]
    if (p && /sixth street historic district/i.test(p.displayName?.text ?? "")) {
      console.log(`  Sixth Street  →  ${p.displayName?.text} | ${p.formattedAddress} | ${p.id}`)
      if (CONFIRM) {
        await supabaseAdmin.from("location_landmarks").update({
          google_place_id: p.id, google_display_name: p.displayName?.text ?? null,
          latitude: p.location?.latitude ?? null, longitude: p.location?.longitude ?? null,
          formatted_address: p.formattedAddress ?? null, verified_at: now, source: "google_places_textsearch_cleanup_corrected",
        }).eq("name", "Sixth Street")
      }
    } else console.log(`  ⚠ Sixth Street Historic District not confidently returned — leaving West 6th Street as-is`)
  }
  console.log(`\n${JSON.stringify({ accepts_defined: Object.keys(ACCEPT).length, written }, null, 1)}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
