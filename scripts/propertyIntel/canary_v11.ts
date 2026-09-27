// Property Image Intelligence v1.1 — CANARY RUNNER (16 approved properties ONLY).
//
// Runs the v1.1 discovery/selection engine over pathA_canary.csv and applies writes through the FROZEN
// safe writer with v1.1 provenance. Routing per live slot state:
//   • MISSING              → normal missing-slot safe writer (jobId image_recovery_v11)
//   • BAD too-small (keep) → explicit change_requested replace (authorize just before write; revert if
//                            nothing better is found) — the same authorized flow v1.0 uses
//   • keep EXEMPLARS       → discovery-only regression cases (MAA Abbey, Beckett, Alister): PROVE the
//                            mechanism, write NOTHING (a keep GOOD/uncertain Primary is never touched)
// Fallback slot is never touched. Commission never touched. No global change_requested.
// Flags: --smoke (discovery+validation only, NO vision, NO writes) · --confirm (apply writes).
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
import { chromium } from "playwright"
import { recoverPrimary, validateImage, isAlreadyV11, ALGO_VERSION_V11, assetIdentity } from "./v11/engine"
import { inferPropertyType, type PropertyType } from "./imageEngine"
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const SMOKE = process.argv.includes("--smoke")
const CONFIRM = process.argv.includes("--confirm")
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1]?.split(",")

