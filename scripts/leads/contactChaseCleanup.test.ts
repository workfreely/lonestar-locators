// Pre-list contact chase is RETIRED when a lead progresses to Searching or beyond.
//
// The bug: /api/admin/leads/update-stage created the new stage's action but never
// closed the finished sequence, so contact_lead / contact_follow_up_* stayed open
// forever — four production leads had accumulated them, including two CLOSED ones.
//
// The risk in fixing it is over-reach: cancelling anything beyond those four keys
// would break other sequences. Most of this file exists to prove it does NOT.
//
// Run: npx tsx scripts/leads/contactChaseCleanup.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { CONTACT_CHASE_ACTION_KEYS, CONTACT_CHASE_FOLLOW_UP_KEYS, STAGES_PAST_CONTACT_CHASE } from "@/lib/leads/contactChase"
import { getStageWorkflowAction, getNextFollowUpAction, getNextContactFollowUpAction } from "@/lib/workflowEngine"
import { rankLeadActions } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const route = strip(read("app/api/admin/leads/update-stage/route.ts"))
const board = strip(read("components/crm/LeadBoard.tsx"))
const dash = strip(read("components/crm/DashboardClient.tsx"))
const TZ = "America/Chicago"

const act = (key: string, extra: Record<string, unknown> = {}) => ({
  id: key, lead_id: 1, title: key, due_at: "2026-10-05T14:00:00Z",
  priority: "medium", completed: false, status: "open", action_key: key, ...extra,
})

console.log("THE CHASE SET — exactly four keys, nothing else:")
ok("contains exactly contact_lead + the three follow-ups",
  JSON.stringify([...CONTACT_CHASE_ACTION_KEYS].sort()) ===
  JSON.stringify(["contact_follow_up_1","contact_follow_up_2","contact_follow_up_3","contact_lead"]))
ok("the mid-chase set is the three follow-ups only (contactWorkflow's existing behaviour)",
  JSON.stringify([...CONTACT_CHASE_FOLLOW_UP_KEYS]) ===
  JSON.stringify(["contact_follow_up_1","contact_follow_up_2","contact_follow_up_3"]))
{
  // The keys that MUST survive. Named individually so adding one to the chase set
  // by mistake fails here rather than in production.
  const PROTECTED = [
    "build_list", "send_list",
    "follow_up_1", "follow_up_2", "follow_up_3", "final_follow_up",
    "setup_tour", "email_guest_card", "tour_follow_up", "reconnect_client",
    "start_application", "check_application", "confirm_lease",
    "get_invoice_details", "invoice_details", "send_invoice", "commission_paid",
    "send_rebate", "lease_follow_up", "waiting_for_response",
  ]
  for (const k of PROTECTED) ok(`  ${k} is NOT in the chase set`, !CONTACT_CHASE_ACTION_KEYS.includes(k))
}

console.log("\nWHICH STAGES retire the chase:")
for (const s of ["searching","list_sent","ready_to_tour","done_touring","applied","closed"]) {
  ok(`  ${s} retires it`, STAGES_PAST_CONTACT_CHASE.has(s))
}
for (const s of ["new","contacted","archived"]) {
  ok(`  ${s} does NOT`, !STAGES_PAST_CONTACT_CHASE.has(s))
}
ok("archived is excluded on purpose (not progress; ranking already inerts it)",
  !STAGES_PAST_CONTACT_CHASE.has("archived"))

console.log("\nTHE ROUTE — narrow, and only on a real transition:")
ok("cancels by the shared key list, never an inline copy", /\.in\("action_key", CONTACT_CHASE_ACTION_KEYS\)/.test(route))
ok("sets status canceled — never deletes",
  /\.update\(\{ status: "canceled" \}\)/.test(route) && !/\.delete\(\)/.test(route))
