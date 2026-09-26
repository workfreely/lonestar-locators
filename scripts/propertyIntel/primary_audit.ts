// READ-ONLY Primary Image Quality Audit across all active properties. NO IMAGE WRITES, no catalog
// mutation. Classifies each populated Primary as GOOD (with scene) / BAD (with reason) / UNCERTAIN
// using cheap deterministic checks first (metadata + reachability + real dimensions), then a vision
// classifier ONLY for images that need it. Reuses v1.0 metadata reject + the same visual-quality
// principles (a dedicated, richer audit prompt — the v1.0 recovery gate/engine is NOT modified).
// Output = a JSON audit dataset in scratchpad (resumable ledger). Run: npx tsx scripts/propertyIntel/primary_audit.ts [--limit=N] [--concurrency=8]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
import sharp from "sharp"
import { metadataReject } from "./imageEngine"
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0)
const CONC = Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 8)
const LEDGER = `${S}/primary_audit_ledger.json`
const MODEL = "claude-haiku-4-5-20251001"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"
const MIN_LONG = 800, MIN_SHORT = 450

// Map the deterministic metadata reason → audit failure reason.
const METAMAP: Record<string, string> = { svg: "placeholder", entrata_branding_path: "brand_card", titlecard_filename: "brand_card", floorplan: "floorplan", map: "map", social_share: "other", logo_filename: "logo", logo_alt: "logo" }

const SYSTEM = `You audit the PRIMARY image on an apartment-community marketing card. Decide if it is a
strong, usable real PHOTOGRAPH of the actual property (state "good") or something that should NOT be
the main property image (state "bad"). If you truly cannot tell, state "uncertain".

GOOD = a genuine property photograph. Choose the best-fitting scene:
 building_exterior | pool | kitchen | living_interior | rooftop | skyline_view | clubhouse | fitness | other_property_photo
A real photo with incidental signage on the building, a small watermark, or residents incidentally in
a real pool/clubhouse is still GOOD.

BAD = not usable as the primary. Choose the reason:
 logo | wordmark | brand_card | promo_graphic | floorplan | map | placeholder | stock_lifestyle |
 people_subject | pet_subject | food_attraction | unrelated | low_quality | other
Guidance: a large superimposed community-NAME/title overlay = brand_card. People posing / a couple /
family as the MAIN subject = people_subject. A pet as the main subject = pet_subject. Food or a local
attraction/skyline stock shot with no property = food_attraction. A generic decor/lifestyle stock
image = stock_lifestyle.

Return ONLY JSON: {"state":"good|bad|uncertain","category":"<one value above>","confidence":0.0-1.0}`

type Rec = { place_id: string; name: string | null; market: string | null; group: "v1.0" | "legacy"; state: "good" | "bad" | "uncertain"; category: string; via: "metadata" | "reachability" | "dimension" | "vision"; confidence?: number; w?: number; h?: number; url: string }

async function classifyVision(b64: string): Promise<{ state: string; category: string; confidence: number } | null> {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({ model: MODEL, max_tokens: 120, temperature: 0, system: SYSTEM,
      messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } }, { type: "text", text: "Audit this primary image. JSON only." }] }] })
    const text = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim()
    const m = text.match(/\{[\s\S]*\}/); if (!m) return null
    const j = JSON.parse(m[0]); return { state: j.state, category: String(j.category ?? "other"), confidence: Number(j.confidence ?? 0) }
  } catch { return null }
}

