// Property Image Intelligence v1.1 — PRODUCTION Primary recovery.
//
// Goal: every active property gets ONE strong, verified official Primary photo where a reasonable official
// source exists. Uses the frozen engine (v11/engine → discovery ladder + full-res normalization + AVIF
// eval + FROZEN metadata/visual-gate/scene/ranking) and the FROZEN safe writer. Reuses v1.0 unchanged.
//
// Cohorts (priority): MISSING → BAD → UNCERTAIN. Per property:
//   • already-v1.1  → skip (no-churn; the writer keep-lock is the second guarantee)
//   • MISSING       → recover; write via the missing-slot writer only on a gate-accepted photo
//   • BAD           → try to find a genuinely better photo; write via the authorized change_requested path;
//                     if nothing better, PRESERVE the current image and record why
//   • UNCERTAIN     → re-gate the CURRENT image (AVIF-aware). accept → resolved GOOD (no write); reject →
//                     treat as bad (try ladder; change_requested only if better; else preserve)
//   • no usable official image → SECONDARY_SOURCE_REQUIRED queue (no write, no guess, no cross-property img)
//
// Never touches Fallback / commission / identity / v1.0 / the 253 human-reviewed set. Durable resumable
// ledger. Run: npx tsx scripts/propertyIntel/primary_recovery_v11.ts --cohort=<missing|bad|uncertain|checkpoint|all> [--limit=N] [--confirm]
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
import { chromium, type Browser } from "playwright"
import { classifyPropertyImage } from "./visual_gate"
import { recoverPrimary, validateImage, isAlreadyV11, meetsThreshold, ALGO_VERSION_V11 } from "./v11/engine"
import { looksAvif, avifEvalCopy, avifDecoderInfo } from "./v11/avif"
import { inferPropertyType, metadataReject, type PropertyType } from "./imageEngine"
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const CONFIRM = process.argv.includes("--confirm")
const COHORT = process.argv.find((a) => a.startsWith("--cohort="))?.split("=")[1] ?? "checkpoint"
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0)
const LEDGER = process.argv.find((a) => a.startsWith("--ledger="))?.split("=")[1] ?? `${S}/primary_recovery_v11_ledger.json`
const SECQ = `${S}/secondary_source_required.json`

type Target = { place_id: string; name: string; market: string | null; website: string; cohort: "missing" | "bad" | "uncertain"; curUrl: string | null; state: string; sourceDetail: string | null; type: PropertyType }

const now = () => new Date().toISOString()

// Re-gate an existing image (AVIF-aware) using the FROZEN gate — used for UNCERTAIN current images.
async function gateExisting(url: string): Promise<{ ok: boolean; reason: string; dims?: string }> {
  const mr = metadataReject(url, ""); if (mr) return { ok: false, reason: `metadata_${mr}` }
  const v = await validateImage(url); if (!v.ok) return { ok: false, reason: v.reason ?? "invalid" }
  let gateUrl = url
  if (looksAvif(url, v.mime)) { const ev = await avifEvalCopy(url); if (!ev) return { ok: false, reason: "avif_undecodable" }; if (!meetsThreshold(ev.w, ev.h)) return { ok: false, reason: `avif_too_small:${ev.w}x${ev.h}` }; gateUrl = ev.dataUrl; v.w = ev.w; v.h = ev.h }
  const g = await classifyPropertyImage(gateUrl)
  return { ok: g.verdict === "accept", reason: g.verdict === "accept" ? `accept:${g.category}` : `${g.verdict}:${g.category}`, dims: `${v.w}x${v.h}` }
}

async function loadCohorts(supabaseAdmin: any): Promise<Target[]> {
  const out: Target[] = []
  const mk = (r: any, cohort: Target["cohort"]): Target => ({ place_id: r.place_id, name: r.property_name, market: r.market, website: r.website_url ?? "", cohort, curUrl: r.property_image_url ?? null, state: r.image_selection_state, sourceDetail: r.property_image_source_detail ?? null, type: inferPropertyType(r.property_name ?? "", `${r.property_type ?? ""} ${r.inventory_type ?? ""}`) })
  const sel = "place_id, property_name, market, website_url, property_image_url, image_selection_state, property_image_source_detail, property_type, inventory_type"
  const wantMissing = COHORT === "missing" || COHORT === "all" || COHORT === "checkpoint"
  const wantBad = COHORT === "bad" || COHORT === "all" || COHORT === "checkpoint"
  const wantUnc = COHORT === "uncertain" || COHORT === "all"
  if (wantMissing) {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabaseAdmin.from("property_catalog").select(sel).or("property_image_url.is.null,property_image_url.eq.").order("place_id").range(from, from + 999)
      if (!data?.length) break; for (const r of data) out.push(mk(r, "missing")); if (data.length < 1000) break
    }
  }
  const diag = JSON.parse(fs.readFileSync(`${S}/diag_sets.json`, "utf8")) as { uncertain: string[]; bad: string[] }
  const fetchIds = async (ids: string[], cohort: Target["cohort"]) => {
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabaseAdmin.from("property_catalog").select(sel).in("place_id", ids.slice(i, i + 200))
      for (const r of data ?? []) out.push(mk(r, cohort))
    }
  }
  if (wantBad) await fetchIds(diag.bad, "bad")
  if (wantUnc) await fetchIds(diag.uncertain, "uncertain")
  return out
}

