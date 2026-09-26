// Landmark resolver — Places Text Search (New). Resolves curated location_landmarks →
// Google Place ID + canonical name + coords + formatted address, CONSERVATIVELY.
// Preserves the curated `name`; stores Google's canonical name in `google_display_name`.
// A WRONG landmark is worse than an unresolved one, so weak/ambiguous matches are left NULL
// and reported for review. Default prints plan + cost; pass --confirm to call Google.
// Run: npx tsx scripts/locationIntel/resolve_landmarks.ts [--market=Austin] [--confirm]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const CONFIRM = process.argv.includes("--confirm")
const MARKET = process.argv.find((a) => a.startsWith("--market="))?.split("=")[1] ?? null
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.types"
const PER_CALL_USD = 0.032 // Text Search Pro ($32/1k; ~5,000 free/mo — 189 calls well within free tier)

// The 15 previously-flagged ambiguous concepts — resolve ONLY on an unambiguous exact match.
const AMBIGUOUS = new Set(["Addison","Chevron Houston","East Austin","Energy Corridor","Frisco","Katy","Loop 360","Memorial","Methodist Hospital","Midtown","North Austin","Phillips 66","South Texas Medical Center","Spring Branch","Washington Corridor"])
const MKT: Record<string, string[]> = {
  "Austin": ["austin","round rock","cedar park","pflugerville","leander","georgetown","kyle","buda","san marcos","bee cave","west lake hills"],
  "Dallas": ["dallas","fort worth","plano","irving","arlington","frisco","mckinney","richardson","garland","addison","carrollton","lewisville","denton","westlake","the colony","allen","grand prairie","grapevine"],
  "Houston": ["houston","katy","sugar land","the woodlands","cypress","pearland","spring","conroe","humble","tomball","stafford","missouri city","baytown","pasadena"],
  "San Antonio": ["san antonio","new braunfels","schertz","boerne","converse","universal city","selma","cibolo","helotes","live oak","leon valley","universal"],
}
const STOP = new Set(["the","at","of","and","a","on","to","in"])
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "")
const tok = (s: string) => new Set((s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t)))
function nameOverlap(q: string, g: string): number {
  const a = tok(q), b = tok(g); if (!a.size || !b.size) return 0
  let inter = 0; for (const t of a) if (b.has(t)) inter++
  return inter / Math.min(a.size, b.size)
}
function marketOk(addr: string, market: string): boolean {
  const a = (addr || "").toLowerCase()
  if (!/,\s*(tx|texas)\b/.test(a) && !a.includes(" tx ")) return false
  return (MKT[market] ?? [market.toLowerCase()]).some((c) => a.includes(c))
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const key = process.env.GOOGLE_PLACES_API_KEY
  let q = supabaseAdmin.from("location_landmarks").select("id, name, market, category").is("google_place_id", null)
  if (MARKET) q = q.eq("market", MARKET)
  const { data } = await q
  const list = data ?? []
  console.log(`Unresolved landmarks${MARKET ? ` (${MARKET})` : ""}: ${list.length}  ·  est. Text Search Pro cost ≈ $${(list.length * PER_CALL_USD).toFixed(2)} (free tier applies)`)
  if (!CONFIRM) { console.log("DRY (no --confirm): no Google calls."); return }
  if (!key) { console.error("GOOGLE_PLACES_API_KEY missing"); process.exit(1) }

  const log: Record<string, unknown>[] = []
  const now = new Date().toISOString()
  let accepted = 0, review = 0, nomatch = 0, wrongcity = 0
  for (const lm of list) {
    const isAmb = AMBIGUOUS.has(lm.name)
    const body = JSON.stringify({ textQuery: `${lm.name}, ${lm.market ?? ""} TX`.trim(), maxResultCount: 3 })
    let places: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; types?: string[] }[] = []
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK }, body })
      if (r.ok) places = (await r.json()).places ?? []
    } catch { /* skip */ }
    const scored = places.map((c) => ({ c, ov: nameOverlap(lm.name, c.displayName?.text ?? ""), mk: marketOk(c.formattedAddress ?? "", lm.market ?? ""), exact: norm(lm.name) === norm(c.displayName?.text ?? "") }))
    const top = scored[0]
    const strong = scored.filter((s) => s.ov >= 0.5 && s.mk)
    const distinctStrong = new Set(strong.map((s) => s.c.id)).size

    let decision: "accepted" | "review_needed" | "no_match" | "wrong_city" = "no_match"
    let chosen: (typeof scored)[number] | null = null
    if (!places.length) decision = "no_match"
    else if (isAmb) {
      // Conservative: only an unambiguous EXACT name match in the right metro, single result.
      if (top && top.exact && top.mk && distinctStrong <= 1) { decision = "accepted"; chosen = top }
      else decision = "review_needed"
    } else {
      if (strong.length >= 1 && distinctStrong === 1) { decision = "accepted"; chosen = strong[0] }
      else if (strong.length >= 1 && distinctStrong > 1) decision = "review_needed"
      else if (top && top.ov >= 0.5 && !top.mk) decision = "wrong_city"
      else decision = "no_match"
    }

    if (decision === "accepted" && chosen && CONFIRM) {
      await supabaseAdmin.from("location_landmarks").update({
        google_place_id: chosen.c.id, google_display_name: chosen.c.displayName?.text ?? null,
        latitude: chosen.c.location?.latitude ?? null, longitude: chosen.c.location?.longitude ?? null,
        formatted_address: chosen.c.formattedAddress ?? null, verified_at: now, source: "google_places_textsearch",
      }).eq("id", lm.id)
      accepted++
    } else if (decision === "review_needed") review++
    else if (decision === "wrong_city") wrongcity++
    else nomatch++

    log.push({ name: lm.name, market: lm.market, category: lm.category, ambiguous: isAmb, decision,
      google_name: top?.c.displayName?.text ?? null, google_addr: top?.c.formattedAddress ?? null,
      google_types: top?.c.types?.slice(0, 4) ?? [], overlap: top ? Number(top.ov.toFixed(2)) : 0, market_ok: top?.mk ?? false, candidates: places.length })
  }
  fs.writeFileSync(`${S}/landmark_resolution_log.json`, JSON.stringify(log, null, 1))
  console.log(JSON.stringify({ attempted: list.length, accepted, review_needed: review, wrong_city: wrongcity, no_match: nomatch }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