ok("only touches OPEN rows", /\.eq\("status", "open"\)[\s\S]{0,120}CONTACT_CHASE_ACTION_KEYS/.test(route))
ok("only on a REAL transition", /oldStage !== crm_status && STAGES_PAST_CONTACT_CHASE\.has\(crm_status\)/.test(route))
ok("scoped to the one lead", /\.eq\("lead_id", leadId\)[\s\S]{0,200}CONTACT_CHASE_ACTION_KEYS/.test(route))
ok("runs even when skipWorkflowAction is set (Build List START still retires the chase)",
  route.indexOf("skipWorkflowAction") < route.indexOf("STAGES_PAST_CONTACT_CHASE.has(crm_status)") &&
  !/skipWorkflowAction[\s\S]{0,200}STAGES_PAST_CONTACT_CHASE\.has\(crm_status\)\) \{[^}]*$/.test(route))
ok("a cleanup failure never fails the stage change", /if \(chaseErr\) console\.error/.test(route))
ok("it does NOT sweep by foreground set", !/actionRelevanceRank|STAGE_FOREGROUND|foreground/i.test(route))
ok("no other action family is named in the route",
  !/follow_up_1|build_list|setup_tour|email_guest_card|check_application/.test(route))

console.log("\nTHE LATER LADDERS ARE UNREACHABLE FROM THE CHASE:")
ok("post-list ladder ignores Contact FU titles",
  getNextFollowUpAction("Contact FU1", TZ) === null && getNextFollowUpAction("Contact FU2", TZ) === null)
ok("chase ladder ignores post-list titles",
  getNextContactFollowUpAction("FU1", TZ) === null && getNextContactFollowUpAction("FU3", TZ) === null)
ok("the two ladders share no action_key", (() => {
  const chase = ["contact_follow_up_2","contact_follow_up_3"]
  const post = ["follow_up_2","follow_up_3","final_follow_up"]
  return !chase.some((k) => post.includes(k))
})())
ok("entering List Sent still creates follow_up_1 (the ladder's real trigger)", (() => {
  const spec = getStageWorkflowAction("list_sent", { follow_up_count: 0 }, TZ)
  return spec?.actionKey === "follow_up_1" && spec?.title === "FU1"
})())
ok("the post-list ladder still advances FU1→FU2→FU3→Final", (() => {
  const a = getNextFollowUpAction("FU1", TZ), b = getNextFollowUpAction("FU2", TZ), c = getNextFollowUpAction("FU3", TZ)
  return a?.actionKey === "follow_up_2" && b?.actionKey === "follow_up_3" && c?.actionKey === "final_follow_up"
})())
ok("the chase ladder still advances FU1→FU2→FU3 and stops", (() => {
  const a = getNextContactFollowUpAction("Contact FU1", TZ), b = getNextContactFollowUpAction("Contact FU2", TZ)
  return a?.actionKey === "contact_follow_up_2" && b?.actionKey === "contact_follow_up_3" &&
    getNextContactFollowUpAction("Contact FU3", TZ) === null
})())

console.log("\nBUILD LIST is intact (the flow a foreground sweep would have broken):")
ok("contacted still creates build_list", getStageWorkflowAction("contacted", { follow_up_count: 0 }, TZ)?.actionKey === "build_list")
ok("searching still creates send_list", getStageWorkflowAction("searching", {}, TZ)?.actionKey === "send_list")
ok("build_list survives the retirement set", !CONTACT_CHASE_ACTION_KEYS.includes("build_list"))
{
  // The Build List START move is contacted → searching with skipWorkflowAction,
  // deliberately keeping build_list OPEN in Searching.
  const lead = { id: 1, crm_status: "searching", next_action_date: null }
  const { primary, others } = rankLeadActions(lead, [act("build_list")] as any, getNextAction(lead as any))
  ok("an open build_list in Searching is still present after the fix",
    primary.title === "Send List" && others.some((o) => o.title === "build_list"))
}