async function auditOne(r: { place_id: string; name: string | null; market: string | null; url: string; group: "v1.0" | "legacy" }): Promise<Rec> {
  const base = { place_id: r.place_id, name: r.name, market: r.market, group: r.group, url: r.url }
  // 1) cheap metadata reject (no fetch)
  const mr = metadataReject(r.url, "")
  if (mr) return { ...base, state: "bad", category: METAMAP[mr] ?? "other", via: "metadata" }
  // 2) one fetch → reachability / mime / svg / dimensions
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000)
  let buf: Buffer | null = null
  try {
    const resp = await fetch(r.url, { headers: { "User-Agent": UA, "Accept": "image/*", "Range": "bytes=0-3145727" }, signal: ac.signal }).finally(() => clearTimeout(t))
    if (resp.status >= 400) return { ...base, state: "bad", category: "broken_url", via: "reachability" }
    const mime = (resp.headers.get("content-type") ?? "").split(";")[0].toLowerCase()
    if (/svg/.test(mime)) return { ...base, state: "bad", category: "placeholder", via: "reachability" }
    if (!/^image\//.test(mime)) return { ...base, state: "bad", category: "broken_url", via: "reachability" }
    buf = Buffer.from(await resp.arrayBuffer())
  } catch { return { ...base, state: "bad", category: "broken_url", via: "reachability" } }
  let meta: sharp.Metadata; try { meta = await sharp(buf).metadata() } catch { return { ...base, state: "bad", category: "low_quality", via: "dimension" } }
  const w = meta.width ?? 0, h = meta.height ?? 0
  if (Math.max(w, h) < MIN_LONG || Math.min(w, h) < MIN_SHORT) return { ...base, state: "bad", category: "too_small", via: "dimension", w, h }
  // 3) vision on survivors
  let b64: string
  try { b64 = (await sharp(buf).resize(640, 640, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer()).toString("base64") } catch { return { ...base, state: "uncertain", category: "decode", via: "dimension", w, h } }
  const v = await classifyVision(b64)
  if (!v) return { ...base, state: "uncertain", category: "vision_error", via: "vision", w, h }
  const state = v.state === "good" ? "good" : v.state === "bad" ? "bad" : "uncertain"
  return { ...base, state, category: v.category, via: "vision", confidence: v.confidence, w, h }
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const rows: { place_id: string; name: string | null; market: string | null; url: string; group: "v1.0" | "legacy" }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin.from("property_catalog").select("place_id, property_name, market, property_image_url, property_image_source_detail").not("property_image_url", "is", null).neq("property_image_url", "").order("place_id").range(from, from + 999)
    if (!data || !data.length) break
    for (const d of data as { place_id: string; property_name: string | null; market: string | null; property_image_url: string; property_image_source_detail: string | null }[])
      rows.push({ place_id: d.place_id, name: d.property_name, market: d.market, url: d.property_image_url, group: (d.property_image_source_detail ?? "").includes("property-image-intelligence-v1.0") ? "v1.0" : "legacy" })
    if (data.length < 1000) break
  }
  const targets = LIMIT ? rows.slice(0, LIMIT) : rows
  const ledger: Record<string, Rec> = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : {}
  console.log(`Primary audit: ${targets.length} populated primaries · conc ${CONC} · resume ${Object.keys(ledger).length} done`)
  let idx = 0, visionCalls = 0
  async function worker() {
    while (idx < targets.length) {
      const r = targets[idx++]
      if (ledger[r.place_id]) continue
      const rec = await auditOne(r)
      if (rec.via === "vision") visionCalls++
      ledger[r.place_id] = rec
      if (Object.keys(ledger).length % 100 === 0) { fs.writeFileSync(LEDGER, JSON.stringify(ledger)); console.error(`  …${Object.keys(ledger).length}/${targets.length} (vision ${visionCalls})`) }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  fs.writeFileSync(LEDGER, JSON.stringify(ledger))
  const all = Object.values(ledger)
  const by = (f: (r: Rec) => string) => all.reduce<Record<string, number>>((a, r) => (a[f(r)] = (a[f(r)] ?? 0) + 1, a), {})
  console.log(JSON.stringify({ audited: all.length, visionCalls,
    state: by((r) => r.state),
    bad_by_reason: all.filter((r) => r.state === "bad").reduce<Record<string, number>>((a, r) => (a[r.category] = (a[r.category] ?? 0) + 1, a), {}),
    good_by_scene: all.filter((r) => r.state === "good").reduce<Record<string, number>>((a, r) => (a[r.category] = (a[r.category] ?? 0) + 1, a), {}),
    via: by((r) => r.via),
    group_state: all.reduce<Record<string, Record<string, number>>>((a, r) => { (a[r.group] ??= {})[r.state] = ((a[r.group] ?? {})[r.state] ?? 0) + 1; return a }, {}),
  }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
