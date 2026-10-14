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
  AUTOMATED_CONTACT_VIA,
} from "@/lib/followup/firstContactRules"
import { formatLastActionLabel } from "@/lib/leads/workflowActionLabels"
import { completedPatch } from "@/lib/leads/actionCompletion"
import { classifyProvenance } from "@/lib/companion/provenance"
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
ok("it is completed through the canonical patch", /completedPatch\(opts\.sentAt, AUTOMATED_CONTACT_VIA\)/.test(sync))
// Writing only `completed` is the exact bug actionCompletion exists to prevent: the Agenda's
// overdue query filters on status, so a row completed without it stays overdue forever.
const patch = completedPatch("2026-10-14T14:00:47.000Z", "followup_agent")
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
// THE TITLE IS THE TASK, ALWAYS. An earlier version replaced it with "Auto Text Sent", which
// renamed the CRM task after its delivery method and hid which task had actually been done.
ok("an automated contact still reads 'Contacted Lead'", formatLastActionLabel("Contact Lead") === "Contacted Lead")
ok("'Auto Text Sent' is no longer a title anywhere in the app", (() => {
  for (const f of ["lib/leads/workflowActionLabels.ts", "lib/companion/leadToDto.ts", "components/crm/LeadPanel.tsx", "lib/followup/firstContactRules.ts"]) {
    const src = readFileSync(f, "utf8")
    // The phrase may survive in a comment explaining the mistake; it must not survive in code.
    for (const line of src.split("\n")) {
      const code = line.split("//")[0]
      if (/Auto Text Sent/.test(code)) return false
    }
  }
  return true
})())
// EVERY OTHER ACTION KEEPS ITS OWN NAME.
// Through the EXISTING canonical vocabulary (LAST_ACTION_BY_DISPLAY), which already renders a
// completed action in the past tense. These are the app's own conventions, not new titles — the
// point is that no completion method alters any of them.
for (const [stored, shown] of [
  ["Contact Lead", "Contacted Lead"],
  ["Build List", "List Built"],
  ["Send List", "List Sent"],
  ["Send Guest Card", "Guest Card Sent"],
  ["Setup Tour", "Tour Scheduled"],
] as const) {
  const label = formatLastActionLabel(stored)
  ok(`${stored} → ${JSON.stringify(label)}`, label === shown)
}
// The method is a SEPARATE line, and only when the column says so.
const ui = readFileSync("components/crm/CompletedActionLine.tsx", "utf8")
ok("the method renders under the title, never in it", /\{label\}[\s\S]{0,600}"Automated" : "Manually completed"/.test(ui))
ok("Automated shows only for an explicit followup_agent", /const automated = completedVia === AUTOMATED_CONTACT_VIA/.test(ui))
ok("Manually completed shows only for an explicit manual", /const known = completedVia === "manual" \|\| automated/.test(ui))
ok("a NULL legacy row shows no method at all", /\{known && \(/.test(ui))
ok("the method is written on the completed row", /completedPatch\(opts\.sentAt, AUTOMATED_CONTACT_VIA\)/.test(sync))
// NEITHER SURFACE may still be substituting a title. The method travels in its own field.
for (const [file, what] of [["components/crm/LeadPanel.tsx", "the CRM panel"], ["lib/companion/leadToDto.ts", "Beast Companion"]] as const) {
  const src = readFileSync(file, "utf8")
  ok(`${what} no longer renames the task`, !src.includes("AUTOMATED_CONTACT_LABEL"))
  ok(`${what} carries the completion method separately`, /completedVia/.test(src))
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


// ── MANUAL vs AUTOMATED, PERSISTED ──────────────────────────────────────────────────────────
// The method is recorded at the CALL SITE and stored; it is never re-derived later from the
// stage, the message wording or the timestamp, all of which look identical whoever sent it.
console.log("\nHow it was completed")
const manual = completedPatch("2026-10-14T14:04:00.000Z")
ok("a person's completion defaults to manual", manual.completed_via === "manual")
ok("the automated path says so explicitly", completedPatch("x", "followup_agent").completed_via === "followup_agent")
ok("both still write the full canonical shape", manual.completed === true && manual.status === "completed" && !!manual.completed_at)
// THE TITLE DOES NOT MOVE. Whoever completed it, the task is the task — the method is a
// separate line, asserted under "Last Action" below.
ok("manual reads 'Contacted Lead'", formatLastActionLabel("Contact Lead") === "Contacted Lead")
ok("automated reads 'Contacted Lead' too", formatLastActionLabel("Contact Lead") === "Contacted Lead")
// LEGACY: a row completed before completed_via existed has no provenance, and guessing one
// would be worse than silence.
ok("a legacy row keeps its accurate existing label", formatLastActionLabel("Contact Lead") === "Contacted Lead")
ok("and shows no Manual/Automated indicator at all", (() => {
  const ui = readFileSync("components/crm/CompletedActionLine.tsx", "utf8")
  return /const known = completedVia === "manual" \|\| automated/.test(ui) && /\{known && \(/.test(ui)
})())
ok("the column refuses anything outside the two words", (() => {
  const mig = readFileSync("supabase/migrations/20261018000000_action_completed_via.sql", "utf8")
  return /completed_via in \('manual', 'followup_agent'\)/.test(mig) && /completed_via is null or/.test(mig)
})())
ok("origin is left to mean what it always meant — who CREATED the row", !/origin: /.test(sync))

// ── THE APPROVED LAST ACTION PRESENTATION ───────────────────────────────────────────────────
console.log("\nLast Action presentation")
const line = readFileSync("components/crm/CompletedActionLine.tsx", "utf8")
ok("a green check-circle, inline with the title", /<CheckCircle \/>[\s\S]{0,160}\{label\}/.test(line) && /text-emerald-600/.test(line))
ok("the completed timestamp is green", /Completed:[\s\S]{0,160}text-emerald-600/.test(line))
ok("a person glyph for manual, a bot glyph for automated", /automated \? <BotGlyph \/> : <PersonGlyph \/>/.test(line))
ok("the wording is Manually completed / Automated", /"Automated" : "Manually completed"/.test(line))
ok("no arrow between the sections", !/→|&rarr;|ArrowRight/.test(line))
const panel = readFileSync("components/crm/LeadPanel.tsx", "utf8")
ok("the CRM renders the shared component", /<CompletedActionLine/.test(panel))
ok("the divider and the blue Next Action button are untouched", /my-3\.5 border-t border-\[var\(--crm-border-soft\)\]/.test(panel) && /Next Action<\/span>/.test(panel))
ok("Beast Companion receives the same completion method", readFileSync("lib/companion/leadToDto.ts", "utf8").includes("completedVia: contactVia"))
ok("and Companion's titles are the tasks' own names", (() => {
  const dto = readFileSync("lib/companion/leadToDto.ts", "utf8")
  return dto.includes('title: "Contact Lead"') && dto.includes("candidates.push({ title, completedAt: at")
})())

// ── OUTBOUND ATTRIBUTION IN A SELF-CONVERSATION ─────────────────────────────────────────────
// chat.db reports is_from_me = 0 for the received copy of a self-sent message, so an agent
// testing on their own number had every outbound text ingested as a client reply. Corrected by
// IDENTITY — the guid we recorded, or a byte-identical body on an unclaimed 'sent' intent for
// that lead — never by the phone number.
console.log("\nOutbound attribution")
const t1Body = "Hey Testy it's Jay! I got your form for a 1 bed high rise move in October."
const intentRow = { id: "i1", lead_id: 91, rendered_body: t1Body, message_guid: null }
const selfSent = classifyProvenance(
  [{ id: "m1", guid: "g1", lead_id: 91, is_from_me: false, body: t1Body, provenance: null, outbound_intent_id: null }],
  [intentRow],
)
ok("our own send is recognised as outbound despite is_from_me = false", selfSent[0].provenance === "automated_outbound")
ok("and linked to the intent that produced it", selfSent[0].outboundIntentId === "i1")
ok("on body evidence, not the phone number", selfSent[0].basis === "body_correlation")
const byGuid = classifyProvenance(
  [{ id: "m1", guid: "G-REAL", lead_id: 91, is_from_me: false, body: "rewritten by Messages", provenance: null, outbound_intent_id: null }],
  [{ id: "i1", lead_id: 91, rendered_body: t1Body, message_guid: "G-REAL" }],
)
ok("a recorded guid is authoritative on its own", byGuid[0].provenance === "automated_outbound" && byGuid[0].basis === "guid_match")
// A GENUINE REPLY MUST SURVIVE. No intent matches it, so it stays inbound.
const realReply = classifyProvenance(
  [{ id: "m2", guid: "g2", lead_id: 91, is_from_me: false, body: "Yes downtown works", provenance: null, outbound_intent_id: null }],
  [intentRow],
)
ok("a genuine renter reply is still inbound", realReply[0].provenance === "client_inbound" && realReply[0].basis === "inbound")
ok("and is never linked to an intent", realReply[0].outboundIntentId === null)
const otherLead = classifyProvenance(
  [{ id: "m3", guid: "g3", lead_id: 57, is_from_me: false, body: t1Body, provenance: null, outbound_intent_id: null }],
  [intentRow],
)
ok("an identical body on ANOTHER lead is not claimed", otherLead[0].provenance === "client_inbound")
// ONE-TO-ONE: two identical messages cannot both claim one intent.
const twice = classifyProvenance(
  [
    { id: "a", guid: null, lead_id: 91, is_from_me: false, body: t1Body, provenance: null, outbound_intent_id: null },
    { id: "b", guid: null, lead_id: 91, is_from_me: false, body: t1Body, provenance: null, outbound_intent_id: null },
  ],
  [intentRow],
)
ok("a duplicate ingestion claims the intent once", twice.filter((d) => d.outboundIntentId === "i1").length === 1)
ok("and the unclaimed copy stays inbound rather than inventing a link", twice.some((d) => d.provenance === "client_inbound"))
// Real renter conversations were already correct and must stay correct.
const renterOutbound = classifyProvenance(
  [{ id: "m4", guid: "g4", lead_id: 90, is_from_me: true, body: "I just called you!", provenance: null, outbound_intent_id: null }],
  [],
)
ok("a manual outbound with no intent is still manual_outbound", renterOutbound[0].provenance === "manual_outbound" && renterOutbound[0].basis === "no_evidence")
ok("an already-classified row is returned unchanged (idempotent re-sync)", classifyProvenance(
  [{ id: "m5", guid: "g5", lead_id: 91, is_from_me: false, body: t1Body, provenance: "client_inbound", outbound_intent_id: null }],
  [intentRow],
)[0].provenance === "client_inbound")

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