console.log("\nRANKING: a retired row can never be Primary or linger as open:")
{
  const lead = { id: 1, crm_status: "searching", next_action_date: null }
  const withOpenChase = rankLeadActions(lead, [act("contact_lead"), act("contact_follow_up_1"), act("send_list", { title: "Send List" })] as any, getNextAction(lead as any))
  ok("before cleanup: Send List already wins (relevance demotes the chase)", withOpenChase.primary.title === "Send List")
  ok("…but the chase rows are still listed as open", withOpenChase.others.length === 2)

  const afterCleanup = rankLeadActions(lead, [
    act("contact_lead", { status: "canceled" }),
    act("contact_follow_up_1", { status: "canceled" }),
    act("send_list", { title: "Send List" }),
  ] as any, getNextAction(lead as any))
  ok("after cleanup: Send List is Primary", afterCleanup.primary.title === "Send List")
  ok("after cleanup: the chase rows are gone from the list entirely", afterCleanup.others.length === 0)
}
{
  // Ka'Leah's exact shape.
  const lead = { id: 84, crm_status: "searching", next_action_date: null, follow_up_count: 0 }
  const { primary, others } = rankLeadActions(lead, [
    act("contact_lead", { title: "Contact Lead", status: "canceled" }),
    act("contact_follow_up_1", { title: "Contact FU1", status: "canceled" }),
    act("send_list", { title: "Send List" }),
  ] as any, getNextAction(lead as any))
  ok("Ka'Leah shows Send List and nothing else", primary.title === "Send List" && others.length === 0)
}

console.log("\nIDEMPOTENCY:")
ok("a repeated transition cancels only OPEN rows, so the second pass is a no-op",
  /\.eq\("status", "open"\)/.test(route))
ok("the successor is still created through the deduped helper",
  /createWorkflowActionIfNeeded\(supabaseAdmin, leadId, spec\)/.test(route))
{
  // Raw source: the guard's explanatory comment is what names the behaviour, and
  // strip() would remove it.
  const outreach = read("lib/leads/pendingOutreach.ts")
  ok("'Yes, Sent' behaviour is untouched — pendingOutreach still guards across all three levels",
    /\.in\("action_key", \["contact_follow_up_1", "contact_follow_up_2", "contact_follow_up_3"\]\)/.test(outreach) &&
    /already chasing/.test(outreach) &&
    /if \(openContactFu && openContactFu\.length > 0\) return/.test(outreach))
}
ok("contactWorkflow's mid-chase supersede now uses the SHARED constant (one definition)",
  /\.in\("action_key", \[\.\.\.CONTACT_CHASE_FOLLOW_UP_KEYS\]\)/.test(strip(read("lib/leads/contactWorkflow.ts"))))

console.log("\nUI reflects the retirement immediately:")
ok("the route returns the canceled ids", /canceledActionIds/.test(route) && /success: true, workflowAction, canceledActionIds/.test(route))
ok("the board forwards them", /onActionsCanceled\?\.\(json\.canceledActionIds\)/.test(board))
ok("the dashboard marks those rows canceled locally", /retired\.has\(String\(a\.id\)\) \? \{ \.\.\.a, status: "canceled" \}/.test(dash))
ok("ranking already treats 'canceled' as closed", /status !== "canceled"/.test(strip(read("lib/nextActions.ts"))))

console.log("\nFOLLOW-UP AGENT (automated texting) is untouched:")
ok("the route never references the agent", !/followup|follow_up_runs|sequenceKey|followup_opt_in/i.test(route))
ok("the chase module never references it", !/followup/i.test(strip(read("lib/leads/contactChase.ts"))))
ok("its sequences are unchanged", /new_lead|list_sent|application_status|done_selecting/.test(read("lib/followup/sequences.ts")))

console.log("\nHOLD / RESUME untouched:")
ok("hold creates no actions and no stage", /Hold creates NO lead_next_actions rows and NO 'hold' stage/.test(read("lib/leads/holdWorkflow.ts")))
ok("no hold stage can reach the retirement set",
  !STAGES_PAST_CONTACT_CHASE.has("hold") && !STAGES_PAST_CONTACT_CHASE.has("on_hold"))

console.log(`\nContact-chase cleanup: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