// route: "missing" | "replace" (BAD too-small keep) | "exemplar" (keep, discovery-only, no write)
type Row = { tile: string; name: string; pid: string; website: string; route: "missing" | "replace" | "exemplar"; forceRender?: boolean; pattern: string }
const CANARY: Row[] = [
  { tile: "C1", name: "MAA Abbey", pid: "ChIJfV4bii6ZToYRZWGQpcwPx54", website: "https://www.maac.com/texas/dallas/maa-abbey/", route: "exemplar", pattern: "A1 embedded structured gallery" },
  { tile: "C2", name: "Beck at Wells Branch", pid: "ChIJJ5qyPn3ORIYRi6MIN-BtsDk", website: "https://www.rent-beckwellsbranch.com/", route: "exemplar", pattern: "A4 broken-asset in gallery" },
  { tile: "C3", name: "Alister Apartments", pid: "ChIJqyoYP0O0RIYRbd5Z9TDWQGU", website: "http://www.alisterapts.com/", route: "exemplar", pattern: "A3 alternate-page photography" },
  { tile: "C4", name: "The Fusion at RYE 3030", pid: "ChIJJ_NImh3DQIYRwvOYNuFzftA", website: "https://www.thefusionatrye3030.com/?switch_cls[id]=88265", route: "missing", forceRender: true, pattern: "A6 Entrata (render-required)" },
  { tile: "C5", name: "Lakewood Apartments", pid: "ChIJbUnkUOXORIYRSSHWhG0o1vc", website: "https://www.liveatlakewood.com/?switch_cls[id]=64961", route: "missing", forceRender: true, pattern: "A6 Entrata (render-required)" },
  { tile: "C6", name: "Skyler Apartments", pid: "ChIJ9d5aTtSDToYR9hm5Mh6qEiI", website: "https://www.livingatskyler.com/", route: "missing", pattern: "A6 RENTCafe (+A1 JSON-LD)" },
  { tile: "C7", name: "The Broadwater at Salado Creek", pid: "ChIJd5-n0U1gXIYRyX_On6xZC7Y", website: "", route: "replace", pattern: "A2 RENTCafe full-res upscale" },
  { tile: "C8", name: "Lone Oak", pid: "ChIJiyt2Yz_RRIYRzwWMOF93uAA", website: "https://www.loneoakapartments.com/", route: "missing", pattern: "A6 LeaseStar/RealPage" },
  { tile: "C9", name: "Palladium San Antonio", pid: "ChIJmTsr3zpbXIYRUKsxb5LuB04", website: "", route: "replace", pattern: "A2 LeaseStar dimg upscale" },
  { tile: "C10", name: "City North Apartments", pid: "ChIJ_ZRcVkQgTIYROeWtX_z95VY", website: "https://www.citynorth-apts.com/", route: "missing", pattern: "A6 Myrazz (gallery JSON + /gallery)" },
  { tile: "C11", name: "Loyola Junction Apartments", pid: "ChIJ5U6vebbJRIYR1q_3jcE60vA", website: "", route: "replace", pattern: "A2 Myrazz uploadcare upscale" },
  { tile: "C12", name: "The Vista", pid: "ChIJ6Z6zrT6ZToYRowizGlJ1W_g", website: "", route: "replace", pattern: "A2 Apartments247 underlying original" },
  { tile: "C13", name: "Gala at Waxahachie", pid: "ChIJ-1dL17HpToYRkW2dLN679So", website: "http://www.galaatwaxahachie.com/", route: "missing", pattern: "A1 Webflow srcset" },
  { tile: "C14", name: "The Barstow", pid: "ChIJm1Kf8AbMRIYRCtdJuT-yeBA", website: "", route: "replace", pattern: "A2 G5/Cloudinary upscale" },
  { tile: "C15", name: "Village Green of Bear Creek", pid: "ChIJCSyRCxaAToYRz-7MrTo43yg", website: "https://www.villagegreenofbearcreekapts.com/", route: "missing", pattern: "A3 custom alternate-page (deep)" },
  { tile: "C16", name: "Brady Residences", pid: "ChIJgVqB-TKZToYRVSXv5OzVkkA", website: "https://www.liveatbrady.com/", route: "missing", pattern: "A3 custom alternate-page" },
]

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  const { enrichProperty } = await import("@/lib/propertyEnrichment/writer")
  const { SupabaseEnrichmentStore } = await import("@/lib/propertyEnrichment/stores/supabaseStore")
  const store = new SupabaseEnrichmentStore()
  const now = () => new Date().toISOString()
  const browser = await chromium.launch({ headless: true })
  const report: any[] = []
  console.log(`v1.1 CANARY — ${CANARY.length} props · mode ${SMOKE ? "SMOKE(no-vision,no-write)" : CONFIRM ? "CONFIRM(writes)" : "DRY(vision,no-write)"}`)

  for (const r of ONLY ? CANARY.filter((x) => ONLY.includes(x.tile)) : CANARY) {
    const { data: live } = await supabaseAdmin.from("property_catalog")
      .select("place_id,property_name,market,image_selection_state,image_backup_state,property_image_url,property_image_url_backup,property_image_source_detail,website_url,property_type,inventory_type")
      .eq("place_id", r.pid).maybeSingle()
    const rec: any = { tile: r.tile, name: r.name, pid: r.pid, pattern: r.pattern, route: r.route,
      prev_state: live?.image_selection_state ?? "unknown", prev_primary_url: live?.property_image_url ?? null }
    if (!live) { rec.outcome = "unresolved"; rec.detail = "place_id not found"; report.push(rec); console.log(`${r.tile} ${r.name}: NOT FOUND`); continue }
    const website = r.website || live.website_url || ""
    const type: PropertyType = inferPropertyType(live.property_name || r.name, `${live.property_type ?? ""} ${live.inventory_type ?? ""}`)
    rec.website = website; rec.property_type = type

    // ---- guardrails ----
    if (r.route === "replace" && live.image_selection_state !== "keep") { rec.outcome = "skipped"; rec.detail = `expected keep, got ${live.image_selection_state}`; report.push(rec); continue }
    if (r.route === "exemplar" && live.image_selection_state !== "keep") rec.detail = `note: state=${live.image_selection_state}`

    // Second-pass guard: a property already written by an earlier v1.1 pass is keep-locked — verify by
    // discovery but NEVER rewrite it just because the canary is being re-run.
    const alreadyV11 = isAlreadyV11(live.property_image_source_detail)
    rec.already_v11 = alreadyV11
    // A property already written by a v1.1 pass is keep-locked: verify by discovery only (maxGate=0 → no
    // vision, no selection, no possibility of a rewrite), then report its STORED image/provenance.
    const res = await recoverPrimary({
      website, name: live.property_name || r.name, type, browser,
      forceRender: r.forceRender, excludeExactUrl: r.route === "replace" ? (live.property_image_url ?? undefined) : undefined,
      maxGate: SMOKE || alreadyV11 ? 0 : 18,
    })
    if (alreadyV11) {
      const v = await validateImage(live.property_image_url ?? "")
      const sd = live.property_image_source_detail ?? ""
      rec.selected_url = live.property_image_url
      rec.dimensions = v.ok ? `${v.w}x${v.h}` : "unverified"
      rec.discovery_mechanism = (sd.match(/mechanism=([^;]+)/) ?? [])[1] ?? "stored"
      rec.source_page = (sd.match(/sourcePage=([^;]+)/) ?? [])[1] ?? null
      rec.scene = (sd.match(/primary=([^;]+)/) ?? [])[1] ?? null
      rec.gate = "accepted@write(stored)"
      rec.candidate_count = res.dedupedCount
      rec.provider = res.provider
      rec.outcome = res.dedupedCount > 0 ? "verified_prior_v1.1_write(no_rewrite)" : "prior_v1.1_write_kept(discovery_empty)"
      rec.primary_changed = false
      report.push(rec)
      console.log(`${r.tile} ${r.name}: ${rec.outcome} · stored ${rec.dimensions} [${rec.discovery_mechanism}] · rediscovered cand=${res.dedupedCount}`)
      continue
    }
    rec.rendered = res.rendered; rec.blocked = res.blocked; rec.provider = res.provider
    rec.pages_inspected = res.pagesInspected; rec.raw_candidates = res.rawCount; rec.deduped_candidates = res.dedupedCount
    const sel = res.selected
    rec.candidate_count = res.dedupedCount
    // broken-asset evidence (A4): candidates that independently failed reachability/dims but others passed
    rec.independent_failures = res.evaluated.filter((e) => e.status === "no_valid_rendition" || e.status === "metadata_reject" || e.status === "gate_reject").length
    rec.eval_status_counts = res.evaluated.reduce<Record<string, number>>((a, e) => (a[e.status] = (a[e.status] ?? 0) + 1, a), {})
    rec.eval_detail = res.evaluated.slice(0, 16).map((e) => ({ status: e.status, reason: e.reason ?? null, dims: e.w ? `${e.w}x${e.h}` : null, scene: e.scene ?? null, gate: e.gate ? `${e.gate.verdict}:${e.gate.category}` : null, url: (e.chosenUrl ?? e.discoveredUrl).slice(0, 80) }))

    if (sel) {
      rec.discovery_mechanism = sel.mechanism
      rec.source_page = sel.sourcePage
      rec.discovered_url = sel.discoveredUrl
      rec.normalized_url = sel.chosenUrl !== sel.discoveredUrl ? sel.chosenUrl : null
      rec.selected_url = sel.chosenUrl
      rec.dimensions = `${sel.w}x${sel.h}`
      rec.cdn_upgrade = sel.upgraded ? { old: `${sel.origW}x${sel.origH}`, new: `${sel.w}x${sel.h}`, same_asset: assetIdentity(sel.discoveredUrl) === assetIdentity(sel.chosenUrl!) } : null
      rec.scene = sel.scene
      rec.avif_transcoded = sel.avifTranscoded ?? false
      rec.gate = sel.gate ? { verdict: sel.gate.verdict, category: sel.gate.category, confidence: sel.gate.confidence } : (SMOKE ? "skipped(smoke)" : null)
    } else {
      rec.discovery_mechanism = null; rec.selected_url = null
      rec.detail = (rec.detail ? rec.detail + "; " : "") + (res.blocked ? "site_blocked" : `no_gated_candidate (evaluated ${res.evaluated.length})`)
    }

    // ---- writes / outcome labeling ----
    let primaryChanged = false
    if (alreadyV11) {
      // written by pass 1 → keep-locked; verify discovery only, no rewrite.
      rec.outcome = sel ? "verified_prior_v1.1_write(no_rewrite)" : "prior_v1.1_write_kept(discovery_empty)"
    } else if (r.route === "exemplar") {
      // keep-locked GOOD/uncertain Primary — PROVE discovery only, write NOTHING.
      rec.outcome = sel ? "discovery_verified_no_write(keep)" : "discovery_failed_no_write(keep)"
    } else if (!sel) {
      rec.outcome = r.route === "replace" ? "preserved" : "unresolved"
    } else if (!CONFIRM || SMOKE) {
      rec.outcome = r.route === "replace" ? "would_upgrade" : "would_recover"
    } else {
      const prov = { sourceType: "official_property_site" as const, sourceReference: website, verificationStatus: "verified" as const, checkedAt: now() }
      const fields = [
        { field: "property_image_url", value: sel.chosenUrl, ...prov },
        { field: "property_image_source", value: `website:v1.1:${res.provider}:${sel.mechanism}`, ...prov },
        { field: "property_image_source_detail", value: `primary=${sel.scene}; mechanism=${sel.mechanism}; sourcePage=${sel.sourcePage}; algo=${ALGO_VERSION_V11}`, ...prov },
        { field: "property_image_status", value: "valid", ...prov },
        { field: "property_image_verified_at", value: now(), ...prov },
        { field: "property_image_checked_at", value: now(), ...prov },
      ]
      if (r.route === "missing") {
        const out = await enrichProperty(store, { placeId: r.pid, jobId: "image_recovery_v11", fields })
        primaryChanged = out.results.find((x) => x.field === "property_image_url")?.outcome === "written"
        rec.write_result = out.results.find((x) => x.field === "property_image_url")?.reason
        rec.outcome = primaryChanged ? "recovered" : "unresolved"
      } else { // replace: authorize change_requested for THIS slot only, guarded on keep, just before write
        const { data: auth } = await supabaseAdmin.from("property_catalog").update({ image_selection_state: "change_requested" }).eq("place_id", r.pid).eq("image_selection_state", "keep").select("place_id")
        if (!auth?.length) { rec.outcome = "preserved"; rec.detail = "authorize_conflict"; rec.primary_changed = false; report.push(rec); continue }
        const out = await enrichProperty(store, { placeId: r.pid, jobId: "image_primary_replacement_v11", fields })
        primaryChanged = out.results.find((x) => x.field === "property_image_url")?.outcome === "written"
        if (!primaryChanged) {
          await supabaseAdmin.from("property_catalog").update({ image_selection_state: "keep" }).eq("place_id", r.pid).eq("image_selection_state", "change_requested").select("place_id")
          rec.outcome = "preserved"; rec.detail = "no_better_write_reverted"
        } else { rec.outcome = "upgraded" }
      }
    }
    rec.primary_changed = primaryChanged
    report.push(rec)
    console.log(`${r.tile} ${r.name}: ${rec.outcome} · ${res.provider} · cand=${res.dedupedCount} · ${sel ? `${rec.dimensions} ${rec.scene} [${sel.mechanism}]` : "no selection"}`)
  }

  await browser.close()
  const tag = SMOKE ? "smoke" : CONFIRM ? "confirm" : "dry"
  fs.writeFileSync(`${S}/canary_v11_${tag}.json`, JSON.stringify(report, null, 1))
  console.log(`\nwrote canary_v11_${tag}.json`)
}
main().catch((e) => { console.error(e); process.exit(1) })
