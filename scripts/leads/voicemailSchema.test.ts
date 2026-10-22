// EVERY COLUMN THE VOICEMAIL MIGRATION WRITES MUST EXIST ON THE LIVE TABLE.
//
// WHY THIS EXISTS. An earlier draft set `updated_at` on public.leads, which has no such column.
// plpgsql is LATE BINDING: `create or replace function` does not resolve column references in the
// body, so the migration applied cleanly and reported success. The failure would only have
// appeared on the first real save, in front of a locator, and the probes that "verified" the
// migration never reached the UPDATE — they ran as service_role, where current_workspace_id() is
// null and the function raises before it gets there.
//
// So this reads the SET clauses out of the migration and checks each column against the real
// schema. Run: npx tsx scripts/leads/voicemailSchema.test.ts
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { c ? (pass++, console.log(`  ✓ ${l}`)) : (fail++, console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`)) }

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
const sql = readFileSync("supabase/migrations/20261103000000_lead_voicemail_script.sql", "utf8")
  .replace(/--.*$/gm, "")

console.log("\nCOLUMNS THE MIGRATION WRITES vs THE LIVE leads TABLE:")
// One row is enough to learn the shape; service_role bypasses RLS.
const { data: sample, error } = await db.from("leads").select("*").limit(1)
if (error) { console.error("could not read leads:", error.message); process.exit(1) }
const live = new Set(Object.keys(sample?.[0] ?? {}))
ok("the live table shape was read", live.size > 10, `${live.size} columns`)

// Every `set a = …, b = …` target inside an `update public.leads`.
const setTargets = new Set<string>()
for (const m of sql.matchAll(/update\s+public\.leads\s+set\s+([\s\S]*?)\s+where/gi)) {
  for (const t of m[1].matchAll(/(?:^|,)\s*([a-z_][a-z0-9_]*)\s*=/gi)) setTargets.add(t[1])
}
ok("at least one SET target was parsed", setTargets.size > 0, [...setTargets].join(","))
for (const col of setTargets) {
  ok(`leads.${col} exists`, live.has(col), "NOT A COLUMN — the RPC would fail at runtime")
}
ok("the only column written is voicemail_script",
  setTargets.size === 1 && setTargets.has("voicemail_script"), [...setTargets].join(","))
ok("…and updated_at specifically is NOT written (it does not exist here)", !setTargets.has("updated_at"))

console.log("\nTHE COLUMN THE MIGRATION ADDS:")
ok("leads.voicemail_script exists live", live.has("voicemail_script"))
const { data: rows } = await db.from("leads").select("id, voicemail_script")
ok(`no lead row was rewritten (${(rows ?? []).length} leads, all null)`,
  (rows ?? []).every((r: Record<string, unknown>) => r.voicemail_script === null))

console.log("\nPERMISSIONS, TESTED AS anon RATHER THAN READ FROM A CATALOG:")
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
for (const [fn, args] of [
  ["save_lead_voicemail_script", { p_lead_id: 94, p_template_key: "list_sent_30_90", p_body: "probe", p_specials_enabled: false }],
  ["clear_lead_voicemail_script", { p_lead_id: 94 }],
] as const) {
  const { error: e } = await anon.rpc(fn, args as never)
  ok(`anon cannot execute ${fn}`, e?.code === "42501" || e?.code === "PGRST202", e ? `${e.code}: ${e.message}` : "IT EXECUTED")
}
const { data: anonLeads, error: anonErr } = await anon.from("leads").select("id, voicemail_script").limit(1)
ok("anon reads no lead rows (RLS unchanged)", !anonErr && (anonLeads ?? []).length === 0,
  anonErr ? anonErr.message : `${(anonLeads ?? []).length} rows`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
}
main()
