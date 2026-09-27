// Build the 28-tile uncertain-Primary contact sheet (READ-ONLY: fetches current Primary URLs, composes
// one PNG). These 28 are "uncertain" only because the audit's decode/resize step failed (AVIF/format or
// partial-range fetch) — not because they are visually borderline. Human eyes decide GOOD/BAD.
import fs from "node:fs"
import sharp from "sharp"
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"
const rows = JSON.parse(fs.readFileSync(`${S}/uncertain_primary_manifest.json`, "utf8")) as any[]

const COLS = 4, IW = 360, IH = 240, CAP = 74, PAD = 14, TW = IW + PAD * 2, TH = IH + CAP + PAD
const ROWS = Math.ceil(rows.length / COLS)
const W = COLS * TW, H = ROWS * TH + 64
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s)

async function tile(r: any): Promise<Buffer> {
  let img: Buffer | null = null, why = ""
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 15000)
    const resp = await fetch(r.cur_url, { headers: { "User-Agent": UA, Accept: "image/*" }, signal: ac.signal, redirect: "follow" }).finally(() => clearTimeout(t))
    if (!resp.ok) why = `HTTP ${resp.status}`
    else { const b = Buffer.from(await resp.arrayBuffer()); try { img = await sharp(b).resize(IW, IH, { fit: "contain", background: "#eef0f4" }).png().toBuffer() } catch { why = "decode failed (format)" } }
  } catch (e: any) { why = "fetch failed" }
  if (!img) {
    const fname = decodeURIComponent(r.cur_url.split("/").pop() || "").split("?")[0]
    const ph = `<svg width="${IW}" height="${IH}" xmlns="http://www.w3.org/2000/svg"><rect width="${IW}" height="${IH}" fill="#f3e6df"/>
      <rect x="0" y="0" width="${IW}" height="${IH}" fill="none" stroke="#e0a58f" stroke-width="2"/>
      <text x="${IW / 2}" y="${IH / 2 - 24}" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" fill="#a15234">image could not be rendered here</text>
      <text x="${IW / 2}" y="${IH / 2 - 2}" text-anchor="middle" font-family="Arial" font-size="12" fill="#a15234">${xml(why || "unknown")} — open URL to view</text>
      <text x="${IW / 2}" y="${IH / 2 + 24}" text-anchor="middle" font-family="Arial" font-size="11" fill="#8a5a44">${xml(clip(fname, 40))}</text></svg>`
    img = await sharp(Buffer.from(ph)).png().toBuffer()
  }
  const label = `<svg width="${TW}" height="${TH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${TW}" height="${TH}" fill="#ffffff"/>
    <rect x="${PAD}" y="${PAD}" width="${IW}" height="${IH}" fill="none" stroke="#d7dbe4" stroke-width="1"/>
    <rect x="${PAD}" y="${PAD}" width="64" height="22" fill="#2f6bff"/>
    <text x="${PAD + 6}" y="${PAD + 16}" font-family="Arial" font-size="13" font-weight="700" fill="#ffffff">${r.tile}</text>
    <text x="${PAD}" y="${IH + PAD + 20}" font-family="Arial" font-size="14" font-weight="700" fill="#111318">${xml(clip(r.name, 34))}</text>
    <text x="${PAD}" y="${IH + PAD + 38}" font-family="Arial" font-size="12" fill="#5b6172">${xml(r.market)}  ·  keep</text>
    <text x="${PAD}" y="${IH + PAD + 56}" font-family="Arial" font-size="11" fill="#8a8f9c">decode-fail (needs human view)</text>
  </svg>`
  return sharp(Buffer.from(label)).composite([{ input: img, top: PAD, left: PAD }]).png().toBuffer()
}

async function main() {
  const tiles = await Promise.all(rows.map(tile))
  const composites = tiles.map((input, i) => ({ input, top: 56 + Math.floor(i / COLS) * TH, left: (i % COLS) * TW }))
  const header = `<svg width="${W}" height="56" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="56" fill="#0f1420"/>
    <text x="20" y="26" font-family="Arial" font-size="18" font-weight="700" fill="#ffffff">Uncertain Primary Images — Human Review (U-001 … U-028)</text>
    <text x="20" y="46" font-family="Arial" font-size="12" fill="#aab1c2">All 28 flagged only because the automated audit could not decode/resize them (AVIF / partial fetch). Decide GOOD or BAD by eye.</text></svg>`
  await sharp({ create: { width: W, height: H, channels: 3, background: "#f4f5f7" } })
    .composite([{ input: Buffer.from(header), top: 0, left: 0 }, ...composites]).png()
    .toFile(`${S}/uncertain_primary_contact_sheet.png`)
  console.log(`wrote uncertain_primary_contact_sheet.png (${W}x${H}, ${rows.length} tiles)`)
}
main().catch((e) => { console.error(e); process.exit(1) })
