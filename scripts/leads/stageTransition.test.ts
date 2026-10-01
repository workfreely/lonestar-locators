// ONE canonical stage-transition pathway.
//
// The defect: a stage was reachable two ways with two different sets of
// consequences. Dragging to List Sent advanced the stage, created FU1, and left
// `send_list` OPEN with the share never marked sent. Production still carries the
// evidence — lead 62 is CLOSED with "Send List" open.
//
// Run: npx tsx scripts/leads/stageTransition.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { stageTransitionPolicy, isForward, isCanonicalDestination } from "@/lib/leads/stageTransition"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

console.log("A STAGE IS EARNED — a forward drag advances exactly ONE step:")
{
  // The reported bug: Delilah went New → Searching and sat in Searching with
  // "Contact Lead" still open — searching for a client nobody had spoken to.
  const jumps: Array<[string, string, string, string]> = [
    ["new", "searching", "contacted", "contact"],
    ["new", "list_sent", "contacted", "contact"],
    ["new", "ready_to_tour", "contacted", "contact"],
    ["new", "closed", "contacted", "contact"],
    ["contacted", "list_sent", "searching", "build_list"],
    ["searching", "ready_to_tour", "list_sent", "send_list"],
    ["searching", "applied", "list_sent", "send_list"],
  ]
  for (const [from, dropped, landsOn, flow] of jumps) {
    const p = stageTransitionPolicy(from, dropped)
    ok(`${from} → ${dropped} is clamped to ${landsOn} (${flow})`,
      p.kind === "canonical" && p.destination === landsOn && p.flow === flow,
      p.kind === "canonical" ? `${p.destination}/${p.flow}` : p.kind)
  }
  // list_sent → applied clamps to ready_to_tour, which NO canonical action earns,
  // so it stays a direct move rather than inventing a confirmation.
  const p = stageTransitionPolicy("list_sent", "applied")
  ok("list_sent → applied clamps to ready_to_tour and stays direct",
    p.kind === "direct" && p.destination === "ready_to_tour")
}
ok("a single step forward is NOT clamped",
  (stageTransitionPolicy("new", "contacted") as { destination: string }).destination === "contacted")
ok("New → Contacted uses the existing Contact Gate",
  (stageTransitionPolicy("new", "contacted") as { flow?: string }).flow === "contact")

console.log("\nEACH STEP uses the action that earns it:")
const cases: Array<[string, string, string]> = [
  ["new", "contacted", "contact"],
  ["contacted", "searching", "build_list"],
  ["searching", "list_sent", "send_list"],
  ["ready_to_tour", "done_touring", "tour_outcome"],
  ["done_touring", "applied", "application"],
  ["applied", "closed", "confirm_lease"],
]
for (const [from, to, flow] of cases) {
  const p = stageTransitionPolicy(from, to)
  ok(`${from} → ${to} uses the ${flow} flow`, p.kind === "canonical" && p.flow === flow, p.kind)
}
// list_sent → ready_to_tour is the one forward step NO action earns: a list was
// sent and the client is ready to look. Direct, with no invented confirmation.
ok("list_sent → ready_to_tour is a direct step", stageTransitionPolicy("list_sent", "ready_to_tour").kind === "direct")
ok("archived opens the archive dialog, never a bare stage write",
  stageTransitionPolicy("closed", "archived").kind === "dialog")

console.log("\nBACKWARD moves are corrective: never clamped, never re-confirmed:")
for (const [from, to] of [["contacted", "new"], ["closed", "new"], ["applied", "searching"], ["list_sent", "contacted"], ["archived", "new"]] as const) {
  const p = stageTransitionPolicy(from, to)
  ok(`${from} → ${to} lands exactly where dropped, directly`,
    p.kind === "direct" && (p as { destination: string }).destination === to)
}
ok("ready_to_tour → list_sent does NOT re-ask to send", stageTransitionPolicy("ready_to_tour", "list_sent").kind === "direct")
ok("applied → done_touring does NOT re-open the tour outcome", stageTransitionPolicy("applied", "done_touring").kind === "direct")

console.log("\nRESTORE from archived is not a pipeline step:")
{
  const p = stageTransitionPolicy("archived", "applied")
  ok("archived → applied is NOT rewound to New", (p as { destination: string }).destination === "applied")
  ok("and still asks for the application confirmation", p.kind === "canonical")
}

console.log("\nDROPPING ON THE SAME COLUMN is a no-op:")
for (const s of ["new", "list_sent", "closed", "archived"]) {
  ok(`${s} → ${s}`, stageTransitionPolicy(s, s).kind === "noop")
}

console.log("\nRESTORING from archived still asks for what the stage requires:")
ok("archived → applied is canonical (not a silent apply)", isCanonicalDestination("archived", "applied"))
ok("archived → closed is canonical", isCanonicalDestination("archived", "closed"))
ok("an unknown/blank prior stage counts as forward", isForward("", "list_sent"))

console.log("\nORDERING:")
ok("list_sent is ahead of searching", isForward("searching", "list_sent"))
ok("searching is NOT ahead of list_sent", !isForward("list_sent", "searching"))
ok("archived is not a pipeline position", !isForward("new", "archived"))

