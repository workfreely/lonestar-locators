// READ-ONLY residual Primary diagnostic. Reuses EXISTING ledgers/logs (no new vision/Google/Routes).
// Assigns one primary failure mechanism + provider + recovery path (A–E) to each of the 696 unresolved
// (378 missing + 318 bad) from evidence already collected, and emits the uncertain-28 manifest.
import fs from "node:fs"
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const J = (f: string) => { try { return JSON.parse(fs.readFileSync(`${S}/${f}`, "utf8")) } catch { return {} } }
const Q = String.fromCharCode(34); const unq = (v: string) => { v = v.trim(); if (v.startsWith(Q) && v.endsWith(Q)) v = v.slice(1, -1).split(Q + Q).join(Q); return v }
const tsv = (f: string) => fs.readFileSync(`${S}/${f}`, "utf8").replace(/\r/g, "").trim().split("\n").map((l) => l.split("\t").map(unq))

const audit = J("primary_audit_ledger.json")
const bulk = J("bulk_ledger.json")            // missing-Primary rendered run
const prod = J("replace_prod_ledger.json")    // 1700 replacement run
const l58 = J("replace58_ledger.json")        // 58 replacement run
const fp: Record<string, any> = {}; for (const r of J("provider_fingerprints.json") as any[]) fp[r.place_id] = r
const b0: Record<string, any> = {}; for (const r of J("image_probe_batch0.json") as any[]) b0[r.place_id] = r
const man = J("human_review_manifest.json") as any[]
const humanBad = new Map(man.filter((r) => r.human_decision === "BAD").map((r) => [r.place_id, r]))

