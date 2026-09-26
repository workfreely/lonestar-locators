// PREPARED, NOT RUN. Property opening-hours enrichment.
// Place ID → Places Details (New) [regularOpeningHours + businessStatus + addressComponents]
// → normalize into structured public.property_hours + set property_catalog.business_status.
// Missing/absent hours stay ABSENT — a day with no Google period is NEVER written as closed
// (Unknown ≠ Closed). Provenance + verified_at preserved. Timezone derived from market (all TX
// = America/Chicago). Default prints plan + cost; pass --confirm to spend.
// Run: npx tsx scripts/locationIntel/hours_job.ts [--market=Houston] [--limit=N] [--confirm]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const CONFIRM = process.argv.includes("--confirm")
const MARKET = process.argv.find((a) => a.startsWith("--market="))?.split("=")[1] ?? null
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0)
// Places Details (New) Enterprise field mask (regularOpeningHours + rating tier) ≈ $0.02 / call.
const PER_CALL_USD = 0.02
const FIELD_MASK = "id,businessStatus,regularOpeningHours,addressComponents"
const DOW = { SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6 } as const
const TZ_BY_MARKET: Record<string, string> = { "Austin": "America/Chicago", "Dallas": "America/Chicago", "Houston": "America/Chicago", "San Antonio": "America/Chicago" }
const hhmm = (h?: number, m?: number) => (h == null ? null : `${String(h).padStart(2, "0")}:${String(m ?? 0).padStart(2, "0")}`)

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const key = process.env.GOOGLE_PLACES_API_KEY
  // Paginate past PostgREST's 1000-row cap so ALL properties are covered.
  const rows: { place_id: string; market: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabaseAdmin.from("property_catalog").select("place_id, market").not("place_id", "is", null).order("place_id").range(from, from + 999)
    if (MARKET) q = q.eq("market", MARKET)
    const { data } = await q
    if (!data || !data.length) break
    rows.push(...(data as { place_id: string; market: string | null }[]))
    if (LIMIT && rows.length >= LIMIT) { rows.length = LIMIT; break }
    if (data.length < 1000) break
  }
  console.log(`Properties to enrich hours${MARKET ? ` (${MARKET})` : ""}${LIMIT ? ` [limit ${LIMIT}]` : ""}: ${rows.length}`)
  console.log(`Estimated Places Details (Enterprise) calls: ${rows.length}  ·  est. cost ≈ $${(rows.length * PER_CALL_USD).toFixed(2)} (free monthly tier applies first)`)
  if (!CONFIRM) { console.log("DRY (no --confirm): no Google calls made. Re-run with --confirm."); return }
  if (!key) { console.error("GOOGLE_PLACES_API_KEY missing"); process.exit(1) }

  const now = new Date().toISOString()
  let withHours = 0, statusSet = 0
  for (const r of rows) {
    let d: { businessStatus?: string; regularOpeningHours?: { periods?: { open?: { day: string; hour: number; minute: number }; close?: { day: string; hour: number; minute: number } }[] } } | null = null
    try {
      const resp = await fetch(`https://places.googleapis.com/v1/places/${r.place_id}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK } })
      if (resp.ok) d = await resp.json()
    } catch { /* skip */ }
    if (!d) continue
    if (d.businessStatus) { await supabaseAdmin.from("property_catalog").update({ business_status: d.businessStatus }).eq("place_id", r.place_id); statusSet++ }
    const periods = d.regularOpeningHours?.periods ?? []
    if (!periods.length) continue // NO periods → hours unknown → write NOTHING (never "closed")
    const tz = TZ_BY_MARKET[(r.market as string) ?? ""] ?? "America/Chicago"
    const segByDay: Record<number, number> = {}
    const upserts = periods.filter((p) => p.open).map((p) => {
      const dow = DOW[(p.open!.day as keyof typeof DOW)]
      const seg = (segByDay[dow] = (segByDay[dow] ?? 0) + 1)
      return { place_id: r.place_id, hours_type: "leasing_office", day_of_week: dow, segment: seg, is_closed: false, opens: hhmm(p.open!.hour, p.open!.minute), closes: hhmm(p.close?.hour, p.close?.minute), timezone: tz, source: "google_places_details", verified_at: now }
    })
    if (upserts.length) { await supabaseAdmin.from("property_hours").upsert(upserts, { onConflict: "place_id,hours_type,day_of_week,segment" }); withHours++ }
  }
  console.log(JSON.stringify({ withHours, statusSet }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