// Stratified ~25-property checkpoint: a mix of Missing + Bad across providers/custom/CDN/rendered/alt-page.
function pickCheckpoint(all: Target[]): Target[] {
  const eligible = all.filter((t) => !isAlreadyV11(t.sourceDetail) && t.website && /^https?:/.test(t.website) && !/texas\.gov|notfound\./.test(t.website))
  const miss = eligible.filter((t) => t.cohort === "missing")
  const bad = eligible.filter((t) => t.cohort === "bad")
  const byProv = (list: Target[], re: RegExp) => list.filter((t) => re.test(t.curUrl ?? "") || re.test(t.website))
  const picks: Target[] = []
  const add = (arr: Target[], n: number) => { for (const t of arr) { if (picks.length >= 25) break; if (!picks.find((p) => p.place_id === t.place_id)) picks.push(t) ; void n } }
  add(byProv(bad, /rentcafe|myleasestar|myrazz|apts247|cloudinary|cachefly/i), 8) // CDN upgrades
  add(byProv(miss, /switch_cls|entrata/i), 4) // Entrata rendered
  add(byProv(miss, /myrazz|rentcafe|leasestar/i), 4) // provider missing
  add(miss.filter((t) => !/entrata|switch_cls|myrazz|rentcafe|leasestar/i.test(t.website)), 6) // custom alt-page
  add(bad, 3); add(miss, 25) // fill
  return picks.slice(0, 25)
}

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const store = new SupabaseEnrichmentStore()
  console.log(`AVIF decoder: ${JSON.stringify(avifDecoderInfo())}`)

  let targets = await loadCohorts(supabaseAdmin)
  if (COHORT === "checkpoint") targets = pickCheckpoint(targets)
  if (LIMIT) targets = targets.slice(0, LIMIT)
  const ledger: Record<string, any> = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")) : {}
  const secq: Record<string, any> = fs.existsSync(SECQ) ? JSON.parse(fs.readFileSync(SECQ, "utf8")) : {}
  console.log(`Primary recovery — cohort=${COHORT} targets=${targets.length} mode=${CONFIRM ? "CONFIRM" : "DRY"} resume=${Object.keys(ledger).length}`)

  const browser: Browser = await chromium.launch({ headless: true })
  const stat = { recovered: 0, upgraded: 0, preserved: 0, resolved_good: 0, secondary: 0, skipped: 0, errors: 0, avifEvals: 0, gateCalls: 0 }
  const mech: Record<string, number> = {}; const bumpM = (k: string) => (mech[k] = (mech[k] ?? 0) + 1)
  let processed = 0

  for (const t of targets) {
    if (ledger[t.place_id]?.final) { stat.skipped++; continue }
    // live re-read (authoritative state + no-churn)
    const { data: live } = await supabaseAdmin.from("property_catalog").select("place_id, image_selection_state, property_image_url, property_image_source_detail, website_url").eq("place_id", t.place_id).maybeSingle()
    if (!live) { ledger[t.place_id] = { final: "error", reason: "not_found" }; stat.errors++; continue }
    if (isAlreadyV11(live.property_image_source_detail)) { ledger[t.place_id] = { final: "skipped", reason: "already_v11" }; stat.skipped++; continue }
    const website = t.website || live.website_url || ""
    if (!website || !/^https?:/.test(website) || /texas\.gov|notfound\./.test(website)) {
      secq[t.place_id] = { name: t.name, market: t.market, cohort: t.cohort, reason: "no_official_website", website: website || null }
      ledger[t.place_id] = { final: "secondary", reason: "no_official_website" }; stat.secondary++; continue
    }

    try {
      // UNCERTAIN: re-gate the CURRENT image first (AVIF-aware). Accept → resolved GOOD, no write.
      if (t.cohort === "uncertain" && live.property_image_url) {
        const g = await gateExisting(live.property_image_url); stat.gateCalls++
        if (g.ok) { ledger[t.place_id] = { final: "resolved_good", reason: g.reason, dims: g.dims, note: "current image re-gated accept (no write)" }; stat.resolved_good++; bumpM("uncertain_current_regated"); continue }
        // else falls through to replacement search (treated as bad)
      }

      const isReplace = t.cohort === "bad" || t.cohort === "uncertain"
      const res = await recoverPrimary({ website, name: t.name, type: t.type, browser, forceRender: /switch_cls|entrata/i.test(website), excludeExactUrl: isReplace ? (live.property_image_url ?? undefined) : undefined, maxGate: 18 })
      stat.avifEvals += res.evaluated.filter((e) => e.avifTranscoded).length
      const sel = res.selected
      if (!sel) {
        if (isReplace) { ledger[t.place_id] = { final: "preserved", reason: res.blocked ? "site_blocked" : "no_better_official_image", provider: res.provider }; stat.preserved++; bumpM("preserved") }
        else { secq[t.place_id] = { name: t.name, market: t.market, cohort: t.cohort, reason: res.blocked ? "site_blocked" : "no_usable_official_photo", website, provider: res.provider }; ledger[t.place_id] = { final: "secondary", reason: res.blocked ? "site_blocked" : "no_usable_official_photo" }; stat.secondary++; bumpM("secondary") }
        continue
      }

      const prov = { sourceType: "official_property_site" as const, sourceReference: website, verificationStatus: "verified" as const, checkedAt: now() }
      const fields = [
        { field: "property_image_url", value: sel.chosenUrl, ...prov },
        { field: "property_image_source", value: `website:v1.1:${res.provider}:${sel.mechanism}`, ...prov },
        { field: "property_image_source_detail", value: `primary=${sel.scene}; mechanism=${sel.mechanism}; sourcePage=${sel.sourcePage}; algo=${ALGO_VERSION_V11}`, ...prov },
        { field: "property_image_status", value: "valid", ...prov },
        { field: "property_image_verified_at", value: now(), ...prov },
        { field: "property_image_checked_at", value: now(), ...prov },
      ]
      const recBase = { provider: res.provider, mechanism: sel.mechanism, scene: sel.scene, dims: `${sel.w}x${sel.h}`, url: sel.chosenUrl, sourcePage: sel.sourcePage, avif: !!sel.avifTranscoded, upgrade: sel.upgraded ? { old: `${sel.origW}x${sel.origH}`, new: `${sel.w}x${sel.h}` } : null }
      if (sel.avifTranscoded) bumpM("avif")
      bumpM(sel.mechanism)

      if (!CONFIRM) { ledger[t.place_id] = { final: isReplace ? "would_upgrade" : "would_recover", ...recBase }; if (isReplace) stat.upgraded++; else stat.recovered++; continue }

      if (isReplace) {
        const { data: auth } = await supabaseAdmin.from("property_catalog").update({ image_selection_state: "change_requested" }).eq("place_id", t.place_id).eq("image_selection_state", "keep").select("place_id")
        if (!auth?.length) { ledger[t.place_id] = { final: "preserved", reason: "authorize_conflict" }; stat.preserved++; continue }
        const outw = await enrichProperty(store, { placeId: t.place_id, jobId: "image_primary_replacement_v11", fields })
        const wrote = outw.results.find((x) => x.field === "property_image_url")?.outcome === "written"
        if (!wrote) { await supabaseAdmin.from("property_catalog").update({ image_selection_state: "keep" }).eq("place_id", t.place_id).eq("image_selection_state", "change_requested").select("place_id"); ledger[t.place_id] = { final: "preserved", reason: "write_reverted" }; stat.preserved++; continue }
        ledger[t.place_id] = { final: "upgraded", ...recBase }; stat.upgraded++
      } else {
        const outw = await enrichProperty(store, { placeId: t.place_id, jobId: "image_recovery_v11", fields })
        const wrote = outw.results.find((x) => x.field === "property_image_url")?.outcome === "written"
        if (!wrote) { ledger[t.place_id] = { final: "error", reason: outw.results.find((x) => x.field === "property_image_url")?.reason ?? "not_written" }; stat.errors++; continue }
        ledger[t.place_id] = { final: "recovered", ...recBase }; stat.recovered++
      }
    } catch (e) { ledger[t.place_id] = { final: "error", reason: `err:${(e as Error).name}:${(e as Error).message.slice(0, 60)}` }; stat.errors++ }
    finally {
      processed++
      if (processed % 10 === 0) { fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1)); fs.writeFileSync(SECQ, JSON.stringify(secq, null, 1)); console.error(`  …${processed}/${targets.length} | rec ${stat.recovered} upg ${stat.upgraded} pres ${stat.preserved} good ${stat.resolved_good} sec ${stat.secondary} err ${stat.errors}`) }
    }
  }
  await browser.close()
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1)); fs.writeFileSync(SECQ, JSON.stringify(secq, null, 1))
  console.log(JSON.stringify({ cohort: COHORT, targets: targets.length, ...stat, mechanisms: mech, secondary_queue_size: Object.keys(secq).length }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
