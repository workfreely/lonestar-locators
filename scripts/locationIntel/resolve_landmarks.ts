// PREPARED, NOT RUN. Resolve curated landmark NAMES → Google Place ID + coords via
// Places Text Search (New). Conservative: verify the returned name overlaps the query;
// ambiguous/no-match are left NULL (never guessed). Fills location_landmarks in place.
// Default prints the plan + estimated cost; pass --confirm to actually call Google.
// Run: npx tsx scripts/locationIntel/resolve_landmarks.ts [--market=Austin] [--confirm]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const CONFIRM = process.argv.includes("--confirm")
const MARKET = process.argv.find((a) => a.startsWith("--market="))?.split("=")[1] ?? null
const FIELD_MASK = "places.id,places.displayName,places.formattedAddress,places.location"
// Places Text Search (New) Pro tier ≈ $0.032 / call (free monthly tier applies first).
const PER_CALL_USD = 0.032

const STOP = new Set(["the", "at", "of", "and", "a", "san", "antonio", "fort", "worth", "hospital", "medical", "center", "university", "campus", "airport", "headquarters"])
const tok = (s: string) => new Set((s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t)))
function agrees(query: string, got: string): boolean {
  const a = tok(query), b = tok(got); if (!a.size || !b.size) return false
  let inter = 0; for (const t of a) if (b.has(t)) inter++
  return inter >= 1 && inter / Math.min(a.size, b.size) >= 0.5
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const key = process.env.GOOGLE_PLACES_API_KEY
  let q = supabaseAdmin.from("location_landmarks").select("id, name, market, category").is("google_place_id", null)
  if (MARKET) q = q.eq("market", MARKET)
  const { data: landmarks } = await q
  const list = landmarks ?? []
  console.log(`Unresolved landmarks to resolve${MARKET ? ` (${MARKET})` : ""}: ${list.length}`)
  console.log(`Estimated Places Text Search calls: ${list.length}  ·  est. cost ≈ $${(list.length * PER_CALL_USD).toFixed(2)} (Pro; free tier applies first)`)
  if (!CONFIRM) { console.log("DRY (no --confirm): no Google calls made. Re-run with --confirm to resolve."); return }
  if (!key) { console.error("GOOGLE_PLACES_API_KEY missing"); process.exit(1) }

  let accepted = 0, ambiguous = 0, nomatch = 0
  for (const lm of list) {
    const body = JSON.stringify({ textQuery: `${lm.name}, ${lm.market ?? ""} TX`.trim(), maxResultCount: 3 })
    let j: { places?: { id: string; displayName?: { text: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[] } | null = null
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK }, body })
      if (r.ok) j = await r.json()
    } catch { /* skip */ }
    const cands = (j?.places ?? []).filter((c) => agrees(lm.name, c.displayName?.text ?? ""))
    if (cands.length === 1 || (cands.length > 1 && new Set(cands.map((c) => c.id)).size === 1)) {
      const c = cands[0]
      await supabaseAdmin.from("location_landmarks").update({
        google_place_id: c.id, latitude: c.location?.latitude ?? null, longitude: c.location?.longitude ?? null,
        formatted_address: c.formattedAddress ?? null, verified_at: new Date().toISOString(), source: "google_places_textsearch",
      }).eq("id", lm.id)
      accepted++
    } else if (cands.length > 1) { ambiguous++ } else { nomatch++ }
  }
  console.log(JSON.stringify({ accepted, ambiguous, nomatch }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
