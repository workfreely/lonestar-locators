import fs from "node:fs"
const S = process.env.S!
const Q = String.fromCharCode(34)
// parse the diagnostic CSV (quoted)
function parseCsv(txt: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = "", q = false
  for (let i = 0; i < txt.length; i++) { const c = txt[i]
    if (q) { if (c === Q) { if (txt[i+1] === Q) { f += Q; i++ } else q = false } else f += c }
    else if (c === Q) q = true
    else if (c === ",") { row.push(f); f = "" }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = "" }
    else if (c === "\r") {}
    else f += c }
  if (f.length || row.length) { row.push(f); rows.push(row) }
  return rows
}
const raw = parseCsv(fs.readFileSync(`${S}/residual_primary_diagnostic.csv`, "utf8"))
const hdr = raw[0]; const idx = (n: string) => hdr.indexOf(n)
const recs = raw.slice(1).filter(r => r.length >= hdr.length).map(r => Object.fromEntries(hdr.map((h, i) => [h, r[i]])))
const A = recs.filter(r => r.recovery_path === "A")
console.log("Path-A rows:", A.length)
const by = (rs: any[], f: (r: any) => string) => rs.reduce<Record<string, number>>((a, r) => (a[f(r)] = (a[f(r)] ?? 0) + 1, a), {})
console.log("\nA by mechanism:", JSON.stringify(by(A, r => r.failure_mechanism), null, 1))
console.log("A by cohort:", JSON.stringify(by(A, r => r.cohort)))
console.log("\nA mechanism × provider:")
const norm = (p: string) => p.replace(/\/.*/, "").replace("other","custom")
for (const m of [...new Set(A.map(r => r.failure_mechanism))]) {
  const sub = A.filter(r => r.failure_mechanism === m)
  console.log(` ${m} (${sub.length}): ${JSON.stringify(by(sub, r => r.provider))}`)
}
// CDN too-small: inspect current URL for parametric size params
const cdn = A.filter(r => r.failure_mechanism === "low_resolution_only_cdn_variant_maybe")
console.log("\n=== A2 CDN too-small (", cdn.length, ") URL host + size-param analysis ===")
const host = (u: string) => { try { return new URL(u).host } catch { return "?" } }
const hasSize = (u: string) => /[?&](w|h|width|height|mw|mh|maxwidth|size)=/i.test(u) || /\/\d{2,4}x\d{2,4}\//.test(u) || /-\d{3,4}x\d{3,4}\./.test(u)
console.log("CDN hosts:", JSON.stringify(by(cdn, r => host(r.cur_primary_url)), null, 1))
console.log("has explicit size param/segment (deterministically upgradeable):", cdn.filter(r => hasSize(r.cur_primary_url)).length, "/", cdn.length)
fs.writeFileSync(`${S}/pathA_rows.json`, JSON.stringify(A, null, 0))
console.log("\nwrote pathA_rows.json")
