// LEAD 91 — the one-time, authorized first-contact reconciliation.
//
// Run: set -a && . ./.env.local && set +a && npx tsx scripts/reconcileLead91FirstContact.ts
//
// Uses the DEPLOYED applier (syncFirstContactFromAck), not hand-written SQL, so this takes the
// same guards, the same canonical engine helpers and the same idempotency as a live ACK. It
// sends nothing, enqueues nothing, and never touches the follow-up run.
//
// Every precondition is verified first and ANY failure aborts before a write.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { syncFirstContactFromAck } from "@/lib/followup/firstContactSync"

const LEAD_ID = 91

async function main() {
  const { data: intent } = await supabaseAdmin
    .from("followup_outbound_intents")
    .select("id, lead_id, workspace_id, step_key, sequence_key, dispatch_status, sent_at, local_sent_at")
    .eq("lead_id", LEAD_ID).eq("step_key", "t1").maybeSingle()
  const { data: lead } = await supabaseAdmin
    .from("leads").select("id, crm_status, first_text_sent_at").eq("id", LEAD_ID).maybeSingle()
  const { data: action } = await supabaseAdmin
    .from("lead_next_actions").select("id, status, completed, completed_via")
    .eq("lead_id", LEAD_ID).eq("action_key", "contact_lead").maybeSingle()
  const { data: tl } = await supabaseAdmin
    .from("lead_timeline").select("id").eq("lead_id", LEAD_ID).eq("type", "first_contact")

  const checks: [string, boolean, unknown][] = [
    ["Text 1 has a genuine dispatch_status = sent", intent?.dispatch_status === "sent", intent?.dispatch_status],
    ["it is the new_lead/t1 introduction", intent?.sequence_key === "new_lead" && intent?.step_key === "t1", `${intent?.sequence_key}/${intent?.step_key}`],
    ["lead 91 is still in New", (lead?.crm_status ?? "") === "new", lead?.crm_status],
    ["first_text_sent_at remains null", !lead?.first_text_sent_at, lead?.first_text_sent_at],
    ["Contact Lead action 110 remains open", action?.status === "open" && action?.completed === false, `${action?.id} ${action?.status}`],
    ["no first-contact timeline event exists", (tl ?? []).length === 0, (tl ?? []).length],
  ]
  console.log("\nPRECONDITIONS")
  let allOk = true
  for (const [label, ok, actual] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}  (${JSON.stringify(actual)})`)
    if (!ok) allOk = false
  }
  if (!allOk) { console.log("\nABORTED — a precondition failed. Nothing was written.\n"); process.exit(1) }

  // The device's own local send time, so the CRM records WHEN the renter was actually reached.
  const sentAt = intent!.local_sent_at ?? intent!.sent_at!
  console.log(`\nAPPLYING via the deployed applier, sentAt = ${sentAt}`)
  const result = await syncFirstContactFromAck({
    intentId: intent!.id,
    workspaceId: intent!.workspace_id!,
    sentAt,
  })
  console.log("result:", JSON.stringify(result))
}

main().catch((e) => { console.error(e); process.exit(1) })
