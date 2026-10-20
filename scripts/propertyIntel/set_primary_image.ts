// SET ONE PRIMARY IMAGE from a known, authentic first-party URL.
//
//   npx tsx scripts/propertyIntel/set_primary_image.ts \
//     --place-id=<id> --url="<image url>" --source="website:gallery:…" [--detail="…"] [--confirm]
//
// Without --confirm it is a DRY RUN: it validates the image, prints the exact candidate set, and
// writes nothing.
//
// ── WHY THIS EXISTS ALONGSIDE image_recovery_job.ts ─────────────────────────────────────────
// That job DISCOVERS images by crawling a property's website. It cannot run against a site behind
// a Cloudflare challenge — its own header says the rendered-browser tier is not handled — and The
// Enclave at Stonebrook is exactly that case: the site returns `cf-mitigated: challenge` while its
// CDN serves the gallery assets freely. This takes the URL as given and performs ONLY the second
// half: the identical validation, and the identical write.
//
// ── IT REUSES, IT DOES NOT REIMPLEMENT ──────────────────────────────────────────────────────
// Validation is byte-for-byte the job's `validate()`: reachable, image MIME, non-SVG, real sharp
// dimensions, decodes, and the same MIN_LONG/MIN_SHORT floors. The write goes through
// enrichProperty, which authorizes an image write ONLY while image_selection_state is
// 'missing' | 'change_requested' and flips it to 'keep' on success — so an already-accepted image
// is rejected with image_locked_keep rather than replaced.
//
// ── PRIMARY SLOT ONLY ───────────────────────────────────────────────────────────────────────
// property_image_url_backup is never in the candidate set, so the FALLBACK slot and its own
// image_backup_state are untouched. The two slots are independent by design.
import fs from "node:fs"
import path from "node:path"

;(() => {
  const p = path.join(process.cwd(), ".env.local")
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
})()

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=")
const CONFIRM = process.argv.includes("--confirm")
const PLACE_ID = (arg("place-id") ?? "").trim()
const URL_IN = (arg("url") ?? "").trim()
const SOURCE = (arg("source") ?? "").trim()
const DETAIL = (arg("detail") ?? "").trim()

// Same floors as image_recovery_job.ts.
const MIN_LONG = 800, MIN_SHORT = 450
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"

if (!PLACE_ID || !URL_IN || !SOURCE) {
  console.error('usage: --place-id=<id> --url="<image url>" --source="website:gallery:…" [--detail="…"] [--confirm]')
  process.exit(2)
}

/** Verbatim from image_recovery_job.ts — same checks, same thresholds. */
async function validate(url: string): Promise<{ ok: boolean; w?: number; h?: number; mime?: string; reason?: string }> {
  const sharp = (await import("sharp")).default
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000)
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "image/*", "Range": "bytes=0-524287" }, signal: ac.signal }).finally(() => clearTimeout(t))
    if (r.status >= 400) return { ok: false, reason: `http_${r.status}` }
    const mime = (r.headers.get("content-type") ?? "").split(";")[0].toLowerCase()
    if (!/^image\//.test(mime)) return { ok: false, reason: "not_image" }
    if (/svg/.test(mime)) return { ok: false, reason: "svg" }
    const buf = Buffer.from(await r.arrayBuffer())
    let meta; try { meta = await sharp(buf).metadata() } catch { return { ok: false, reason: "undecodable" } }
    const w = meta.width ?? 0, h = meta.height ?? 0
    if (Math.max(w, h) < MIN_LONG || Math.min(w, h) < MIN_SHORT) return { ok: false, w, h, mime, reason: `too_small:${w}x${h}` }
    return { ok: true, w, h, mime }
  } catch (e) { return { ok: false, reason: `err:${(e as Error).name}` } }
}

async function main() {
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const { supabaseAdmin } = await import("@/lib/supabase/admin")

  // Gap-fill guard at the job layer, mirroring image_recovery_job.ts. The writer enforces this
  // too; checking here turns a rejection into a clear message instead of a cryptic reason code.
  const { data: row } = await supabaseAdmin
    .from("property_catalog")
    .select("property_name, image_selection_state, property_image_url, property_image_url_backup, image_backup_state")
    .eq("place_id", PLACE_ID).maybeSingle()
  if (!row) { console.error(`no property_catalog row for ${PLACE_ID}`); process.exit(1) }
  console.log(`PROPERTY  ${row.property_name}`)
  console.log(`  primary slot   state=${row.image_selection_state}  url=${row.property_image_url ?? "(none)"}`)
  console.log(`  fallback slot  state=${row.image_backup_state}  url=${row.property_image_url_backup ?? "(none)"}  — NOT TOUCHED`)
  if (row.image_selection_state !== "missing" && row.image_selection_state !== "change_requested") {
    console.error(`\nREFUSING: primary slot is '${row.image_selection_state}'. An accepted image is only replaced via change_requested.`)
    process.exit(1)
  }

  console.log(`\nVALIDATING  ${URL_IN}`)
  const v = await validate(URL_IN)
  console.log(`  ${v.ok ? "✓" : "✗"} ${v.ok ? `${v.w}x${v.h}  ${v.mime}` : v.reason}`)
  if (!v.ok) { console.error("\nREFUSING: image failed validation. Nothing written."); process.exit(1) }

  const now = () => new Date().toISOString()
  // Provenance matches the recovery job's shape. sourceReference is the image URL itself, which
  // IS the first-party reference here — there is no crawled page in between.
  const prov = { sourceType: "official_property_site" as const, sourceReference: URL_IN, verificationStatus: "verified" as const, checkedAt: now() }
  const fields = [
    { field: "property_image_url", value: URL_IN, ...prov },
    { field: "property_image_source", value: SOURCE, ...prov },
    { field: "property_image_source_detail", value: DETAIL || `primary=${v.w}x${v.h}`, ...prov },
    { field: "property_image_status", value: "valid", ...prov },
    { field: "property_image_verified_at", value: now(), ...prov },
    { field: "property_image_checked_at", value: now(), ...prov },
    // property_image_url_backup is DELIBERATELY ABSENT — the fallback slot stays as it is.
  ]

  console.log("\nCANDIDATES")
  for (const f of fields) console.log(`  ${f.field.padEnd(30)} ${String(f.value).slice(0, 90)}`)

  if (!CONFIRM) { console.log("\nDRY RUN — nothing written. Re-run with --confirm."); return }

  const res = await enrichProperty(new SupabaseEnrichmentStore(), {
    placeId: PLACE_ID, jobId: `set_primary_image:${Date.now()}`, fields,
  })
  console.log("\nWRITER RESULTS")
  for (const r of res.results) console.log(`  ${r.field.padEnd(30)} ${r.outcome.padEnd(9)} ${r.reason}`)
  const wrote = res.results.find((r) => r.field === "property_image_url")?.outcome === "written"
  console.log(wrote ? "\nPRIMARY IMAGE SET — slot locked to 'keep'." : "\nPRIMARY NOT WRITTEN — see the reason above.")
  process.exit(wrote ? 0 : 1)
}

void main()
