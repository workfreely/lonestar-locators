// Property Image Intelligence v1.1 — SELECTION ENGINE (composition layer).
//
// v1.1 improves ONLY discovery/resolution. It reuses the FROZEN v1.0 primitives unchanged:
//   • metadataReject, classifyScene, inferPropertyType, familyRank, assetIdentity  (imageEngine.ts)
//   • classifyPropertyImage                                                          (visual_gate.ts)
// and the same technical thresholds (≥800×450, image MIME, decodable). It adds: full-res CDN
// normalization, structured/alternate-page discovery, dedupe-before-vision, and INDEPENDENT
// candidate evaluation (one broken asset never aborts the gallery).
//
// This module performs NO catalog writes — it returns a selection + full evidence; the canary runner
// owns the safe writer + change_requested authorization.
import type { Browser } from "playwright"
import { classifyPropertyImage, type GateResult } from "../visual_gate"
import { classifyScene, familyRank, metadataReject, assetIdentity, type PropertyType } from "../imageEngine"
import { discover, type DiscoveredCand } from "./discover"
import { looksAvif, avifEvalCopy } from "./avif"

export const ALGO_VERSION_V11 = "property-image-intelligence-v1.1"

// NO-CHURN PROTECTION (permanent): a property already resolved by a v1.1 pass must never be re-selected
// or rewritten just because it is processed again. Both the canary and the production runner consult this
// before doing any write; the frozen keep-lock in the writer is the second, independent guarantee.
export function isAlreadyV11(sourceDetail: string | null | undefined): boolean {
  return new RegExp(ALGO_VERSION_V11.replace(/[.]/g, "\\.")).test(sourceDetail ?? "")
}
const MIN_LONG = 800, MIN_SHORT = 450 // identical to v1.0 technical validation
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

export type Dims = { ok: boolean; w?: number; h?: number; mime?: string; bytes?: number; reason?: string }

// Frozen v1.0 technical threshold, exported for regression tests. A wide banner (e.g. 1600×387)
// fails because its SHORT side is < 450 — upscaling its width never makes it acceptable.
export function meetsThreshold(w: number, h: number): boolean {
  return Math.max(w, h) >= MIN_LONG && Math.min(w, h) >= MIN_SHORT
}

export async function validateImage(url: string): Promise<Dims> {
  const sharp = (await import("sharp")).default
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000)
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*", Range: "bytes=0-2097151" }, redirect: "follow", signal: ac.signal }).finally(() => clearTimeout(t))
    if (r.status >= 400) return { ok: false, reason: `http_${r.status}` }
    const mime = (r.headers.get("content-type") ?? "").split(";")[0].toLowerCase()
    if (/svg/.test(mime)) return { ok: false, reason: "svg" }
    if (!/^image\//.test(mime)) return { ok: false, reason: "not_image" }
    const buf = Buffer.from(await r.arrayBuffer())
    let meta; try { meta = await sharp(buf).metadata() } catch { return { ok: false, reason: "undecodable", mime } }
    const w = meta.width ?? 0, h = meta.height ?? 0
    if (Math.max(w, h) < MIN_LONG || Math.min(w, h) < MIN_SHORT) return { ok: false, w, h, mime, bytes: buf.length, reason: `too_small:${w}x${h}` }
    return { ok: true, w, h, mime, bytes: buf.length }
  } catch (e) { return { ok: false, reason: `err:${(e as Error).name}` } }
}

export type EvalCand = DiscoveredCand & {
  chosenUrl?: string; w?: number; h?: number; mime?: string; scene?: string; fam?: string
  gate?: GateResult; status: string; reason?: string; upgraded?: boolean; origW?: number; origH?: number
  avifTranscoded?: boolean
}

export type RecoverResult = {
  website: string; rendered: boolean; blocked: boolean; provider: string
  pagesInspected: string[]; rawCount: number; dedupedCount: number
  evaluated: EvalCand[]
  selected: EvalCand | null
  primaryScene?: string; primaryFam?: string
}

/** Try a candidate's normalized URLs in order; accept the first that is reachable, decodes, and meets
 *  the frozen ≥800×450 threshold. Records original-rendition dims when a larger variant was chosen. */
