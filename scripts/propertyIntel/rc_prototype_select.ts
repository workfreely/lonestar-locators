// RENTCafe/Yardi (Entrata-backed) PROTOTYPE — read-only. Galleries were extracted via the in-app
// browser (which passes Cloudflare). This EXTENDS the existing scorePropertyImage gate with:
//   provider/gallery metadata (Entrata MLv3 path category), scene classification from alt/path,
//   property-type-aware scene boosts, HARD logo/branding + stock/lifestyle rejection, HTTP/MIME/
//   dimension validation, and Primary + different-scene Fallback selection with rejection accounting.
// It does NOT modify scorePropertyImage/rankPropertyImages. WRITES NOTHING to property_catalog.
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const MIN_LONG = 800, MIN_SHORT = 450
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"

// ── Rejection detectors (prototype-level; reasons tracked for the report) ──
const ENTRATA_BRANDING_PATH = /\/MLv3\/9\/36\//i          // observed branding/logo category (validating)
const LOGO_ALT = /\blogo\b|wordmark|\bbadge\b|\bseal\b|communities\b|company\b|management\b|\bwebsite\b|corporate/i
const STOCK_LIFESTYLE = /\bfamily\b|\bcouple\b|\bfriends\b|socializing|posing|people enjoying|enjoying a meal|\blifestyle\b|\bmodel release\b|neighborhood stock|local attraction/i
const FLOORPLAN = /floor\s?plan|site\s?plan|\bfp\b/i
const MAPRE = /\bmap\b|static\s?map|directions/i
const SOCIAL = /instagram|facebook|tiktok|twitter|share card|social/i

// ── Scene classifier (reporting + fallback diversity). Checked high→low. ──
const SCENE: { fam: string; label: string; re: RegExp }[] = [
  { fam: "exterior", label: "Building/Exterior", re: /\bexterior\b|\bfacade\b|\bentrance\b|\baerial\b|\bdrone\b|two.?story home|home exterior|\bhigh.?rise\b|\btower\b|\bbuilding\b/i },
  { fam: "rooftop_view", label: "Rooftop/Skyline/View", re: /rooftop|skyline|city view|\bview\b/i },
  { fam: "pool", label: "Pool", re: /\bpool\b|poolside|swimming|infinity/i },
  { fam: "kitchen", label: "Kitchen", re: /\bkitchen\b/i },
  { fam: "living", label: "Living/Interior/Model", re: /living|\bmodel\b|\binterior\b|open.?concept|great room|\blobby\b|dining/i },
  { fam: "amenity", label: "Amenity", re: /clubhouse|club house|\blounge\b|fitness|\bgym\b|courtyard|\bgrill\b|\bbbq\b|dog park|business center|coffee bar|game room|cabana|\bpatio\b|\byard\b|\bgarage\b/i },
  { fam: "bedroom", label: "Bedroom", re: /bedroom/i },
  { fam: "other_interior", label: "Other interior", re: /bathroom|vanity|shower|closet|laundry|\boffice\b/i },
]
function classify(alt: string, urlPath: string): { fam: string; label: string; from: "alt" | "path" | "none" } {
  for (const s of SCENE) if (s.re.test(alt)) return { fam: s.fam, label: s.label, from: "alt" }
  for (const s of SCENE) if (s.re.test(urlPath)) return { fam: s.fam, label: s.label, from: "path" }
  return { fam: "unknown", label: "Unclassified photo", from: "none" }
}
function inferType(name: string, titleHint: string, alts: string[]): string {
  const blob = `${name} ${titleHint} ${alts.join(" ")}`.toLowerCase()
  if (/homes for rent|two.?story home|home exterior|attached.*garage|fenced (front )?yard|rental home|build.to.rent/.test(blob)) return "BTR/Rental Homes"
  if (/\btower\b|high.?rise|floor.?to.?ceiling|city view|rooftop|uptown|downtown/.test(blob)) return "High-Rise/Mid-Rise"
  return "Garden/Conventional"
}
const PRIORITY: Record<string, string[]> = {
  "High-Rise/Mid-Rise": ["exterior", "rooftop_view", "pool", "kitchen", "living", "amenity", "bedroom", "other_interior", "unknown"],
  "Garden/Conventional": ["pool", "exterior", "kitchen", "living", "amenity", "rooftop_view", "bedroom", "other_interior", "unknown"],
  "BTR/Rental Homes": ["exterior", "kitchen", "living", "amenity", "pool", "rooftop_view", "bedroom", "other_interior", "unknown"],
}

