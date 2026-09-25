// Load the ambiguous/unmatched qualification cells into property_qualification_review,
// each with the best CATALOG candidate + a confidence (identity is never guessed —
// candidates are suggestions for a human to confirm). Idempotent.
// Run: npx tsx scripts/propertyIntel/qual_queue.ts
import fs from "node:fs"; import path from "node:path"
;(() => { const p = path.join(process.cwd(), ".env.local"); for (const line of fs.readFileSync(p, "utf8").split("\n")) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "") } })()
const S = "/private/tmp/claude-501/-Users-jaymorris-Desktop-lonestar-locators-app/30160563-4dba-40ec-bd16-aeca0a940f8b/scratchpad"
const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "")
const firstLine = (s: string) => (s || "").split("\n")[0].split(" - ")[0].trim()

async function main() {
  const { supabaseAdmin } = await import("@/lib/supabase/admin")
  // catalog names by market (the resolved 711).
  const { data: cat } = await supabaseAdmin.from("property_catalog").select("place_id, property_name, market").not("property_name", "is", null)
  const byMarket: Record<string, { placeId: string; name: string; n: string }[]> = {}
  for (const c of cat ?? []) {
    const m = (c.market as string) ?? "?"
    ;(byMarket[m] ??= []).push({ placeId: c.place_id as string, name: c.property_name as string, n: norm(c.property_name as string) })
  }
  const match = (name: string, market: string) => {
    const n = norm(firstLine(name)); if (n.length < 4) return { conf: "none" as const, cand: null as null | { placeId: string; name: string }, ev: "empty" }
    const pool = byMarket[market] ?? []
    let best: { placeId: string; name: string } | null = null; let conf: "exact" | "strong" | "weak" | "none" = "none"; let ev = "no catalog candidate"
    for (const c of pool) {
      if (c.n === n) { return { conf: "exact" as const, cand: { placeId: c.placeId, name: c.name }, ev: "exact normalized name" } }
      if ((c.n.includes(n) || n.includes(c.n)) && Math.min(c.n.length, n.length) >= 6) { best = { placeId: c.placeId, name: c.name }; conf = "strong"; ev = "name containment" }
    }
    return { conf, cand: best, ev }
  }

  await supabaseAdmin.from("property_qualification_review").delete().gte("id", 0)
  const rows = fs.readFileSync(`${S}/ambiguous.jsonl`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  let inserted = 0; const conf: Record<string, number> = {}
  for (const r of rows) {
    const name = firstLine(r.property ?? "")
    const m = match(r.property ?? "", r.market ?? "")
    conf[m.conf] = (conf[m.conf] ?? 0) + 1
    await supabaseAdmin.from("property_qualification_review").insert({
      source_property_name: name, market: r.market ?? null, criterion: r.column ?? null,
      original_value: r.caveat ?? r.property ?? null, source_file: r.source_file ?? null,
      candidate_place_id: m.cand?.placeId ?? null, candidate_name: m.cand?.name ?? null,
      match_confidence: m.conf, match_evidence: m.ev, status: "pending",
    })
    inserted++
  }
  console.log(JSON.stringify({ inserted, confidence: conf }, null, 1))
}
main().catch((e) => { console.error(e); process.exit(1) })
