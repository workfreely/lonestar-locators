// LEAD 91 — the authorized two-row message-attribution correction.
//
// Run: set -a && . ./.env.local && set +a && npx tsx scripts/reconcileLead91Attribution.ts
//
// These two rows were ingested before the self-conversation fix existed, and applyProvenance
// deliberately only ever classifies rows where provenance IS NULL — it does not rewrite history.
// So this one-off applies the SAME decision function (classifyProvenance) to the two rows, and
// writes only what that function proves.
//
// WHAT IT WILL NOT DO: touch is_from_me (that is Apple's raw value and stays as the device
// reported it), touch any other lead, create an intent, or send anything. Every precondition is
// verified first and ANY failure aborts before a write.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { classifyProvenance } from "@/lib/companion/provenance"

const LEAD_ID = 91

async function main() {
  const { data: msgs } = await supabaseAdmin
    .from("companion_messages")
    .select("id, guid, lead_id, is_from_me, body, provenance, outbound_intent_id, workspace_id")
    .eq("lead_id", LEAD_ID)
    .order("sent_at")
  const { data: intents } = await supabaseAdmin
    .from("followup_outbound_intents")
    .select("id, lead_id, rendered_body, message_guid, dispatch_status, step_key")
    .eq("lead_id", LEAD_ID)
    .eq("dispatch_status", "sent")

  console.log("\nPRECONDITIONS")
  const checks: [string, boolean, unknown][] = []
  checks.push(["exactly two messages, both on lead 91", (msgs ?? []).length === 2 && (msgs ?? []).every((m) => m.lead_id === LEAD_ID), (msgs ?? []).length])
  checks.push(["exactly two acknowledged intents for lead 91", (intents ?? []).length === 2, (intents ?? []).map((i) => i.step_key)])
  checks.push(["every intent is dispatch_status 'sent'", (intents ?? []).every((i) => i.dispatch_status === "sent"), true])

  // No intent may already be linked to some other message, anywhere.
  const { data: linked } = await supabaseAdmin
    .from("companion_messages")
    .select("id, lead_id, outbound_intent_id")
    .in("outbound_intent_id", (intents ?? []).map((i) => i.id))
  checks.push(["neither intent is linked to another message", (linked ?? []).length === 0, (linked ?? []).length])

  // The decision is the shipped function's, not a hand-assignment.
  const decisions = classifyProvenance(
    (msgs ?? []).map((m) => ({ ...m, provenance: null })) as never,
    (intents ?? []) as never,
  )
  const proven = decisions.filter((d) => d.provenance === "automated_outbound" && d.outboundIntentId)
  checks.push(["each message is PROVEN to match its own intent", proven.length === 2, decisions.map((d) => `${d.provenance}/${d.basis}`)])
  checks.push(["the two messages claim two DIFFERENT intents", new Set(proven.map((d) => d.outboundIntentId)).size === 2, true])

  let allOk = true
  for (const [label, ok, actual] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${label}  (${JSON.stringify(actual)})`)
    if (!ok) allOk = false
  }
  if (!allOk) {
    console.log("\nABORTED — a precondition failed. The historical records are unchanged.\n")
    process.exit(1)
  }

  console.log("\nPROPOSED (provenance + outbound_intent_id ONLY; is_from_me untouched)")
  for (const d of proven) {
    const m = (msgs ?? []).find((x) => x.id === d.messageId)!
    console.log(`  ${m.id}`)
    console.log(`     provenance        : ${m.provenance}  →  ${d.provenance}   (${d.basis})`)
    console.log(`     outbound_intent_id: ${m.outbound_intent_id}  →  ${d.outboundIntentId}`)
    console.log(`     is_from_me        : ${m.is_from_me}  →  ${m.is_from_me}  (unchanged — Apple's raw value)`)
  }

  console.log("\nAPPLYING")
  for (const d of proven) {
    const { data, error } = await supabaseAdmin
      .from("companion_messages")
      .update({ provenance: d.provenance, outbound_intent_id: d.outboundIntentId })
      .eq("id", d.messageId)
      .eq("lead_id", LEAD_ID)          // scoped — this one lead, nothing else
      .eq("provenance", "client_inbound") // and only from the value we verified
      .select("id")
    if (error) { console.log(`  ✗ ${d.messageId}: ${error.message}`); process.exit(1) }
    console.log(`  ✓ ${d.messageId} updated (${(data ?? []).length} row)`)
  }
  console.log()
}

main().catch((e) => { console.error(e); process.exit(1) })
