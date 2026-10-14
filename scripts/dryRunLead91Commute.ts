// LEAD 91 — what the notes→commute extraction WOULD write. READ-ONLY, DRY RUN.
//
// Run: set -a && . ./.env.local && set +a && npx tsx scripts/dryRunLead91Commute.ts
//
// Runs the EXISTING pipeline (extractLocationFacts → resolveDestination →
// reconcileLocation → narrowCommutePatch) against this one lead's own note and PRINTS the
// patch. It performs no UPDATE. Nothing else is touched, and no other lead is read.

import { supabaseAdmin } from "@/lib/supabase/admin"
import { extractLocationFacts } from "@/lib/criteria/extractLocationFacts"
import { mayContainLocation } from "@/lib/criteria/locationFacts"
import { reconcileLocation, type ResolvedDestination } from "@/lib/criteria/reconcileLocation"
import { resolveDestination } from "@/lib/criteria/resolveDestination"
import { hasExplicitDestination, narrowCommutePatch } from "@/lib/criteria/notesPatchRules"

const LEAD_ID = 91

async function main() {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, first_name, last_name, neighborhoods, submarkets, commute_anchor_label, commute_anchor_place_id, commute_max_minutes, notes")
    .eq("id", LEAD_ID)
    .maybeSingle()
  if (!lead) { console.log("lead not found"); return }

  console.log(`\nLead ${LEAD_ID} — ${lead.first_name} ${lead.last_name ?? ""}`)
  console.log("  note                    :", JSON.stringify(lead.notes))
  console.log("\nCurrent structured commute columns")
  console.log("  commute_anchor_label    :", lead.commute_anchor_label)
  console.log("  commute_anchor_place_id :", lead.commute_anchor_place_id)
  console.log("  commute_max_minutes     :", lead.commute_max_minutes)
  console.log("\nDesired areas (must NOT be touched)")
  console.log("  neighborhoods           :", JSON.stringify(lead.neighborhoods))
  console.log("  submarkets              :", JSON.stringify(lead.submarkets))

  const notes = (lead.notes ?? "").trim()
  console.log("\nPipeline")
  console.log("  mayContainLocation      :", mayContainLocation(notes))
  console.log("  hasExplicitDestination  :", hasExplicitDestination(lead), "(true would refuse — a person already set one)")
  if (!mayContainLocation(notes) || hasExplicitDestination(lead)) { console.log("\n⇒ the pipeline would write NOTHING.\n"); return }

  const facts = await extractLocationFacts(notes)
  console.log("  extracted destination   :", JSON.stringify(facts.destination))
  console.log("  extracted areas         :", JSON.stringify(facts.areas))
  console.log("  extracted maxDriveMin   :", facts.maxDriveMinutes)

  let resolved: ResolvedDestination | null = null
  if (facts.destination) {
    const r = await resolveDestination(facts.destination.name)
    console.log("  resolveDestination      :", r.status, r.status === "resolved" ? JSON.stringify(r.destination) : "")
    if (r.status === "resolved") resolved = r.destination
  }

  const outcome = reconcileLocation({ lead, facts, resolvedDestination: resolved })
  console.log("  reconcile patch (raw)   :", JSON.stringify(outcome.patch))
  const patch = narrowCommutePatch(lead, outcome.patch)

  console.log("\n╭─ PROPOSED UPDATE ─────────────────────────────────────────────")
  if (Object.keys(patch).length === 0) {
    console.log("│  (nothing — the pipeline declines to write)")
  } else {
    for (const [k, v] of Object.entries(patch)) {
      console.log(`│  ${k.padEnd(24)} ${JSON.stringify((lead as Record<string, unknown>)[k])}  →  ${JSON.stringify(v)}`)
    }
  }
  console.log("╰───────────────────────────────────────────────────────────────")
  console.log("\nNOT EXECUTED. This script performs no UPDATE.\n")
}

main().catch((e) => { console.error(e); process.exit(1) })
