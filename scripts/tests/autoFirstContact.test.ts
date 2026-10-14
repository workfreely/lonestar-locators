// AUTOMATED FIRST CONTACT — the Follow-Up Agent's Text 1 advances the CRM.
//
// Pure and offline. Run: `npx tsx scripts/tests/autoFirstContact.test.ts`
// Sends nothing, acknowledges nothing, touches no lead.
//
// ── THE GAP ─────────────────────────────────────────────────────────────────────────────────
// recordFirstContact is the canonical successful-contact cascade and it is a BROWSER function:
// it imports the session Supabase client, posts to a relative /api/admin/leads/update-stage
// URL, fires a toast and takes React callbacks. runAck — the Mac Companion's acknowledgment —
// runs server-side under a device token with no user session, updated the intent, advanced the
// follow-up run, and stopped. Nothing connected the two, so the agent could text a brand-new
// lead while the CRM still showed New / Lead Created / Contact Lead overdue. Lead 91 is exactly
// that: both texts delivered at 14:00:45Z and 14:01:28Z, crm_status still "new".
//
// The fix adds no second stage-transition mechanism: the same engine helpers, the same columns,
// the same timeline event. Only the decision of WHEN is new, and it is tested here.

import { readFileSync } from "node:fs"
import {
  decideFirstContactSync,
  stageAdvanceCancelsPair,
  FIRST_CONTACT_SEQUENCE,
  FIRST_CONTACT_STEP,
  AUTOMATED_CONTACT_ORIGIN,
  AUTOMATED_CONTACT_LABEL,
} from "@/lib/followup/firstContactRules"
import { formatLastActionLabel, formatLastActionLabelFor } from "@/lib/leads/workflowActionLabels"
import { completedPatch } from "@/lib/leads/actionCompletion"
import { applicableSequence } from "@/lib/followup/sequences"
import { supersedeTo, inboundStopsRun } from "@/lib/followup/reconcile"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const sentT1 = { sequence_key: "new_lead", step_key: "t1", dispatch_status: "sent", lead_id: 91 }
const newLead = { crm_status: "new", first_text_sent_at: null }

// ── THE TRANSITION ──────────────────────────────────────────────────────────────────────────
console.log("\nText 1 acknowledged as sent")
ok("a genuine new_lead/t1 send advances the CRM", decideFirstContactSync(sentT1, newLead).act === true)
ok("the step it keys on is the introduction", FIRST_CONTACT_SEQUENCE === "new_lead" && FIRST_CONTACT_STEP === "t1")

// ── A SEND THAT DID NOT HAPPEN IS NOT CONTACT ───────────────────────────────────────────────
console.log("\nOnly a real device acknowledgment counts")
for (const status of ["pending", "claimed", "failed", "superseded", "", null, undefined] as const) {
  const d = decideFirstContactSync({ ...sentT1, dispatch_status: status }, newLead)
  ok(`dispatch_status ${JSON.stringify(status)} never counts as contact`, d.act === false && d.reason === "not_sent")
}

// ── ONLY THE INTRODUCTION ───────────────────────────────────────────────────────────────────
console.log("\nOnly the introduction text")
ok("Text 2 does not advance the stage", decideFirstContactSync({ ...sentT1, step_key: "t2" }, newLead).reason === "not_the_intro_text")
ok("a contact follow-up does not", decideFirstContactSync({ ...sentT1, step_key: "contact_fu1" }, newLead).reason === "not_the_intro_text")
ok("a later sequence does not", decideFirstContactSync({ ...sentT1, sequence_key: "list_sent", step_key: "t1" }, newLead).reason === "not_the_intro_text")

// ── THE AGENT'S OWN WORK IS NEVER REGRESSED ─────────────────────────────────────────────────
console.log("\nA manually advanced lead is never dragged back")
for (const stage of ["contacted", "searching", "list_sent", "ready_to_tour", "applied", "closed", "archived"]) {
  ok(`${stage} is left exactly where the agent put it`, decideFirstContactSync(sentT1, { crm_status: stage, first_text_sent_at: null }).reason === "already_contacted")
}
ok("case is not a loophole", decideFirstContactSync(sentT1, { crm_status: "Contacted", first_text_sent_at: null }).reason === "already_contacted")
ok("a missing lead is a refusal, not a crash", decideFirstContactSync(sentT1, null).reason === "no_lead")

// ── IDEMPOTENCY ─────────────────────────────────────────────────────────────────────────────
console.log("\nDuplicate acknowledgments")
ok("a second ack does nothing — first_text_sent_at is already stamped",
  decideFirstContactSync(sentT1, { crm_status: "new", first_text_sent_at: "2026-10-14T14:00:47Z" }).reason === "already_recorded")
