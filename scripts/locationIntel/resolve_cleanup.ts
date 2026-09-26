// Landmark resolver — CLEANUP PASS. Targets ONLY the 42 unresolved landmarks.
// Same conservative rule as the first pass (a wrong landmark is worse than an unresolved one),
// with three additions requested for cleanup:
//   1. Expanded metro geography (suburbs/enclaves) so legitimate destinations pass the market guard.
//   2. Canonical ALIASES for abbreviation/short-name failures (curated `name` is preserved; alias
//      is used only for the Google query).
//   3. AREA_CONCEPT handling: districts/corridors that do not map cleanly to a single Place ID are
//      NEVER forced onto a business/point — they are reported as "area concept" and left unresolved.
// Default = INSPECT (prints candidates, no writes). Pass --confirm to persist accepted matches.
// Run: npx tsx scripts/locationIntel/resolve_cleanup.ts [--confirm]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const CONFIRM = process.argv.includes("--confirm")
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types"
const PER_CALL_USD = 0.032 // Text Search Pro ($32/1k; free tier ~5,000/mo — this pass is <50 calls)

// Districts/corridors that legitimately have no single trustworthy Google Place identity.
// These are inspected but NEVER auto-accepted; reported as "area_concept" for a future
// centroid/boundary representation. (Sundance Square is handled separately — it IS a real place.)
const AREA_CONCEPT = new Set(["Loop 360","Chevron Houston","Phillips 66","South Texas Medical Center","Spring Branch","Washington Corridor"])

// Curated name -> Google query alias. Curated `name` is preserved in the DB; alias only steers search.
const ALIAS: Record<string, string> = {
  "SMU": "Southern Methodist University",
  "TCU": "Texas Christian University",
  "JPS Hospital Fort Worth": "John Peter Smith Hospital Fort Worth",
  "EaDo": "East Downtown Houston EaDo",
  "Downtown Fort Worth": "Downtown Fort Worth",
  "Reunion Tower": "Reunion Tower Dallas",
  "NRG Stadium": "NRG Stadium Houston",
  "Sundance Square": "Sundance Square Plaza Fort Worth",
  "UT Health San Antonio": "UT Health San Antonio Long School of Medicine",
  "UTSA Main Campus": "University of Texas at San Antonio Main Campus",
  "Methodist Hospital Westover Hills": "Methodist Hospital Westover Hills San Antonio",
}
// Accept the alias's canonical words when checking name overlap (so "SMU" matches "Southern Methodist University").
const ALIAS_MATCH = ALIAS

