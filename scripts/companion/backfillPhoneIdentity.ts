/**
 * BACKFILL + DRIFT CHECK for canonical phone identity (migration 20261012).
 *
 * Derives leads.phone_e164 and companion_messages.phone_e164 through the SAME
 * TypeScript rule the app uses (lib/phone/identity.ts), then attributes any
 * messages the new identities now connect.
 *
 * Why not SQL: deciding that 416 is Canadian and 787 is Puerto Rico needs the
 * NANP area-code map, which lives in libphonenumber-js. A SQL backfill could only
 * guess from digit counts — which is the bug being fixed.
 *
 * DRY RUN BY DEFAULT. It reads production. Nothing is written without --apply.
 *
 *   npx tsx scripts/companion/backfillPhoneIdentity.ts            report only
 *   npx tsx scripts/companion/backfillPhoneIdentity.ts --apply    write
 *
 * Safe to re-run: it only writes rows whose stored identity differs from the
 * computed one, so a second run reports 0 changes. That also makes it a drift
 * detector — if it ever reports changes again, a write path is not deriving the
 * identity and should be found rather than papered over by re-running this.
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { phoneIdentity } from "@/lib/phone/identity"
import { attributeUnattributedMessages } from "@/lib/companion/attribution"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line.includes("=") || line.trimStart().startsWith("#")) continue
  const k = line.slice(0, line.indexOf("=")).trim()
  if (!process.env[k]) process.env[k] = line.slice(line.indexOf("=") + 1).trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const APPLY = process.argv.includes("--apply")
const rule = (s: string) => console.log(`\n${"═".repeat(78)}\n${s}\n${"═".repeat(78)}`)

type LeadRow = {
  id: number
  first_name: string | null
  last_name: string | null
  phone: string | null
  phone_e164: string | null
  workspace_id: string | null
  deleted_at: string | null
}

async function main() {
  console.log(`\nCANONICAL PHONE IDENTITY BACKFILL  —  ${APPLY ? "APPLY (writing)" : "DRY RUN (read-only)"}`)

  // ── leads ──────────────────────────────────────────────────────────────────
  rule("LEADS")
  const { data: leadData, error: leadErr } = await db
    .from("leads")
    .select("id, first_name, last_name, phone, phone_e164, workspace_id, deleted_at")
  if (leadErr) throw new Error(`reading leads failed — ${leadErr.message}. Has migration 20261012 been applied?`)
  const leads = (leadData ?? []) as LeadRow[]

  const leadChanges: Array<{ id: number; to: string | null }> = []
  const ineligible: Array<{ id: number; name: string; phone: string; reason: string }> = []

  for (const l of leads) {
    const id = phoneIdentity(l.phone)
    if (id.e164 !== l.phone_e164) leadChanges.push({ id: l.id, to: id.e164 })
    // Worth a human's attention only for a LIVE lead that actually has a number:
    // a blank phone is normal, and a deleted lead is nobody's problem.
    if (!l.deleted_at && (l.phone ?? "").trim() && !id.eligible) {
      ineligible.push({
        id: l.id,
        name: `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || "(no name)",
        phone: l.phone as string,
        reason: `${id.reason}${id.region ? ` (${id.region})` : ""}`,
      })
    }
  }

  console.log(`  ${leads.length} leads, ${leads.filter((l) => (l.phone ?? "").trim()).length} with a phone`)
  console.log(`  ${leadChanges.length} need phone_e164 written`)
  console.log(`  ${leadChanges.filter((c) => c.to !== null).length} will get an identity`)

  if (ineligible.length > 0) {
    console.log(`\n  LIVE LEADS WHOSE NUMBER CANNOT BE A BEAST SYNC IDENTITY (${ineligible.length}):`)
    console.log("  These keep their phone as contact information. Beast Sync cannot attribute")
    console.log("  messages to them, and could not before either — it would have matched them")
    console.log("  by last-10 coincidence, which is the defect being removed.")
    for (const r of ineligible) console.log(`     lead ${r.id} ${r.name}: ${r.phone} — ${r.reason}`)
  }

  if (APPLY && leadChanges.length > 0) {
    let done = 0
    for (const c of leadChanges) {
      const { error } = await db.from("leads").update({ phone_e164: c.to }).eq("id", c.id)
      if (error) console.log(`     ! lead ${c.id}: ${error.message}`)
      else done++
    }
    console.log(`\n  wrote ${done}/${leadChanges.length} lead identities`)
  }

  // ── duplicate identities (attribution will refuse to guess at these) ───────
  rule("DUPLICATE IDENTITY WITHIN ONE WORKSPACE")
  const byWsPhone = new Map<string, LeadRow[]>()
  for (const l of leads) {
    if (l.deleted_at) continue // soft-deleted leads cannot be attributed to
    const e164 = phoneIdentity(l.phone).e164
    if (!e164 || !l.workspace_id) continue
    const key = `${l.workspace_id}|${e164}`
    const arr = byWsPhone.get(key)
    if (arr) arr.push(l)
    else byWsPhone.set(key, [l])
  }
  const conflicts = [...byWsPhone.entries()].filter(([, v]) => v.length > 1)
  if (conflicts.length === 0) {
    console.log("  none — every live lead's identity is unique in its workspace")
  } else {
    console.log(`  ${conflicts.length} conflict(s). Messages for these numbers stay UNATTRIBUTED`)
    console.log("  and are marked 'ambiguous' rather than guessed at:")
    for (const [key, rows] of conflicts) {
      const [ws, phone] = key.split("|")
      console.log(`     workspace ${ws.slice(0, 8)}  ${phone}`)
      for (const r of rows) console.log(`        lead ${r.id} ${`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim()}`)
    }
  }

  // ── companion_messages ─────────────────────────────────────────────────────
  rule("COMPANION MESSAGES")
  const { data: msgData, error: msgErr } = await db
    .from("companion_messages")
    .select("id, phone, phone_e164, lead_id, workspace_id")
  if (msgErr) throw new Error(`reading companion_messages failed — ${msgErr.message}`)
  const msgs = (msgData ?? []) as Array<{
    id: string
    phone: string | null
    phone_e164: string | null
    lead_id: number | null
    workspace_id: string | null
  }>

  const msgChanges = msgs
    .map((m) => ({ id: m.id, to: phoneIdentity(m.phone).e164, from: m.phone_e164 }))
    .filter((c) => c.to !== c.from)
  console.log(`  ${msgs.length} messages, ${msgs.filter((m) => m.lead_id).length} already attributed`)
  console.log(`  ${msgChanges.length} need phone_e164 written`)

  if (APPLY && msgChanges.length > 0) {
    let done = 0
    for (const c of msgChanges) {
      const { error } = await db.from("companion_messages").update({ phone_e164: c.to }).eq("id", c.id)
      if (error) console.log(`     ! message ${c.id}: ${error.message}`)
      else done++
    }
    console.log(`  wrote ${done}/${msgChanges.length} message identities`)
  }

  // ── attribution ────────────────────────────────────────────────────────────
  rule("ATTRIBUTION")
  const workspaces = Array.from(new Set(msgs.map((m) => m.workspace_id).filter((w): w is string => !!w)))
  if (!APPLY) {
    console.log(`  ${workspaces.length} workspace(s) would be swept (needs --apply)`)
  } else if (workspaces.length === 0) {
    console.log("  no workspaces have messages — nothing to attribute")
  } else {
    for (const ws of workspaces) {
      // No `identities` filter: a full sweep is exactly right here, because the
      // identities themselves have just changed for every row.
      const r = await attributeUnattributedMessages(db, ws)
      console.log(
        `  workspace ${ws.slice(0, 8)}: attributed ${r.attributed}, no_match ${r.no_match}, ` +
          `ambiguous ${r.ambiguous}, ineligible ${r.ineligible}`,
      )
      for (const c of r.conflicts) console.log(`     conflict ${c.phoneE164} → leads ${c.leadIds.join(", ")}`)
    }
  }

  rule(APPLY ? "DONE" : "DRY RUN — re-run with --apply to write")
  if (!APPLY && (leadChanges.length > 0 || msgChanges.length > 0)) {
    console.log(`  ${leadChanges.length} lead + ${msgChanges.length} message identities pending`)
  }
  if (APPLY) {
    console.log("  Re-run WITHOUT --apply: it should report 0 pending. Anything else means a")
    console.log("  write path is not deriving the identity — find it rather than re-running this.")
  }
}

main().catch((e) => {
  console.error("\nFAILED:", e.message)
  process.exit(1)
})
