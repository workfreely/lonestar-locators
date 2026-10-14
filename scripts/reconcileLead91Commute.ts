// LEAD 91 — the approved one-time commute-destination extraction.
//
// Run: set -a && . ./.env.local && set +a && npx tsx scripts/reconcileLead91Commute.ts
//
// Uses the DEPLOYED pipeline (processNotesLocation), not hand-written SQL, so it takes the same
// refusals: it writes ONLY into empty commute columns, never invents a maximum, and never
// touches Desired Areas. Scoped to this one lead; no other lead is read or written.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { processNotesLocation } from "@/lib/criteria/processNotesLocation"

const LEAD_ID = 91

async function main() {
  const { data: before } = await supabaseAdmin
    .from("leads")
    .select("id, notes, neighborhoods, submarkets, commute_anchor_label, commute_anchor_place_id, commute_max_minutes")
    .eq("id", LEAD_ID).maybeSingle()
  console.log("\nBEFORE:", JSON.stringify(before, null, 2))

  if (before?.commute_anchor_label || before?.commute_anchor_place_id) {
    console.log("\nALREADY SET — the pipeline would refuse. Nothing written.\n")
    return
  }

  const outcome = await processNotesLocation({ leadId: LEAD_ID, notes: before?.notes })
  console.log("\noutcome:", JSON.stringify(outcome))

  const { data: after } = await supabaseAdmin
    .from("leads")
    .select("neighborhoods, submarkets, commute_anchor_label, commute_anchor_place_id, commute_max_minutes")
    .eq("id", LEAD_ID).maybeSingle()
  console.log("\nAFTER :", JSON.stringify(after, null, 2))
  console.log("\nDesired Areas unchanged:", after?.neighborhoods === before?.neighborhoods && after?.submarkets === before?.submarkets)
  console.log("No maximum invented    :", after?.commute_max_minutes === null)
}

main().catch((e) => { console.error(e); process.exit(1) })
