// Property Image Intelligence v1.1 — AVIF evaluation transcode (production-safe, encapsulated).
//
// The frozen visual gate (visual_gate.ts) decodes with sharp/libvips, whose libheif cannot decode these
// AV1 AVIFs ("bad seek") — so AVIF-hosted official photos error at the gate. This module produces a
// TEMPORARY high-quality JPEG *evaluation copy* of an official AVIF as a `data:` URL that the UNMODIFIED
// gate can fetch and decode.
//
// Invariants (do not weaken):
//   • the official AVIF URL stays the source/provenance — it is never altered and the temp JPEG is never
//     stored as the official source (it lives only as an in-memory data: URL for the gate call);
//   • decoding NEVER implies acceptance — metadata reject, the ≥800×450 rule (on DECODED pixels), the
//     frozen visual gate, scene classification and ranking all still apply;
//   • corrupt / invalid / undecodable AVIF fails safely → returns null → the candidate is skipped, never
//     written and never guessed.
//
// Decoder strategy is capability-probed once and encapsulated so the runtime environment picks the right
// path (no hard dependency on any one OS tool):
//   1. sharp/libvips  — portable; used wherever the build actually decodes AVIF;
//   2. macOS `sips`   — system AV1 codec, used ONLY on darwin when the binary is present;
//   3. none           — AVIF candidates are skipped safely (logged once), no crash, no weakening.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"
import { execFileSync } from "node:child_process"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"

export function looksAvif(url: string, mime?: string): boolean {
  return /\.avif(\?|#|$)/i.test(url) || /avif|heif|heic/i.test(mime ?? "")
}

// One-time probe: is the macOS `sips` fallback usable in this environment?
let _sipsChecked = false, _sipsOk = false
function sipsAvailable(): boolean {
  if (_sipsChecked) return _sipsOk
  _sipsChecked = true
  try {
    if (process.platform !== "darwin") { _sipsOk = false }
    else { execFileSync("sips", ["--help"], { stdio: "ignore" }); _sipsOk = true }
  } catch { _sipsOk = false }
  return _sipsOk
}

/** Report the AVIF decode capability of this environment (probe only; safe to call for logging). */
export function avifDecoderInfo(): { sharp: boolean; sips: boolean; note: string } {
  const sips = sipsAvailable()
  // sharp AVIF decode is build-dependent; treated as "attempt at call time" rather than asserted here.
  return { sharp: true, sips, note: sips ? "sharp→sips(darwin)" : "sharp only (no sips fallback in this env)" }
}

/** Fetch the official AVIF and return a `data:image/jpeg;base64,…` evaluation copy (or null on failure).
 *  Also returns the decoded pixel dimensions so the caller enforces the frozen ≥800×450 rule on the ACTUAL
 *  image. Never throws; any failure (network, corrupt, unsupported) → null (fail safe). */
export async function avifEvalCopy(url: string): Promise<{ dataUrl: string; w: number; h: number; decoder: "sharp" | "sips" } | null> {
  let buf: Buffer
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000)
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/avif,image/*" }, redirect: "follow", signal: ac.signal }).finally(() => clearTimeout(t))
    if (!r.ok) return null
    buf = Buffer.from(await r.arrayBuffer())
    if (!buf.length) return null
  } catch { return null }
  const sharp = (await import("sharp")).default
  // 1) portable path: sharp (works where libvips has AVIF); full decode required, not just header read.
  try {
    const jpeg = await sharp(buf).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer()
    const meta = await sharp(jpeg).metadata()
    if (meta.width && meta.height) return { dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, w: meta.width, h: meta.height, decoder: "sharp" }
  } catch { /* sharp cannot decode this AVIF build → try the guarded system fallback */ }
  // 2) macOS system codec, only when actually available
  if (sipsAvailable()) {
    let tmp = ""
    try {
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v11avif-"))
      const src = path.join(tmp, "src.avif"), out = path.join(tmp, "out.jpg")
      fs.writeFileSync(src, buf)
      execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "90", src, "--out", out], { stdio: "ignore" })
      const jbuf = fs.readFileSync(out)
      const meta = await sharp(jbuf).metadata()
      if (meta.width && meta.height) return { dataUrl: `data:image/jpeg;base64,${jbuf.toString("base64")}`, w: meta.width, h: meta.height, decoder: "sips" }
    } catch { /* corrupt / undecodable → fail safe */ }
    finally { if (tmp) try { fs.rmSync(tmp, { recursive: true, force: true }) } catch { /* noop */ } }
  }
  return null // fail safe: undecodable AVIF is skipped, never written or guessed
}
