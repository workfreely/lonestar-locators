// AUDIT — canonical phone identity across every lead write path. READ-ONLY.
//
// Beast Sync attributes an incoming iMessage to a lead by phone, so the phone is
// identity. This measures what is actually stored, how many distinct normalizers
// disagree, and which rows would break attribution.
//
// Usage: npx tsx scripts/companion/auditPhoneIdentity.ts
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { isValidUsPhone } from "@/lib/utils/formatPhone"
import { normalizePhone as dedupeNormalize } from "@/lib/leads/normalizeLead"
import { normalizePhone as transcriptNormalize } from "@/lib/messages/getTranscript"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** The attribution rule live in /api/companion/messages today. */
const last10 = (raw: string | null | undefined) => (raw || "").replace(/\D/g, "").slice(-10)

// Non-US NANP area codes. +1 is shared across ~25 countries, so a country-code
// check alone cannot establish "US" — this is the point of the audit, not a
// production list. Canada + the Caribbean members; US territories are listed
// separately because whether they count as "US" is a product decision.
const CANADA = new Set(["204","226","236","249","250","263","289","306","343","354","365","367","368","403","416","418","428","431","437","438","450","468","474","506","514","519","548","579","581","584","587","604","613","639","647","672","683","705","709","742","753","778","780","782","807","819","825","867","873","879","902","905"])
const CARIBBEAN = new Set(["242","246","264","268","284","345","441","473","649","658","664","721","758","767","784","809","829","849","868","869","876"])
const US_TERRITORY = new Set(["340","670","671","684","787","939"])

function nanpShape(raw: string): { ok: boolean; why: string; area?: string } {
  const d = (raw ?? "").replace(/\D/g, "")
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d
  if (ten.length !== 10) return { ok: false, why: `${d.length} digits, not 10/11` }
  const area = ten.slice(0, 3)
  const exch = ten.slice(3, 6)
  if (!/^[2-9]/.test(area)) return { ok: false, why: `area code ${area} starts with ${area[0]} (NANP forbids 0/1)`, area }
  if (!/^[2-9]/.test(exch)) return { ok: false, why: `exchange ${exch} starts with ${exch[0]} (NANP forbids 0/1)`, area }
  if (area[1] === "9" && area[2] === "9" && area[0] === "5") return { ok: false, why: `${area} is a reserved/599 range`, area }
  return { ok: true, why: "valid NANP shape", area }
}