console.log("\nTHE BOARD routes everything through the policy:")
{
  const board = strip(read("components/crm/LeadBoard.tsx"))
  ok("moveLeadToStage consults the policy first", /const policy = stageTransitionPolicy\(lead\?\.crm_status, newStage\)/.test(board))
  ok("a same-column drop returns before any write", /if \(policy\.kind === "noop"\) return/.test(board))
  // The `return` is load-bearing: without it the card moves AND the canonical
  // flow runs, which is worse than either bug alone.
  ok("a canonical destination hands off and RETURNS before any stage write",
    /onRequestCanonical\(lead, policy\.destination, policy\.flow\)\s*\n\s*return/.test(board))
  ok("the hand-off passes the CLAMPED destination, not the dropped column",
    !/onRequestCanonical\(lead, newStage/.test(board))
  ok("direct moves also use the clamped destination",
    /const target = policy\.destination/.test(board) && /applyStageMove\(leadId, target\)/.test(board))
  ok("New → Contacted reuses the existing Contact Gate",
    /policy\.flow === "contact"[\s\S]{0,200}onInitiateContact\(lead\)/.test(board))
  ok("archive goes to the existing dialog", /policy\.kind === "dialog"[\s\S]{0,120}handleArchive\(leadId\)/.test(board))
  ok("the Guest Card guard is still applied to the remaining direct moves",
    /onGuestCardGuard \(?\&\&|onGuestCardGuard &&/.test(board))
}

console.log("\nFAILURE no longer leaves the UI lying:")
{
  const board = strip(read("components/crm/LeadBoard.tsx"))
  ok("res.ok is checked", /if \(!res\.ok\)/.test(board))
  ok("a rejected move reverts the card", /revert\(\)/.test(board))
  ok("a network failure reverts too", /catch \(err\)[\s\S]{0,200}revert\(\)/.test(board))
  ok("the locator is told", /onStageError\?\.\(/.test(board))
  ok("the fetch is no longer an unguarded floating promise", /let res: Response/.test(board))
}

console.log("\nLIST SENT — the full canonical flow, reused not duplicated:")
{
  const dash = strip(read("components/crm/DashboardClient.tsx"))
  ok("a drag prepares/reuses the share through the SAME helper",
    /case "send_list": \{[\s\S]{0,600}await handleSendRecommendations\(lead\)/.test(dash))
  ok("and reveals the EXISTING confirmation rather than a second one",
    /if \(shareId\) setSendConfirm\(true\)/.test(dash))
  ok("no confirmation is offered when the share could not be prepared",
    /const shareId = await handleSendRecommendations\(lead\)\s*\n\s*if \(shareId\)/.test(dash))
  // The core fix: sent_at is now awaited and verified.
  ok("sent_at is awaited, not fire-and-forget", /const markRes = await fetch\(`\/api\/admin\/client-shares\//.test(dash))
  ok("a failed sent_at aborts BEFORE anything is completed or advanced",
    /if \(!marked\) \{[\s\S]{0,400}return/.test(dash))
  ok("there is no second Send List implementation",
    (dash.match(/complete-send-list/g) ?? []).length <= 3)
}

console.log("\nAPPLIED and CLOSED converge on the one stage route:")
{
  const dash = strip(read("components/crm/DashboardClient.tsx"))
  const lease = strip(read("lib/leads/confirmLeaseWorkflow.ts"))
  ok("Applied no longer writes crm_status directly",
    !/from\("leads"\)\.update\(\{ crm_status: "applied" \}\)/.test(dash))
  ok("Applied goes through update-stage", /crm_status: "applied", skipWorkflowAction: true/.test(dash))
  ok("Closed no longer writes crm_status directly",
    !/from\("leads"\)\.update\(patch\)/.test(lease))
  ok("Closed goes through update-stage", /crm_status: "closed", skipWorkflowAction: true/.test(lease))
  // One implementation of the irreversible financial record.
  ok("the duplicate commission snapshot is gone from the client",
    !/resolveClosedCommissionSnapshot/.test(lease))
  ok("the property-scoped successor is preserved on both",
    /actionKey: "check_application"/.test(dash) && /get_invoice_details/.test(lease))
  ok("a rejected stage write does not pretend to have advanced",
    /\[apply\] advance to applied failed/.test(dash) && /stage update rejected/.test(lease))
}

console.log("\nEXISTING SEMANTICS UNTOUCHED:")
{
  const dash = strip(read("components/crm/DashboardClient.tsx"))
  const policy = strip(read("lib/leads/stageTransition.ts"))
  ok("Build List START still keeps build_list open via skipWorkflowAction",
    /case "build_list": \{[\s\S]{0,400}startBuildList\(/.test(dash))
  ok("the policy module contains NO workflow logic of its own",
    !/supabase/.test(policy) && !/fetch\(/.test(policy))
  ok("and no broad action-cancellation rule was added",
    !/cancel[\s\S]{0,40}all/i.test(policy))
}

console.log(`\nStage transition: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