async function resolveOne(c: DiscoveredCand): Promise<EvalCand> {
  // metadata hard-reject first (cheap, no fetch) — frozen rule, on the discovered url
  const mr = metadataReject(c.discoveredUrl, c.alt)
  if (mr) return { ...c, status: "metadata_reject", reason: mr }
  let origDims: Dims | null = null
  for (let i = 0; i < c.candidateUrls.length; i++) {
    const url = c.candidateUrls[i]
    const v = await validateImage(url)
    if (i === 0 && c.candidateUrls.length > 1) origDims = v // first = the largest normalized request
    if (!v.ok) continue // INDEPENDENT failure — try next rendition, never abort
    // if a normalized (non-original) rendition was accepted, capture the original's dims to prove upgrade
    let upgraded = false, origW: number | undefined, origH: number | undefined
    if (url !== c.candidateUrls[c.candidateUrls.length - 1]) {
      const orig = await validateImage(c.candidateUrls[c.candidateUrls.length - 1]).catch(() => null)
      if (orig && orig.w && orig.h && (orig.w < v.w! || orig.h < v.h!)) { upgraded = true; origW = orig.w; origH = orig.h }
    }
    void origDims
    return { ...c, chosenUrl: url, w: v.w, h: v.h, mime: v.mime, upgraded, origW, origH, status: "validated" }
  }
  return { ...c, status: "no_valid_rendition", reason: "all_renditions_failed_dims_or_reach" }
}

/**
 * Discover + select a Primary for one property. `excludeIdent` (replace mode) is the CURRENT primary's
 * asset identity: a DIFFERENT asset is always allowed; the SAME asset is allowed ONLY as a genuinely
 * larger rendition that now clears ≥800×450 (the A2 upgrade), which is inherently better than the
 * sub-threshold current image. Independent per-candidate evaluation; visual gate is authoritative.
 */
export async function recoverPrimary(opts: {
  website: string; name: string; type: PropertyType; browser?: Browser
  forceRender?: boolean; excludeIdent?: string; excludeExactUrl?: string; maxGate?: number
}): Promise<RecoverResult> {
  const disc = await discover(opts.website, { browser: opts.browser, forceRender: opts.forceRender })
  const evaluated: EvalCand[] = []
  // rank candidates by property-type-aware scene priority BEFORE spending vision (unknown last)
  const ranked = disc.candidates.map((c) => {
    const sc = classifyScene(`${c.alt} ${c.discoveredUrl}`)
    return { c, fam: sc.fam, label: sc.label }
  }).sort((a, b) => familyRank(opts.type, a.fam) - familyRank(opts.type, b.fam))

  let selected: EvalCand | null = null
  let gateCalls = 0
  const maxGate = opts.maxGate ?? 12
  for (const { c, fam, label } of ranked) {
    // replace mode: skip the EXACT current rendition; a larger rendition of the same asset is allowed
    if (opts.excludeExactUrl && (c.discoveredUrl === opts.excludeExactUrl || c.candidateUrls.includes(opts.excludeExactUrl))) {
      evaluated.push({ ...c, fam, scene: label, status: "skip_current_exact" }); continue
    }
    const r = await resolveOne(c)
    r.fam = fam; r.scene = label
    if (r.status !== "validated") { evaluated.push(r); continue }
    // same-asset in replace mode is only acceptable as a genuine upgrade (it passed ≥800×450, current didn't)
    // different-asset always fine. (excludeIdent kept for provenance/reporting.)
    if (gateCalls >= maxGate) { r.status = "gate_budget_reached"; evaluated.push(r); continue }
    // AVIF: the frozen gate can't decode AV1, so gate a transcoded EVALUATION copy (data: URL). The
    // official AVIF stays the source/selected URL; decoding never implies acceptance, and the frozen
    // ≥800×450 rule is enforced on the DECODED pixels.
    let gateUrl = r.chosenUrl!
    if (looksAvif(r.chosenUrl!, r.mime)) {
      const ev = await avifEvalCopy(r.chosenUrl!)
      if (!ev) { r.status = "avif_undecodable"; r.reason = "avif_decode_failed"; evaluated.push(r); continue }
      if (!meetsThreshold(ev.w, ev.h)) { r.status = "no_valid_rendition"; r.reason = `avif_too_small:${ev.w}x${ev.h}`; r.w = ev.w; r.h = ev.h; evaluated.push(r); continue }
      r.w = ev.w; r.h = ev.h; r.avifTranscoded = true; gateUrl = ev.dataUrl
    }
    const g = await classifyPropertyImage(gateUrl); gateCalls++
    r.gate = g
    if (g.verdict === "reject") { r.status = "gate_reject"; r.reason = `visual_${g.category}`; evaluated.push(r); continue }
    if (g.verdict === "error") { r.status = "gate_error"; r.reason = g.reason; evaluated.push(r); continue }
    r.status = "selected"
    evaluated.push(r)
    selected = r
    break // first type-ranked candidate that clears every frozen check wins
  }
  return {
    website: disc.website, rendered: disc.rendered, blocked: disc.blocked, provider: disc.provider,
    pagesInspected: disc.pagesInspected, rawCount: disc.rawCount, dedupedCount: disc.candidates.length,
    evaluated, selected, primaryScene: selected?.scene, primaryFam: selected?.fam,
  }
}

export { assetIdentity }