async function main() {
  const res = await db.from("leads").select("id,first_name,last_name,phone,workspace_id,deleted_at").order("id")
  const leads = (res.data ?? []) as Array<Record<string, unknown>>
  const live = leads.filter((l) => !l.deleted_at)

  console.log("═".repeat(88))
  console.log(`STORED PHONE FORMATS — ${leads.length} leads (${live.length} live)`)
  console.log("═".repeat(88))
  const withPhone = leads.filter((l) => l.phone && String(l.phone).trim())
  console.log(`  with a phone                ${withPhone.length}`)
  console.log(`  WITHOUT a phone             ${leads.length - withPhone.length}   <- unattributable until one is added`)

  const shapes = new Map<string, number>()
  for (const l of withPhone) {
    const p = String(l.phone)
    const d = p.replace(/\D/g, "")
    const shape =
      /^\(\d{3}\) \d{3}-\d{4}$/.test(p) ? "(XXX) XXX-XXXX" :
      /^\d{10}$/.test(p) ? "bare 10 digits" :
      /^\+1\d{10}$/.test(p) ? "+1XXXXXXXXXX (E.164)" :
      /^1\d{10}$/.test(p) ? "1XXXXXXXXXX" :
      `other (${d.length} digits)`
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1)
  }
  console.log(`\n  stored representations:`)
  for (const [s, n] of [...shapes.entries()].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${s}`)

  console.log(`\n${"═".repeat(88)}`)
  console.log("DO THE FOUR NORMALIZERS AGREE?")
  console.log("═".repeat(88))
  console.log(`  ${"lead".padEnd(22)}${"stored".padEnd(18)}${"dedupe".padEnd(12)}${"transcript".padEnd(15)}${"companion".padEnd(12)}valid?`)
  let disagree = 0
  for (const l of withPhone.slice(0, 12)) {
    const p = String(l.phone)
    const a = dedupeNormalize(p) ?? "NULL"
    const b = transcriptNormalize(p)
    const c = last10(p)
    const v = isValidUsPhone(p)
    const mismatch = a === "NULL" || b !== `+1${a}` || c !== a
    if (mismatch) disagree++
    console.log(`  ${String(l.id + " " + l.first_name).slice(0, 20).padEnd(22)}${p.padEnd(18)}${a.padEnd(12)}${b.padEnd(15)}${c.padEnd(12)}${v ? "yes" : "NO"}${mismatch ? "   <- DISAGREE" : ""}`)
  }

  console.log(`\n${"═".repeat(88)}`)
  console.log("NANP SHAPE + COUNTRY RESOLUTION (the thing isValidUsPhone cannot do)")
  console.log("═".repeat(88))
  let badShape = 0, canada = 0, carib = 0, territory = 0, usLike = 0
  const problems: string[] = []
  for (const l of withPhone) {
    const p = String(l.phone)
    const s = nanpShape(p)
    if (!s.ok) { badShape++; problems.push(`lead ${l.id} ${l.first_name}: ${p} — ${s.why}`); continue }
    const a = s.area!
    if (CANADA.has(a)) { canada++; problems.push(`lead ${l.id} ${l.first_name}: ${p} — area ${a} is CANADA, not US`) }
    else if (CARIBBEAN.has(a)) { carib++; problems.push(`lead ${l.id} ${l.first_name}: ${p} — area ${a} is CARIBBEAN, not US`) }
    else if (US_TERRITORY.has(a)) { territory++; problems.push(`lead ${l.id} ${l.first_name}: ${p} — area ${a} is a US TERRITORY (product decision)`) }
    else usLike++
  }
  console.log(`  valid NANP shape, US-like area code   ${usLike}`)
  console.log(`  INVALID NANP shape                    ${badShape}   <- isValidUsPhone() accepts these`)
  console.log(`  Canadian area code                    ${canada}`)
  console.log(`  Caribbean area code                   ${carib}`)
  console.log(`  US territory area code                ${territory}`)
  if (problems.length) {
    console.log(`\n  every problem row:`)
    for (const p of problems) console.log(`     ${p}`)
  }

  console.log(`\n${"═".repeat(88)}`)
  console.log("DUPLICATE CANONICAL PHONE WITHIN A WORKSPACE (would make attribution ambiguous)")
  console.log("═".repeat(88))
  const byWs = new Map<string, Map<string, Array<Record<string, unknown>>>>()
  for (const l of withPhone) {
    const ws = String(l.workspace_id ?? "(none)")
    const key = dedupeNormalize(String(l.phone))
    if (!key) continue
    if (!byWs.has(ws)) byWs.set(ws, new Map())
    const m = byWs.get(ws)!
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(l)
  }
  let conflicts = 0
  for (const [ws, m] of byWs) {
    for (const [key, ls] of m) {
      if (ls.length > 1) {
        conflicts++
        console.log(`  workspace ${ws.slice(0, 8)}  phone ${key}  ->  ${ls.length} leads: ${ls.map((x) => `${x.id} ${x.first_name}${x.deleted_at ? "[del]" : ""}`).join(", ")}`)
      }
    }
  }
  console.log(`  ${conflicts === 0 ? "none — attribution is unambiguous today" : `${conflicts} conflict(s)`}`)

  console.log(`\n${"═".repeat(88)}`)
  console.log("THE LIVE ATTRIBUTION RULE'S FAILURE MODES  (slice(-10), no validation)")
  console.log("═".repeat(88))
  for (const [label, input] of [
    ["US, formatted", "(210) 555-1234"],
    ["US, bare", "2105551234"],
    ["US, +1", "+1 210-555-1234"],
    ["UK London", "+44 20 7946 0958"],
    ["Mexico CDMX", "+52 55 1234 5678"],
    ["Canada Toronto", "+1 416 555 1234"],
    ["5-digit shortcode", "12345"],
    ["iMessage email handle", "client@example.com"],
  ] as const) {
    const k = last10(input)
    console.log(`  ${label.padEnd(22)} ${String(input).padEnd(20)} -> last10 "${k}"${k.length === 10 ? "  (10 chars — WOULD be used as identity)" : `  (${k.length} chars)`}`)
  }
  console.log(`\n  "+44 20 7946 0958" yields 2079460958 — area code 207 is MAINE. A UK number`)
  console.log(`  would attribute to a Maine lead if one existed. Nothing in the path rejects it.`)
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1) })
