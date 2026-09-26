// Build a visual contact sheet (PNG) of the prototype's Primary/Fallback selections. Read-only.
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const l of fs.readFileSync(p, "utf8").split("\n")) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36"
const IW = 380, IH = 228, LBL = 22, GAP = 6, NAMEW = 150, HEAD = 34
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function main() {
  const sharp = (await import("sharp")).default
  const rep: { name: string; market: string; type: string; primary: { url: string; scene: string; dims: string } | null; fallback: { url: string; scene: string; dims: string } | null }[] = JSON.parse(fs.readFileSync(`${S}/rc_prototype_result.json`, "utf8"))
  const rowH = LBL + IH + GAP
  const W = NAMEW + 2 * (IW + GAP), Hgt = HEAD + rep.length * rowH
  const cellW = IW + GAP
  async function thumb(url: string | undefined): Promise<Buffer | null> {
    if (!url) return null
    try {
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000)
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ac.signal }).finally(() => clearTimeout(t))
      if (!r.ok) return null
      return await sharp(Buffer.from(await r.arrayBuffer())).resize(IW, IH, { fit: "cover" }).jpeg().toBuffer()
    } catch { return null }
  }
  const composites: sharp.OverlayOptions[] = []
  const svgParts: string[] = [`<rect width="${W}" height="${Hgt}" fill="#0f1115"/>`,
    `<text x="12" y="22" fill="#e8eaed" font-size="16" font-family="system-ui" font-weight="700">RENTCafé/Yardi→Entrata prototype · Primary + Fallback (Cloudflare-blocked sites, recovered via public gallery)</text>`]
  for (let i = 0; i < rep.length; i++) {
    const r = rep[i]; const y = HEAD + i * rowH
    svgParts.push(`<text x="10" y="${y + 20}" fill="#e8eaed" font-size="13" font-family="system-ui" font-weight="600">${esc(r.name)}</text>`)
    svgParts.push(`<text x="10" y="${y + 38}" fill="#9aa4b2" font-size="11" font-family="system-ui">${esc(r.market)}</text>`)
    svgParts.push(`<text x="10" y="${y + 54}" fill="#9aa4b2" font-size="10" font-family="system-ui">${esc(r.type)}</text>`)
    const cells: [string, { url: string; scene: string; dims: string } | null][] = [["PRIMARY", r.primary], ["FALLBACK", r.fallback]]
    for (let c = 0; c < 2; c++) {
      const [tag, sel] = cells[c]; const x = NAMEW + c * cellW
      svgParts.push(`<text x="${x + 6}" y="${y + 15}" fill="#c7d0db" font-size="11" font-family="system-ui"><tspan font-weight="700">${tag}</tspan> · ${sel ? esc(sel.scene) + " · " + sel.dims : "none"}</text>`)
      const buf = await thumb(sel?.url)
      if (buf) composites.push({ input: buf, left: x, top: y + LBL })
    }
  }
  const canvas = sharp({ create: { width: W, height: Hgt, channels: 3, background: "#0f1115" } })
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hgt}">${svgParts.join("")}</svg>`)
  const out = `${S}/rc_prototype_contactsheet.png`
  await canvas.composite([{ input: svg, left: 0, top: 0 }, ...composites]).png().toFile(out)
  console.log("wrote", out)
}
main().catch((e) => { console.error(e); process.exit(1) })