ok("blank whitespace is not a stamp", decideFirstContactSync(sentT1, { crm_status: "new", first_text_sent_at: "   " }).act === true)
// The second layer: even a simultaneous pair cannot both win, because the stage write is
// guarded on the old value.
const sync = readFileSync("lib/followup/firstContactSync.ts", "utf8")
ok("the stage write is guarded on crm_status = 'new', so a race has one winner", /\.update\(\{ crm_status: "contacted"[\s\S]{0,200}\.eq\("crm_status", "new"\)/.test(sync))
ok("everything after it runs only for the winner", /if \(!advanced \|\| advanced\.length === 0\) return \{ synced: false, reason: "already_contacted" \}/.test(sync))

// ── THE OPEN CONTACT LEAD ACTION ────────────────────────────────────────────────────────────
console.log("\nThe stale overdue reminder")
ok("it is completed through the canonical patch", /completedPatch\(opts\.sentAt\)/.test(sync))
// Writing only `completed` is the exact bug actionCompletion exists to prevent: the Agenda's
// overdue query filters on status, so a row completed without it stays overdue forever.
const patch = completedPatch("2026-10-14T14:00:47.000Z")
ok("which sets status too, so the Agenda stops matching it", patch.status === "completed" && patch.completed === true && !!patch.completed_at)
ok("the right row is resolved server-side, not from React state", /resolveOpenActionId\(supabaseAdmin, lead!\.id, "contact_lead"\)/.test(sync))

// ── THE SUCCESSOR COMES FROM THE EXISTING ENGINE ────────────────────────────────────────────
console.log("\nNo second stage-transition mechanism")
ok("the successor is the engine's own, not a hand-written Build List", /getStageWorkflowAction\("contacted"/.test(sync))
ok("created through the deduping helper", /createWorkflowActionIfNeeded\(supabaseAdmin, lead!\.id, spec\)/.test(sync))
ok("the locator's timezone and working hours decide its deadline", /resolveUserTimeZone/.test(sync) && /resolveWorkHoursFromProfile/.test(sync))
ok("first_text_sent_at is the same canonical column the manual path writes", /first_text_sent_at: opts\.sentAt/.test(sync))
ok("the timeline event is the same first_contact row", /type: "first_contact"/.test(sync) && /method: "text"/.test(sync))
// A REPLY IS A DIFFERENT FACT. Outreach happened; the renter has not answered. Asserted on
// what the applier WRITES, not on its prose: no inbound baseline, no message row, and the only
// stage it can ever set is "contacted".
ok("it writes no inbound baseline", !/baseline_inbound_at/.test(sync))
ok("it inserts no message row", !/from\("companion_messages"\)/.test(sync))
ok("the only stage it can set is contacted", (sync.match(/crm_status: "[a-z_]+"/g) || []).every((m) => m === 'crm_status: "contacted"'))

// ── TEXT 2 MUST STILL GO ────────────────────────────────────────────────────────────────────
console.log("\nText 2 is not collateral damage")
const lead = (crmStatus: string) => ({ crmStatus, appliedAt: null } as never)
const share = { sentAt: null, doneSelectingAt: null } as never
ok("new and contacted are the SAME applicable sequence", applicableSequence(lead("new"), share) === applicableSequence(lead("contacted"), share))
const run = { sequenceKey: "new_lead", stepKey: "t2", status: "waiting" } as never
ok("so advancing the stage supersedes nothing", supersedeTo(run, lead("contacted"), share).supersede === false)
ok("only a terminal stage would cancel the pair", stageAdvanceCancelsPair("new", "contacted") === false && stageAdvanceCancelsPair("new", "closed") === true && stageAdvanceCancelsPair("new", "archived") === true)
ok("the applier touches no intent and no run", !/followup_outbound_intents[\s\S]{0,80}update|updateRun|\.from\("lead_followup_runs"\)/.test(sync))
// STOP and opt-out are unchanged: an ordinary reply still does not stop the consent-only pair,
// and a hard opt-out still works through the same path it always did.
ok("an ordinary reply still does not stop the opening pair", inboundStopsRun({ sequenceKey: "new_lead", stepKey: "t2", status: "waiting" } as never).stop === false)
ok("a reply DOES stop a full-gated step", inboundStopsRun({ sequenceKey: "list_sent", stepKey: "fu1", status: "waiting" } as never).stop === true)

// ── LAST ACTION SAYS WHO ────────────────────────────────────────────────────────────────────
console.log("\nLast Action")
ok("an automated contact reads 'Auto Text Sent'", formatLastActionLabelFor("Contact Lead", AUTOMATED_CONTACT_ORIGIN) === AUTOMATED_CONTACT_LABEL)
ok("a manual one is unchanged", formatLastActionLabelFor("Contact Lead", "workflow") === formatLastActionLabel("Contact Lead"))
ok("and so is every other action", formatLastActionLabelFor("Build List", null) === formatLastActionLabel("Build List"))
ok("the marker is carried on the completed row", /origin: AUTOMATED_CONTACT_ORIGIN/.test(sync))
for (const [file, what] of [["components/crm/LeadPanel.tsx", "the CRM panel"], ["lib/companion/leadToDto.ts", "Beast Companion"]] as const) {
  const src = readFileSync(file, "utf8")
  ok(`${what} shows the automated label`, src.includes("AUTOMATED_CONTACT_LABEL") && src.includes("AUTOMATED_CONTACT_ORIGIN"))
}

// ── WIRED TO THE ACKNOWLEDGMENT, AND ONLY THERE ─────────────────────────────────────────────
console.log("\nWired into the ACK")
const ack = readFileSync("app/api/companion/outbound/ack/route.ts", "utf8")
ok("it runs on a sent acknowledgment", /if \(result\.status === "sent" && !result\.already\)/.test(ack))
ok("AFTER runAck, never in front of it", ack.indexOf("runAck(store") < ack.indexOf("syncFirstContactFromAck("))
ok("a failed ack never reaches it", !/status === "failed"[\s\S]{0,120}syncFirstContactFromAck/.test(ack))
// NEGATIVE CONTROL: the applier must actually be called, or every assertion above is theatre.
ok("the ack route really calls it", /await syncFirstContactFromAck\(\{ intentId, workspaceId, sentAt: localSentAt \}\)/.test(ack))
ok("the applier never throws into the ack", /catch \(e\)[\s\S]{0,200}return \{ synced: false, reason: "error" \}/.test(sync))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
