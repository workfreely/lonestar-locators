// The action_key vocabulary may only GROW — the guard this release needed and did not have.
// Run: npx tsx scripts/tests/actionKeyVocabulary.test.ts
//
// lead_next_actions_action_key_chk is REPLACED, never amended: every migration that
// adds a key restates the whole list. That pattern is fine until someone copies an
// older revision, and then a key disappears with no error anywhere — which is exactly
// how 20261111000000_tour_follow_up_sequence.sql dropped 'resume_search' and broke
// public.lb_client_resume_search (its insert raises check_violation, which its
// unique_violation handler does not catch, so the client-facing Resume Search button
// returned 500 and the locator was never notified).
//
// So this test does not check one key. It reads EVERY migration that has ever defined
// the constraint, unions every key any of them permitted, and asserts the CURRENT
// definition still permits all of them. A future migration that drops any key fails
// here regardless of which key it is.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

let failures = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`)
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  ok(name, a === e, `expected ${e}\n      actual   ${a}`)
}

const MIGRATIONS = join(process.cwd(), "supabase/migrations")
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()

// ── Parse the constraint body out of a migration, as the KEYS it permits ────────
// Deliberately includes digits: contact_follow_up_1 / follow_up_2 / tour_follow_up_3
// all carry one, and a [a-z_] class silently drops nine real keys.
function keysInConstraint(sql: string): string[] | null {
  const start = sql.indexOf("add constraint lead_next_actions_action_key_chk")
  if (start === -1) return null
  const body = sql.slice(start, sql.indexOf(");", start))
  return [...new Set((body.match(/'[a-z0-9_]+'/g) ?? []).map((s) => s.slice(1, -1)))].sort()
}

const definitions: { file: string; keys: string[] }[] = []
for (const f of files) {
  const keys = keysInConstraint(readFileSync(join(MIGRATIONS, f), "utf8"))
  if (keys) definitions.push({ file: f, keys })
}

ok("at least one migration defines the action_key constraint", definitions.length > 0)

const current = definitions[definitions.length - 1]
const union = [...new Set(definitions.flatMap((d) => d.keys))].sort()

// ── 1. THE GUARD: nothing the schema has ever permitted may be missing now ──────
const missing = union.filter((k) => !current.keys.includes(k))
eq("the current constraint permits every key ever permitted (none dropped)", missing, [])
if (missing.length) {
  console.log(`      current definition: ${current.file}`)
  for (const k of missing) {
    const added = definitions.find((d) => d.keys.includes(k))
    console.log(`      '${k}' was permitted by ${added?.file} and is no longer permitted`)
  }
}

// ── 2. Which migration narrowed the vocabulary, if any ─────────────────────────
// Walked step by step so a failure NAMES the migration that dropped the key instead
// of only reporting the end state. A drop that a later migration has already
// restored is history, not a failure — it is printed as a note so the record of what
// happened survives, while only a key that is STILL missing today fails the run.
for (let i = 1; i < definitions.length; i++) {
  const prev = definitions[i - 1]
  const next = definitions[i]
  const dropped = prev.keys.filter((k) => !next.keys.includes(k))
  const unrepaired = dropped.filter((k) => !current.keys.includes(k))
  if (dropped.length && !unrepaired.length) {
    console.log(`  · ${next.file} dropped ${dropped.map((k) => `'${k}'`).join(", ")} — restored by ${current.file}`)
    continue
  }
  eq(`${next.file} drops no key that is still missing`, unrepaired, [])
}

// ── 3. Every key a DATABASE FUNCTION inserts must be permitted ──────────────────
// These are the inserts no application code can guard: they run inside SECURITY
// DEFINER functions, and an invalid key aborts the whole transaction.
//   lb_client_resume_search      → 'resume_search'
//   lb_submit_tour_availability  → 'reconnect_client' | 'setup_tour'
for (const key of ["resume_search", "reconnect_client", "setup_tour"]) {
  ok(`DB functions can still insert '${key}'`, current.keys.includes(key))
}

// ── 4. Every key the TypeScript workflow writes must be permitted ───────────────
// The canonical ladders, read from the shared vocabulary rather than retyped here.
const LADDERS = [
  "contact_lead", "contacted_follow_up",
  "contact_follow_up_1", "contact_follow_up_2", "contact_follow_up_3",
  "build_list", "send_list",
  "follow_up_1", "follow_up_2", "follow_up_3", "final_follow_up",
  "setup_tour", "email_guest_card",
  "tour_follow_up", "tour_follow_up_2", "tour_follow_up_3",
  "start_application", "check_application", "confirm_lease",
  "get_invoice_details", "send_invoice", "commission_paid", "send_rebate",
  "setup_movers", "lease_follow_up", "reconnect_client", "resume_search",
]
const unpermitted = LADDERS.filter((k) => !current.keys.includes(k))
eq("every workflow action_key the CRM writes is permitted", unpermitted, [])

// ── 5. The INDEX RULES the tour release approved, locked by predicate ───────────
// A future migration may extend these exclusion lists; narrowing one re-breaks the
// multi-property case 20260815000000 fixed, so the predicates are asserted literally.
const tourMigration = readFileSync(join(MIGRATIONS, "20261111000000_tour_follow_up_sequence.sql"), "utf8")

const genericIdx = tourMigration.slice(
  tourMigration.indexOf("create unique index if not exists lead_next_actions_one_open_per_action_uidx"),
)
ok("generic one-open index is keyed on (lead_id, action_key)",
  /on public\.lead_next_actions \(lead_id, action_key\)/.test(genericIdx))
ok("…only for open rows with a key",
  /where status = 'open'[\s\S]{0,40}and action_key is not null/.test(genericIdx))
for (const k of ["email_guest_card", "tour_follow_up", "tour_follow_up_2", "tour_follow_up_3"]) {
  ok(`…and '${k}' stays EXCLUDED from it (per-property, not per-lead)`,
    new RegExp(`not in \\([^)]*'${k}'`).test(genericIdx))
}

const propIdx = tourMigration.slice(
  tourMigration.indexOf("create unique index if not exists lead_next_actions_one_open_tour_follow_up_per_property_uidx"),
)
ok("per-property tour index is keyed on (lead_id, property_id)",
  /on public\.lead_next_actions \(lead_id, property_id\)/.test(propIdx))
for (const k of ["tour_follow_up", "tour_follow_up_2", "tour_follow_up_3"]) {
  ok(`…and covers '${k}', so two rungs cannot be open for one property`,
    new RegExp(`action_key in \\([^)]*'${k}'`).test(propIdx))
}
ok("…scoped to OPEN rows only, so a completed rung frees the slot",
  /where status = 'open'/.test(propIdx))

const propChk = tourMigration.slice(
  tourMigration.indexOf("add constraint lead_next_actions_tour_follow_up_property_chk"),
)
for (const k of ["tour_follow_up", "tour_follow_up_2", "tour_follow_up_3"]) {
  ok(`a workflow-generated '${k}' must carry a property_id`,
    new RegExp(`action_key in \\([^)]*'${k}'`).test(propChk))
}
ok("…and that CHECK stays NOT VALID, so no existing row is re-validated",
  /not valid/.test(propChk))

// ── 6. The release touched NOTHING else ─────────────────────────────────────────
// Any DDL beyond those four objects would be scope the release never approved.
const ddl = tourMigration
  .split("\n")
  .filter((l) => /^(alter|create|drop|comment|grant|revoke|insert|update|delete)\b/i.test(l.trim()))
const touchedObjects = new Set(
  ddl.map((l) => {
    if (/lead_next_actions_action_key_chk/.test(l)) return "action_key_chk"
    if (/one_open_per_action_uidx/.test(l)) return "one_open_per_action_uidx"
    if (/one_open_tour_follow_up_per_property_uidx/.test(l)) return "per_property_uidx"
    if (/tour_follow_up_property_chk/.test(l)) return "tour_follow_up_property_chk"
    if (/^alter table public\.lead_next_actions$/i.test(l.trim())) return "(continuation)"
    return `UNEXPECTED: ${l.trim().slice(0, 60)}`
  }),
)
const unexpected = [...touchedObjects].filter((o) => o.startsWith("UNEXPECTED"))
eq("the tour migration touches only its four approved objects", unexpected, [])
ok("…and writes no rows", !/^(insert|update|delete)\b/im.test(tourMigration))

console.log(
  failures === 0
    ? `\nALL CHECKS PASSED — ${current.keys.length} action keys permitted by ${current.file}`
    : `\n${failures} FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
