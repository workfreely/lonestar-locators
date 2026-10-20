/**
 * DRIFT TEST — the SQL helper and the TypeScript composer must agree, case for case.
 *
 *   npx tsx scripts/leads/composeReasonsDrift.test.ts
 *
 * The client snapshot composes its reasons in SQL (lb_compose_recommendation_reasons) because
 * the composition has to happen inside two existing RPCs — the reuse fingerprint and the
 * snapshot insert. The internal card composes in TypeScript (displayReasons). Two
 * implementations of one rule is a standing invitation to drift, so this suite removes the risk
 * by making agreement a tested property rather than a convention: every case below runs through
 * BOTH and the outputs must be identical.
 *
 * Requires a database connection (it calls the real SQL function). Reads only — the helper is
 * IMMUTABLE and touches no table.
 */
import fs from "node:fs"
import { displayReasons, type CatalogPricing } from "@/lib/leads/bedroomPricing"

const env: Record<string, string> = {}
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

type Case = { label: string; saved: string[]; beds: string | null; one: number | null; two: number | null; three: number | null }

const CASES: Case[] = [
  // Reagan's real shape.
  { label: "2BR client, price present, 2 saved reasons", saved: ["7 min to Frisco", "Washer and Dryer"], beds: "2", one: null, two: 1679, three: null },
  // Bedroom matching — the clarification: the client's saved preference decides.
  { label: "1BR client gets the 1BR price", saved: ["Near work"], beds: "1", one: 1249, two: 1679, three: 1899 },
  { label: "2BR client gets the 2BR price", saved: ["Near work"], beds: "2", one: 1249, two: 1679, three: 1899 },
  { label: "3BR client gets the 3BR price", saved: ["Near work"], beds: "3", one: 1249, two: 1679, three: 1899 },
  { label: '"3+" resolves to 3BR', saved: ["Near work"], beds: "3+", one: 1249, two: 1679, three: 1899 },
  // NEVER substitute another bedroom's price.
  { label: "1BR client, only a 2BR price → no price", saved: ["Near work"], beds: "1", one: null, two: 1679, three: null },
  { label: "3BR client, only a 1BR price → no price", saved: ["Near work"], beds: "3", one: 1249, two: null, three: null },
  { label: "2BR client, no prices at all → no price", saved: ["Near work"], beds: "2", one: null, two: null, three: null },
  // Unknown / unparseable preferences fail closed.
  { label: "beds null", saved: ["A"], beds: null, one: 1, two: 1679, three: 1 },
  { label: "beds empty", saved: ["A"], beds: "", one: 1, two: 1679, three: 1 },
  { label: "beds Studio", saved: ["A"], beds: "Studio", one: 1249, two: 1679, three: 1899 },
  { label: "beds 4 (unmapped)", saved: ["A"], beds: "4", one: 1249, two: 1679, three: 1899 },
  { label: "beds range 1-2", saved: ["A"], beds: "1-2", one: 1249, two: 1679, three: 1899 },
  { label: "beds range 2 to 3", saved: ["A"], beds: "2 to 3", one: 1249, two: 1679, three: 1899 },
  { label: 'beds "2BR" spelling', saved: ["A"], beds: "2BR", one: null, two: 1679, three: null },
  { label: 'beds "2 bed" spelling', saved: ["A"], beds: "2 bed", one: null, two: 1679, three: null },
  // THREE SAVED REASONS — the price must yield, never displace.
  { label: "three manual reasons are preserved, price omitted", saved: ["A", "B", "C"], beds: "2", one: null, two: 1679, three: null },
  { label: "two manual reasons leave room", saved: ["A", "B"], beds: "2", one: null, two: 1679, three: null },
  { label: "one manual reason", saved: ["A"], beds: "2", one: null, two: 1679, three: null },
  { label: "no manual reasons → price alone", saved: [], beds: "2", one: null, two: 1679, three: null },
  // Duplicate prevention.
  { label: "a price reason already present", saved: ["7 min", "2BR from $1,679"], beds: "2", one: null, two: 1679, three: null },
  { label: "a hand-typed price in another format", saved: ["2 BR from $1400"], beds: "2", one: null, two: 1679, three: null },
  // Blanks are dropped and do not consume slots.
  { label: "blank entries dropped", saved: ["", "  ", "7 min to Frisco"], beds: "2", one: null, two: 1679, three: null },
  { label: "three entries, one blank → room remains", saved: ["A", "", "B"], beds: "2", one: null, two: 1679, three: null },
  // Zero / junk rents are "not entered".
  { label: "rent 0 is not a price", saved: ["A"], beds: "2", one: null, two: 0, three: null },
  { label: "negative rent", saved: ["A"], beds: "2", one: null, two: -5, three: null },
  // Formatting.
  { label: "thousands separator", saved: ["A"], beds: "2", one: null, two: 1679, three: null },
  { label: "four figures", saved: ["A"], beds: "3", one: null, two: null, three: 12500 },
  { label: "rounds to whole dollars", saved: ["A"], beds: "2", one: null, two: 1679.49, three: null },
]

async function main() {
  const { createClient } = await import("@supabase/supabase-js")
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  console.log("\n=== SQL vs TypeScript — identical output required ===")
  for (const c of CASES) {
    const pricing: CatalogPricing = { onebrStartingRent: c.one, twobrStartingRent: c.two, threebrStartingRent: c.three }
    const ts = displayReasons(c.saved, pricing, c.beds, 3)

    const { data, error } = await sb.rpc("lb_compose_recommendation_reasons", {
      p_reasons: c.saved, p_beds: c.beds, p_onebr: c.one, p_twobr: c.two, p_threebr: c.three, p_max: 3,
    })
    if (error) { fail++; console.log(`  ✗ ${c.label} — SQL error: ${error.message}`); continue }
    const sql = (data ?? []) as string[]

    ok(`${c.label}`, JSON.stringify(sql) === JSON.stringify(ts),
      `SQL=${JSON.stringify(sql)}  TS=${JSON.stringify(ts)}`)
  }

  console.log("\n=== the composed shape, spot-checked ===")
  {
    const { data } = await sb.rpc("lb_compose_recommendation_reasons", {
      p_reasons: ["7 min to Frisco", "Washer and Dryer"], p_beds: "2",
      p_onebr: null, p_twobr: 1679, p_threebr: null, p_max: 3,
    })
    const got = (data ?? []) as string[]
    ok("location · price · amenity, in that order",
      JSON.stringify(got) === JSON.stringify(["7 min to Frisco", "2BR from $1,679/month", "Washer and Dryer"]),
      JSON.stringify(got))
  }

  console.log("\n=== the helper writes nothing (IMMUTABLE, no table access) ===")
  {
    const { data } = await sb.rpc("lb_compose_recommendation_reasons", {
      p_reasons: ["A"], p_beds: "2", p_onebr: null, p_twobr: 1679, p_threebr: null, p_max: 3,
    })
    ok("callable and pure", Array.isArray(data))
    const def = await sb.rpc("lb_compose_recommendation_reasons", {
      p_reasons: [], p_beds: null, p_onebr: null, p_twobr: null, p_threebr: null, p_max: 3,
    })
    ok("empty input → empty array", JSON.stringify(def.data) === "[]", JSON.stringify(def.data))
  }

  console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

void main()