const esc = (s: any) => Q + String(s ?? "").replace(/[\r\n\t]+/g, " ").replace(/"/g, Q + Q) + Q
const rows: any[] = []

// ── MISSING (378) ──
for (const p of tsv("diag_missing.tsv")) {
  const [pid, name, market, website] = p
  const bl = bulk[pid], f = fp[pid], b = b0[pid]
  const provider = bl?.provider || f?.provider || b?.provider || "unknown"
  // Precedence: the RENDERED bulk_ledger (Playwright, which passes Cloudflare) is authoritative and
  // supersedes the STATIC fingerprint WAF flag. A site with a static cloudflare flag that the rendered
  // pass reached (done/no_gated_candidate) was NOT blocked — treat it by its rendered reason.
  const rsn = String(bl?.reason ?? "")
  let mech = "unknown_needs_investigation", detail = "", path = "unknown"
  if (!website) { mech = "no_official_website"; detail = "no website_url; Google Places had no websiteUri"; path = "D" }
  else if (rsn === "challenged/blocked") { mech = "cloudflare_challenge"; detail = `rendered pass still blocked; provider ${provider}`; path = "A" }
  else if (rsn === "no_gated_candidate") {
    if (provider === "other/custom" || provider === "unknown" || provider === "Custom/unknown") { mech = "no_gallery_found_custom_site"; detail = "site reached; custom/self-hosted; no gallery route or candidate reached v1.0 extraction"; path = "A" }
    else { mech = "provider_template_variance"; detail = `site reached; provider ${provider} gallery not exposed to v1.0 extraction`; path = "A" }
  }
  else if (/ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_CLOSED/.test(rsn)) { mech = "website_unreachable_or_dead"; detail = rsn.replace(/^err:/, "").slice(0, 60); path = "D" }
  else if (/CERT|SSL|Timeout/.test(rsn)) { mech = "tls_cert_or_timeout_failure"; detail = rsn.replace(/^err:/, "").slice(0, 60); path = "A" }
  else if (bl?.status === "failed" || rsn.startsWith("err")) { mech = "rendered_browser_or_network_failure"; detail = rsn.slice(0, 60); path = "A" }
  else if (b?.bucket === "DEAD_OR_INVALID_SOURCE") { mech = "website_unreachable_or_dead"; detail = String(b?.reason || "").slice(0, 60); path = "D" }
  else if (b?.bucket === "NEEDS_RENDERED_WEB") { mech = "rendered_dom_needed"; detail = `not in rendered run; batch0 rendered-needed; provider ${provider}`; path = "A" }
  else if (b?.bucket === "NO_ACCEPTABLE_IMAGE") { mech = "official_site_no_usable_property_photos"; detail = "batch0: page loaded, no acceptable image"; path = "C" }
  else { mech = "unknown_needs_investigation"; detail = "no attempt record"; path = "D" }
  rows.push({ place_id: pid, name, market, cohort: "missing", cur_status: "missing", cur_url: "", website, provider, prev_outcome: bl?.status || b?.bucket || "not_attempted", mech, detail, path, evidence: bl ? "bulk_ledger(rendered)" : b ? "batch0(static)" : f ? "fingerprint" : "db" })
}

// ── BAD (318) ── (populated primary, not confirmed good)
for (const p of tsv("diag_badunc.tsv")) {
  const [pid, name, market, website, curUrl, state] = p
  const a = audit[pid]; if (!a || a.state !== "bad") continue // uncertain handled separately
  const pl = prod[pid] || l58[pid]
  const provider = pl?.provider || fp[pid]?.provider || "unknown"
  const cat = a.category
  const preserved = (pl?.outcome === "PRESERVED_NO_BETTER_IMAGE") || (pl?.status === "preserved")
  const hb = humanBad.get(pid)
  // Parametric-CDN providers usually serve the SAME asset at larger sizes → a full-res-variant
  // extraction is a plausible v1.1 win (A, canary-confirmable). Custom/unknown hosts may genuinely
  // only carry low-res, so a bigger source is needed (C).
  const cdnProvider = /RENTCafe|LeaseStar|Cloudinary|Myrazz|Apartments247|Entrata|Yardi|RealPage|G5|Duda|Webflow/i.test(provider)
  let mech = "unknown_needs_investigation", detail = "", path = "unknown"
  if (cat === "too_small") {
    if (cdnProvider) { mech = "low_resolution_only_cdn_variant_maybe"; detail = `current sub-800x450 (${a.w}x${a.h}); ${provider} CDN — larger variant of same asset plausibly extractable (validate via canary)`; path = "A" }
    else { mech = "no_candidate_meets_800x450"; detail = `current sub-800x450 (${a.w}x${a.h}); ${provider} — site may only host low-res, bigger source needed`; path = "C" }
  } else if (preserved || hb) {
    // content failure that had no qualifying replacement
    mech = "official_site_no_usable_property_photos"; detail = `original=${cat}${hb ? " (human-confirmed BAD)" : ""}; v1.0 found no different gate-passing photo`; path = "C"
  } else {
    // audit-bad but never processed (v1.0-group gate false-negative / no-website)
    mech = website ? "v1.0_group_not_processed" : "no_official_website"; detail = `audit=${cat}; group=${a.group}; not in a legacy replacement queue`; path = website ? "B" : "D"
  }
  rows.push({ place_id: pid, name, market, cohort: "bad", cur_status: state, cur_url: curUrl, website, provider, prev_outcome: pl?.outcome || pl?.status || "audit_bad_not_queued", mech, detail, path, evidence: pl ? (prod[pid] ? "replace_prod_ledger" : "replace58_ledger") : "audit_ledger" })
}

// write diagnostic CSV
const hdr = "place_id,name,market,cur_status,cur_primary_url,website_url,provider,cohort,prev_outcome,failure_mechanism,secondary_detail,recovery_path,evidence"
fs.writeFileSync(`${S}/residual_primary_diagnostic.csv`, [hdr, ...rows.map((r) => [esc(r.place_id), esc(r.name), esc(r.market), r.cur_status, esc(r.cur_url), esc(r.website), r.provider, r.cohort, esc(r.prev_outcome), r.mech, esc(r.detail), r.path, r.evidence].join(","))].join("\n"))

// ── UNCERTAIN (28) manifest ──
const uSet = J("diag_sets.json").uncertain as string[]
const badunc = new Map(tsv("diag_badunc.tsv").map((p) => [p[0], p]))
const uRows = uSet.map((pid, i) => { const p = badunc.get(pid) || []; const a = audit[pid] || {}; return { tile: "U-" + String(i + 1).padStart(3, "0"), place_id: pid, name: p[1] || "", market: p[2] || "", website: p[3] || "", cur_url: p[4] || "", state: p[5] || "", audit_category: a.category || "", reason: a.category === "decode" ? "audit decode/resize failed (AVIF or partial fetch) — not visually ambiguous; needs human view" : a.category === "vision_error" ? "vision classifier returned no verdict — needs human view" : "vision uncertain" } })
fs.writeFileSync(`${S}/uncertain_primary_manifest.json`, JSON.stringify(uRows, null, 1))
fs.writeFileSync(`${S}/uncertain_primary_manifest.csv`, ["tile,place_id,name,market,current_primary_url,current_state,audit_classification,uncertainty_reason", ...uRows.map((r) => [r.tile, esc(r.place_id), esc(r.name), esc(r.market), esc(r.cur_url), r.state, r.audit_category, esc(r.reason)].join(","))].join("\n"))

// ── aggregates ──
const by = (rs: any[], f: (r: any) => string) => rs.reduce<Record<string, number>>((a, r) => (a[f(r)] = (a[f(r)] ?? 0) + 1, a), {})
const missing = rows.filter((r) => r.cohort === "missing"), bad = rows.filter((r) => r.cohort === "bad")
console.log("diagnostic rows:", rows.length, "(missing", missing.length, "+ bad", bad.length, ") · uncertain", uRows.length)
console.log("\n=== MISSING (378) failure mechanism ==="); console.log(JSON.stringify(by(missing, (r) => r.mech), null, 1))
console.log("MISSING provider:", JSON.stringify(by(missing, (r) => r.provider)))
console.log("MISSING recovery path:", JSON.stringify(by(missing, (r) => r.path)))
console.log("\n=== BAD (318) failure mechanism ==="); console.log(JSON.stringify(by(bad, (r) => r.mech), null, 1))
console.log("BAD provider:", JSON.stringify(by(bad, (r) => r.provider)))
console.log("BAD recovery path:", JSON.stringify(by(bad, (r) => r.path)))
console.log("\n=== recovery path (all 696) ==="); console.log(JSON.stringify(by(rows, (r) => r.path), null, 1))
console.log("\n=== failure mechanism × path (all 696) for v1.1 ranking ===")
const mp = by(rows, (r) => `${r.mech} [${r.path}]`); Object.entries(mp).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(3)}  ${k}`))
