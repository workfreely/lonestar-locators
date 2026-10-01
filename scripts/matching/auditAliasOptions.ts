// AUDIT PART 3 — sizing the SMALLEST SAFE alias layer.
//
// READ-ONLY. Measures candidate rules against the live catalog. Implements nothing.
//
// The partial-match keywords divide into two kinds, and conflating them is the whole
// risk:
//
//   MEMBERSHIP  "uptown dallas" · "midtown houston" · "texas medical center"
//               · "east riverside" · "the domain"
//               The keyword names the area, qualified by the market, a determiner,
//               or a local prefix. A property carrying it IS in the area.
//
//   PROXIMITY   "minutes from the domain" · "near texas medical center"
//               · "15 minutes to uptown dallas" · "walking distance to utsa"
//               · "minutes from southtown"
//               The keyword says the property is NEAR the area, which means it is
//               NOT in it. Admitting these is exactly the "pad with weak matches"
//               failure mode, and it is what a naive substring rule would do.
//
// So the rules below are deliberately NOT "substring match". Each is a narrow,
// deterministic rewrite that preserves the membership claim, with a proximity
// rejection applied first as a hard guard.
//
// Usage: npx tsx scripts/matching/auditAliasOptions.ts
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { MARKETS, centerForDesiredArea } from "@/lib/markets/catalog"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()

/** A keyword asserting NEARNESS rather than membership. Never admissible. */
const PROXIMITY = /\b(near|close to|minutes?|mins?|miles?|walking distance|short (walk|drive)|from|to|access|proximity|adjacent|between|around|outside|convenient)\b/

/** Rule A — drop a market-name qualifier and a leading determiner. */
function stripMarketQualifier(keyword: string, marketName: string): string {
  const m = norm(marketName)
  let k = norm(keyword)
  // "uptown dallas" -> "uptown";  "midtown houston" -> "midtown"
  if (k.endsWith(` ${m}`)) k = k.slice(0, -(m.length + 1))
  if (k.startsWith(`${m} `)) k = k.slice(m.length + 1)
  // "the domain" -> "domain"
  k = k.replace(/^the /, "")
  return k.trim()
}

/** Rule B — the form label's own parenthetical / slash parts. */
function labelVariants(label: string): string[] {
  const out = new Set<string>()
  out.add(norm(label.replace(/\([^)]*\)/g, "")))
  const paren = label.match(/\(([^)]*)\)/)
  if (paren) out.add(norm(paren[1]))
  for (const p of label.split("/")) out.add(norm(p.replace(/\([^)]*\)/g, "")))
  out.delete("")
  return [...out]
}

/** Rule C — a known local prefix that still asserts membership. */
const LOCAL_PREFIX = /^(east|west|north|south|texas|downtown|old|upper|lower|greater) /

type Row = { city: string | null; location_keywords: string[] | null }

async function main() {
  const rows: Row[] = []
  let f = 0
  for (;;) {
    const { data, error } = await db.from("property_catalog").select("city,location_keywords").range(f, f + 999)
    if (error) throw new Error(error.message)
    const b = (data ?? []) as Row[]
    rows.push(...b)
    if (b.length < 1000) break
    f += 1000
  }

  let baseTotal = 0, aTotal = 0, bTotal = 0, cTotal = 0, proximityBlocked = 0
  const perLabel: Array<{ market: string; label: string; base: number; a: number; b: number; c: number }> = []

  for (const m of MARKETS) {
    const opts = [...m.neighborhoods, ...m.submarkets]
    if (!opts.length) continue
    // Only markets that can actually search.
    if (!opts.some((o) => centerForDesiredArea(o, m.slug))) continue
    const mk = rows.filter((r) => norm(r.city ?? "") === norm(m.name))

    for (const label of opts) {
      if (!centerForDesiredArea(label, m.slug)) continue
      const n = norm(label)
      const variants = new Set([n, ...labelVariants(label)])
      let base = 0, a = 0, b = 0, c = 0
      for (const r of mk) {
        const kws = (r.location_keywords ?? []).map(norm).filter(Boolean)
        if (!kws.length) continue
        const admissible = kws.filter((k) => !PROXIMITY.test(k))
        proximityBlocked += kws.length - admissible.length

        if (admissible.includes(n)) { base++; continue }                       // today
        if (admissible.some((k) => variants.has(k))) { b++; continue }         // rule B
        if (admissible.some((k) => stripMarketQualifier(k, m.name) === n)) { a++; continue } // rule A
        if (admissible.some((k) => {
          const s = stripMarketQualifier(k, m.name)
          return LOCAL_PREFIX.test(s) && s.replace(LOCAL_PREFIX, "") === n
        })) { c++; continue }                                                  // rule C
      }
      baseTotal += base; aTotal += a; bTotal += b; cTotal += c
      if (a + b + c > 0 || base === 0) perLabel.push({ market: m.name, label, base, a, b, c })
    }
  }

  console.log("═".repeat(92))
  console.log("WHAT EACH CANDIDATE RULE WOULD ADD (searchable markets only)")
  console.log("═".repeat(92))
  console.log("  base = qualifies today (exact keyword equality)")
  console.log("  +B   = the label's own parenthetical / slash parts")
  console.log("  +A   = keyword minus a market-name qualifier or leading 'the'")
  console.log("  +C   = keyword minus a directional/local prefix (east/west/texas/…)")
  console.log("")
  console.log(`  ${"market".padEnd(14)}${"label".padEnd(30)}base   +B   +A   +C`)
  for (const p of perLabel.sort((x, y) => (y.a + y.b + y.c) - (x.a + x.b + x.c))) {
    console.log(`  ${p.market.padEnd(14)}${p.label.padEnd(30)}${String(p.base).padStart(4)} ${String(p.b).padStart(4)} ${String(p.a).padStart(4)} ${String(p.c).padStart(4)}`)
  }

  console.log(`\n${"═".repeat(92)}`)
  console.log("TOTALS")
  console.log("═".repeat(92))
  console.log(`  qualifying property-rows today (exact)            ${baseTotal}`)
  console.log(`  + rule B (label paren / slash parts)              +${bTotal}`)
  console.log(`  + rule A (strip market qualifier / leading 'the')  +${aTotal}`)
  console.log(`  + rule C (strip directional prefix)               +${cTotal}`)
  console.log(`  ────────────────────────────────────────────────────────`)
  console.log(`  combined                                          ${baseTotal + aTotal + bTotal + cTotal}`
    + `   (${(((baseTotal + aTotal + bTotal + cTotal) / Math.max(baseTotal, 1)) * 100 - 100).toFixed(0)}% more)`)
  console.log(`\n  keyword values rejected as PROXIMITY, not membership: ${proximityBlocked}`)
  console.log(`  (a naive substring rule would have admitted these — e.g. "minutes from southtown",`)
  console.log(`   "15 minutes to uptown dallas", "near texas medical center")`)

  // Labels still dead after every rule.
  const stillDead = perLabel.filter((p) => p.base + p.a + p.b + p.c === 0)
  console.log(`\n  labels still with ZERO coverage after all three rules: ${stillDead.length}`)
  for (const p of stillDead) console.log(`     ${p.market} / ${p.label}`)
  console.log(`  (these need catalog DATA, not an alias layer)`)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