async function validate(url: string): Promise<{ ok: boolean; w?: number; h?: number; mime?: string; reason?: string }> {
  const sharp = (await import("sharp")).default
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000)
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "image/*", "Range": "bytes=0-393215" }, signal: ac.signal }).finally(() => clearTimeout(t))
    if (r.status >= 400) return { ok: false, reason: `http_${r.status}` }
    const mime = (r.headers.get("content-type") ?? "").split(";")[0]
    if (!/^image\//i.test(mime)) return { ok: false, reason: `not_image` }
    if (/svg/i.test(mime)) return { ok: false, reason: "svg" }
    const buf = Buffer.from(await r.arrayBuffer())
    const meta = await sharp(buf).metadata()
    const w = meta.width ?? 0, h = meta.height ?? 0
    if (Math.max(w, h) < MIN_LONG || Math.min(w, h) < MIN_SHORT) return { ok: false, w, h, mime, reason: `too_small:${w}x${h}` }
    return { ok: true, w, h, mime }
  } catch (e) { return { ok: false, reason: `err:${(e as Error).name}` } }
}

type Sel = { url: string; alt: string; fam: string; label: string; from: string; score: number; w?: number; h?: number; mime?: string }

async function main() {
  const { scorePropertyImage } = await import("@/lib/leads/detectPropertyMetadata")
  const data = JSON.parse(fs.readFileSync(`${S}/rc_gallery_data.json`, "utf8"))
  const H: string = data.host
  const report: Record<string, unknown>[] = []
  const primScenes: Record<string, number> = {}, fbScenes: Record<string, number> = {}
  const rejTotals: Record<string, number> = {}
  let gotPrimary = 0, gotFallback = 0, diffScene = 0
  let altUsed = 0, pathUsed = 0, candTotal = 0
  const brandingPathHits = { in_9_36: 0, branding_confirmed_in_9_36: 0, branding_outside_9_36: 0 }

  for (const prop of data.properties) {
    const type = inferType(prop.name, prop.titleHint, prop.imgs.map((i: { a: string }) => i.a))
    const rej: Record<string, number> = {}
    const bump = (k: string) => { rej[k] = (rej[k] ?? 0) + 1; rejTotals[k] = (rejTotals[k] ?? 0) + 1 }
    const survivors: Sel[] = []
    const seenIdentity = new Set<string>()

    for (const i of prop.imgs as { p: string; a: string }[]) {
      candTotal++
      const url = H + i.p, alt = i.a
      const brandingByPath = ENTRATA_BRANDING_PATH.test(i.p)
      const brandingByAlt = LOGO_ALT.test(alt)
      if (brandingByPath) brandingPathHits.in_9_36++
      // Validate the /9/36/ convention: does path-branding agree with alt-branding?
      if (brandingByPath && brandingByAlt) brandingPathHits.branding_confirmed_in_9_36++
      if (!brandingByPath && brandingByAlt) brandingPathHits.branding_outside_9_36++
      // HARD rejections (tracked)
      if (brandingByPath || brandingByAlt) { bump("logo_branding"); continue }
      if (STOCK_LIFESTYLE.test(alt)) { bump("stock_lifestyle"); continue }
      if (FLOORPLAN.test(alt) || FLOORPLAN.test(i.p)) { bump("floorplan"); continue }
      if (MAPRE.test(alt)) { bump("map"); continue }
      if (SOCIAL.test(alt) || SOCIAL.test(i.p)) { bump("social_share"); continue }
      // Existing quality gate (svg/logo/floorplan/tiny/stock/share-card/demote)
      const score = scorePropertyImage(url, 2, alt)
      if (score === null) { bump("quality_gate_reject"); continue }
      // near-duplicate protection (same scene + same date-second prefix)
      const sc = classify(alt, i.p)
      if (sc.from === "alt") altUsed++; else if (sc.from === "path") pathUsed++
      const idKey = `${sc.fam}|${(alt || "").toLowerCase().slice(0, 24)}`
      if (seenIdentity.has(idKey)) { bump("duplicate_near"); continue }
      seenIdentity.add(idKey)
      survivors.push({ url, alt, fam: sc.fam, label: sc.label, from: sc.from, score })
    }

    const prio = PRIORITY[type]
    const rank = (c: Sel) => prio.indexOf(c.fam) * 100000 - c.score
    survivors.sort((a, b) => rank(a) - rank(b))

    let primary: Sel | null = null
    for (const c of survivors) { const v = await validate(c.url); if (v.ok) { primary = { ...c, ...v }; break } else bump(v.reason?.startsWith("too_small") ? "too_small" : v.reason?.startsWith("http") || v.reason?.startsWith("err") ? "unreachable" : (v.reason ?? "invalid")) }
    let fallback: Sel | null = null
    if (primary) for (const c of survivors) { if (c.url === primary.url || c.fam === primary.fam) continue; const v = await validate(c.url); if (v.ok) { fallback = { ...c, ...v }; break } }

    const lowConf = primary ? (primary.fam === "unknown" || primary.from === "none" || (primary.from === "path")) : false
    if (primary) { gotPrimary++; primScenes[primary.label] = (primScenes[primary.label] ?? 0) + 1 }
    if (fallback) { gotFallback++; fbScenes[fallback.label] = (fbScenes[fallback.label] ?? 0) + 1 }
    if (primary && fallback && primary.fam !== fallback.fam) diffScene++

    report.push({
      name: prop.name, market: prop.market, type, totalCandidates: prop.imgs.length, survivors: survivors.length, rejections: rej,
      primary: primary && { url: primary.url, scene: primary.label, dims: `${primary.w}x${primary.h}`, mime: primary.mime, evidence: primary.from === "alt" ? `alt: "${primary.alt.slice(0, 68)}"` : primary.from === "path" ? `path category (${primary.fam})` : "photo (no scene keyword)", score: primary.score, lowConfidence: lowConf },
      fallback: fallback && { url: fallback.url, scene: fallback.label, dims: `${fallback.w}x${fallback.h}`, mime: fallback.mime, evidence: fallback.from === "alt" ? `alt: "${fallback.alt.slice(0, 68)}"` : fallback.from === "path" ? `path category` : "photo (no scene keyword)", score: fallback.score },
    })
  }
  fs.writeFileSync(`${S}/rc_prototype_result.json`, JSON.stringify(report, null, 1))
  for (const r of report) {
    const p = r.primary as { scene: string; dims: string; url: string; evidence: string; lowConfidence: boolean } | null
    const f = r.fallback as { scene: string; dims: string; url: string; evidence: string } | null
    console.log(`\n■ ${r.name} (${r.market}) — ${r.type} — ${r.totalCandidates} cand, ${r.survivors} survived`)
    console.log(`   rej: ${JSON.stringify(r.rejections)}`)
    console.log(`   PRIMARY : ${p ? `${p.scene} [${p.dims}] ${p.lowConfidence ? "⚠LOWCONF " : ""}(${p.evidence})` : "— none —"}`)
    console.log(`   FALLBACK: ${f ? `${f.scene} [${f.dims}] (${f.evidence})` : "— none —"}`)
  }
  console.log("\n=== SUMMARY ===")
  console.log(JSON.stringify({ properties: report.length, gotPrimary, gotFallback, diffScene, primaryScenes: primScenes, fallbackScenes: fbScenes,
    rejectionTotals: rejTotals, semanticEvidence: { alt_used: altUsed, path_used: pathUsed, candidates: candTotal },
    entrataPathValidation: brandingPathHits }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