// Expanded metro geography — enclaves, suburbs, airports the first pass omitted.
const MKT: Record<string, string[]> = {
  "Austin": ["austin","round rock","cedar park","pflugerville","leander","georgetown","kyle","buda","san marcos","bee cave","west lake hills","westlake","del valle","manor","lakeway","dripping springs","elgin"],
  "Dallas": ["dallas","fort worth","plano","irving","arlington","frisco","mckinney","richardson","garland","addison","carrollton","lewisville","denton","westlake","the colony","allen","grand prairie","grapevine","highland park","university park","euless","bedford","coppell","southlake","keller","mansfield","flower mound","north richland hills","colleyville","dfw airport"],
  "Houston": ["houston","katy","sugar land","the woodlands","cypress","pearland","spring","conroe","humble","tomball","stafford","missouri city","baytown","pasadena","kemah","seabrook","league city","friendswood","webster","clear lake","deer park","channelview"],
  "San Antonio": ["san antonio","new braunfels","schertz","boerne","converse","universal city","selma","cibolo","helotes","live oak","leon valley","universal","alamo heights","terrell hills","fort sam houston","jbsa","castle hills","shavano park","hollywood park","windcrest","kirby","balcones heights"],
}
const STOP = new Set(["the","at","of","and","a","on","to","in","fort"])
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "")
const tok = (s: string) => new Set((s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t)))
function nameOverlap(q: string, g: string): number {
  const a = tok(q), b = tok(g); if (!a.size || !b.size) return 0
  let inter = 0; for (const t of a) if (b.has(t)) inter++
  return inter / Math.min(a.size, b.size)
}
function marketOk(addr: string, market: string): boolean {
  const a = (addr || "").toLowerCase()
  if (!/,\s*(tx|texas)\b/.test(a) && !/ tx /.test(a) && !a.includes(", tx")) return false
  return (MKT[market] ?? [market.toLowerCase()]).some((c) => a.includes(c))
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) { console.error("GOOGLE_PLACES_API_KEY missing"); process.exit(1) }
  const { data } = await supabaseAdmin.from("location_landmarks").select("id, name, market, category").is("google_place_id", null).order("market").order("name")
  const list = data ?? []
  console.log(`Cleanup targets (unresolved): ${list.length}  ·  mode: ${CONFIRM ? "CONFIRM (writes accepted)" : "INSPECT (no writes)"}`)

  const log: Record<string, unknown>[] = []
  const now = new Date().toISOString()
  let accepted = 0, area = 0, review = 0, nomatch = 0, calls = 0
  for (const lm of list) {
    const isArea = AREA_CONCEPT.has(lm.name)
    const alias = ALIAS[lm.name] ?? lm.name
    const matchName = ALIAS_MATCH[lm.name] ?? lm.name // compare Google name against alias words too
    const body = JSON.stringify({ textQuery: `${alias}, ${lm.market ?? ""} TX`.trim(), maxResultCount: 3 })
    let places: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; types?: string[] }[] = []
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK }, body })
      calls++
      if (r.ok) places = (await r.json()).places ?? []
      else log.push({ name: lm.name, http_error: r.status })
    } catch { /* skip */ }
    const scored = places.map((c) => {
      const gname = c.displayName?.text ?? ""
      const ov = Math.max(nameOverlap(matchName, gname), nameOverlap(lm.name, gname))
      return { id: c.id, gname, addr: c.formattedAddress ?? "", lat: c.location?.latitude ?? null, lng: c.location?.longitude ?? null, types: c.types?.slice(0, 5) ?? [], ov: Number(ov.toFixed(2)), mk: marketOk(c.formattedAddress ?? "", lm.market ?? ""), exact: norm(matchName) === norm(c.displayName?.text ?? "") || norm(lm.name) === norm(c.displayName?.text ?? "") }
    })
    const top = scored[0]
    const strong = scored.filter((s) => s.ov >= 0.5 && s.mk)
    const distinctStrong = new Set(strong.map((s) => s.id)).size

    let decision: "accepted" | "area_concept" | "review_needed" | "no_match" = "no_match"
    let chosen: (typeof scored)[number] | null = null
    if (isArea) {
      decision = "area_concept" // never force a point onto a district/corridor
    } else if (!places.length) {
      decision = "no_match"
    } else if (strong.length >= 1 && distinctStrong === 1) {
      decision = "accepted"; chosen = strong[0]
    } else if (top && top.exact && top.mk) {
      // A single exact-name in-market hit even if lower-scored siblings exist (e.g. campus + adjacent building).
      decision = "accepted"; chosen = top
    } else if (strong.length >= 1) {
      decision = "review_needed"
    } else if (top && top.ov >= 0.5 && !top.mk) {
      decision = "review_needed" // out-of-metro but name-plausible → hold, don't auto-reject as before
    } else {
      decision = "no_match"
    }

    if (decision === "accepted") accepted++
    else if (decision === "area_concept") area++
    else if (decision === "review_needed") review++
    else nomatch++

    if (decision === "accepted" && chosen && CONFIRM) {
      await supabaseAdmin.from("location_landmarks").update({
        google_place_id: chosen.id, google_display_name: chosen.gname,
        latitude: chosen.lat, longitude: chosen.lng, formatted_address: chosen.addr,
        verified_at: now, source: "google_places_textsearch_cleanup",
      }).eq("id", lm.id)
    }

    log.push({ name: lm.name, market: lm.market, category: lm.category, alias: alias !== lm.name ? alias : undefined, area_concept: isArea || undefined, decision, chose: chosen ? { id: chosen.id, name: chosen.gname, addr: chosen.addr } : undefined, candidates: scored })
  }
  fs.writeFileSync(`${S}/landmark_cleanup_log.json`, JSON.stringify(log, null, 1))
  console.log(JSON.stringify({ attempted: list.length, accepted, area_concept: area, review_needed: review, no_match: nomatch, google_calls: calls, est_cost_usd: Number((calls * PER_CALL_USD).toFixed(2)) }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
