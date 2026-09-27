// Second review sheet for the 9 uncertain Primaries that did NOT render in the first sheet.
// READ-ONLY: fetches the EXISTING Primary URL and MATERIALIZES it into a viewable tile — sharp for
// formats it can decode, macOS `sips` as a fallback for AVIF (this libheif build can't decode AV1).
// No image is replaced; no DB URL changes. Purpose is only to make the current Primary reviewable.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"
import { execFileSync } from "node:child_process"
import sharp from "sharp"
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"
const NINE = ["U-001", "U-004", "U-007", "U-009", "U-013", "U-015", "U-019", "U-022", "U-027"]
const rows = (JSON.parse(fs.readFileSync(`${S}/uncertain_primary_manifest.json`, "utf8")) as any[]).filter((r) => NINE.includes(r.tile))

const COLS = 3, IW = 420, IH = 300, CAP = 78, PAD = 16, TW = IW + PAD * 2, TH = IH + CAP + PAD
const ROWS = Math.ceil(rows.length / COLS), W = COLS * TW, H = ROWS * TH + 64
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

async function materialize(url: string): Promise<{ png: Buffer | null; how: string }> {
  let buf: Buffer
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 25000)
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*" }, redirect: "follow", signal: ac.signal }).finally(() => clearTimeout(t))
    if (!r.ok) return { png: null, how: `HTTP ${r.status}` }
    buf = Buffer.from(await r.arrayBuffer())
  } catch (e: any) { return { png: null, how: "fetch failed" } }
  // 1) try sharp directly
  try { const png = await sharp(buf).resize(IW, IH, { fit: "contain", background: "#eef0f4" }).png().toBuffer(); return { png, how: "sharp" } } catch { /* AVIF etc. */ }
  // 2) fallback: macOS sips decodes AVIF/HEIF via system codecs
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mat9-"))
    const src = path.join(tmp, "src.avif"), out = path.join(tmp, "out.png")
    fs.writeFileSync(src, buf)
    execFileSync("sips", ["-s", "format", "png", src, "--out", out], { stdio: "ignore" })
    const png = await sharp(fs.readFileSync(out)).resize(IW, IH, { fit: "contain", background: "#eef0f4" }).png().toBuffer()
    fs.rmSync(tmp, { recursive: true, force: true })
    return { png, how: "sips(avif)" }
  } catch (e: any) { return { png: null, how: "sips failed: " + String(e.message).slice(0, 30) } }
}

async function tile(r: any): Promise<Buffer> {
  const { png, how } = await materialize(r.cur_url)
  let img = png
  if (!img) {
    const ph = `<svg width="${IW}" height="${IH}" xmlns="http://www.w3.org/2000/svg"><rect width="${IW}" height="${IH}" fill="#f3e6df"/>
      <text x="${IW / 2}" y="${IH / 2 - 6}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="#a15234">could not materialize</text>
      <text x="${IW / 2}" y="${IH / 2 + 16}" text-anchor="middle" font-family="Arial" font-size="12" fill="#a15234">${xml(how)} — open URL</text></svg>`
    img = await sharp(Buffer.from(ph)).png().toBuffer()
  }
  const label = `<svg width="${TW}" height="${TH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${TW}" height="${TH}" fill="#ffffff"/>
    <rect x="${PAD}" y="${PAD}" width="${IW}" height="${IH}" fill="none" stroke="#d7dbe4" stroke-width="1"/>
    <rect x="${PAD}" y="${PAD}" width="64" height="22" fill="#2f6bff"/>
    <text x="${PAD + 6}" y="${PAD + 16}" font-family="Arial" font-size="13" font-weight="700" fill="#ffffff">${r.tile}</text>
    <text x="${PAD}" y="${IH + PAD + 22}" font-family="Arial" font-size="15" font-weight="700" fill="#111318">${xml(clip(r.name, 36))}</text>
    <text x="${PAD}" y="${IH + PAD + 42}" font-family="Arial" font-size="12" fill="#5b6172">${xml(r.market || "—")}  ·  keep  ·  ${xml(how)}</text>
    <text x="${PAD}" y="${IH + PAD + 60}" font-family="Arial" font-size="11" fill="#8a8f9c">${xml(clip(decodeURIComponent((r.cur_url.split("/").pop() || "").split("?")[0]), 46))}</text>
  </svg>`
  console.log(`  ${r.tile} ${r.name} → ${how}`)
  return sharp(Buffer.from(label)).composite([{ input: img, top: PAD, left: PAD }]).png().toBuffer()
}

async function main() {
  const tiles: Buffer[] = []
  for (const r of rows) tiles.push(await tile(r)) // sequential: sips writes temp files
  const composites = tiles.map((input, i) => ({ input, top: 56 + Math.floor(i / COLS) * TH, left: (i % COLS) * TW }))
  const header = `<svg width="${W}" height="56" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="56" fill="#0f1420"/>
    <text x="20" y="26" font-family="Arial" font-size="18" font-weight="700" fill="#ffffff">Uncertain Primary — Second Review (9 re-materialized)</text>
    <text x="20" y="46" font-family="Arial" font-size="12" fill="#aab1c2">These are the EXISTING Primary images (AVIF decoded via system codec / large JPEGs). No image or URL changed. Decide GOOD or BAD.</text></svg>`
  await sharp({ create: { width: W, height: H, channels: 3, background: "#f4f5f7" } })
    .composite([{ input: Buffer.from(header), top: 0, left: 0 }, ...composites]).png()
    .toFile(`${S}/uncertain_primary_second_review.png`)
  console.log(`\nwrote uncertain_primary_second_review.png (${W}x${H}, ${rows.length} tiles)`)
}
main().catch((e) => { console.error(e); process.exit(1) })
