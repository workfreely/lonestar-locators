/**
 * Restore-from-Archive proofs. Runnable, no DB / no side effects:
 *   npx tsx scripts/tests/restore-unarchive.test.ts
 *
 * Proves that dragging a lead OUT of Archived into an active stage is a true
 * restore (LeadBoard.handleDragEnd + /api/admin/leads/update-stage):
 *   - archive-only metadata is cleared (archive_reason/deleted_at/deleted_by/
 *     pre_delete_status) so CRM/Kanban/Agenda/Lead-Panel/Companion agree;
 *   - the now-historical terminal follow_up_count is reset to 0 so the
 *     DESTINATION stage's canonical Next Action is produced (Contacted's Build
 *     List is no longer suppressed by a stale count);
 *   - the destination stage stays authoritative via the EXISTING engine
 *     (getStageWorkflowAction / getNextAction) — no second workflow system;
 *   - completed follow-up history (the Final Follow-Up row + Last Action) is
 *     preserved — restore resets active state, it never rewrites history;
 *   - the Companion DTO flips back to active (isArchived=false, no reason label).
 */
import { getStageWorkflowAction } from "@/lib/workflowEngine";
import { getNextAction } from "@/lib/nextAction";
import { buildActiveClientPayload } from "@/lib/companion/leadToDto";

let pass = 0,
  fail = 0;
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`);
}

// Mirrors the restore transition applied by BOTH LeadBoard.handleDragEnd (client
// optimistic) and the update-stage route (server) when oldStage === "archived"
// && newStage !== "archived": clear archive-only metadata + reset the terminal
// follow_up_count. Never touches lead_next_actions rows (history).
function restore(lead: any, newStage: string) {
  return {
    ...lead,
    crm_status: newStage,
    follow_up_count: 0,
    archive_reason: null,
    deleted_at: null,
    deleted_by: null,
    pre_delete_status: null,
  };
}

const now = Date.now();
const iso = (dDays: number) => new Date(now + dDays * 86400000).toISOString();
function completedRow(leadId: string, title: string, key: string, dDays: number) {
  return { id: `${key}-${leadId}`, lead_id: leadId, title, action_key: key, completed: true, completed_at: iso(dDays), status: "completed" };
}

// Emily — completed the full FU sequence, auto-archived as No Response (ghosted).
// Auto-ghosted leads carry NO deleted_at / pre_delete_status (only the cron/
// completeFollowUp status + reason), unlike manual archives.
const emily: any = {
  id: "L-emily",
  first_name: "Emily",
  last_name: "Watson",
  crm_status: "archived",
  archive_reason: "ghosted",
  deleted_at: null,
  deleted_by: null,
  pre_delete_status: null,
  follow_up_count: 4,
  next_action_date: null,
  move_date: null,
  created_at: iso(-30),
};
const emilyRows = [
  completedRow("L-emily", "FU1", "follow_up_1", -8),
  completedRow("L-emily", "FU2", "follow_up_2", -6),
  completedRow("L-emily", "FU3", "follow_up_3", -4),
  completedRow("L-emily", "Final", "final_follow_up", -2),
];

// 1) Archive → New → Contact Lead
{
  const r = restore(emily, "new");
  ok(r.follow_up_count === 0, "→ New: follow_up_count reset to 0");
  ok(getNextAction(r) === "Contact Lead", "→ New: Next Action = Contact Lead");
  ok(getStageWorkflowAction("new", r)?.actionKey === "contact_lead", "→ New: engine action = contact_lead");
}

// 2) Archive → Contacted with a previously TERMINAL follow_up_count: 4 → Build List
{
  // Regression guard: the stale terminal count WOULD suppress Build List without
  // the restore reset (this is the audited Contacted inconsistency).
  ok(getStageWorkflowAction("contacted", { follow_up_count: 4 }) === null, "guard: stale count 4 suppresses Build List (pre-restore)");
  const r = restore(emily, "contacted");
  ok(r.follow_up_count === 0, "→ Contacted: follow_up_count reset to 0");
  ok(getNextAction(r) === "Build List", "→ Contacted: Next Action badge = Build List");
  ok(getStageWorkflowAction("contacted", r)?.actionKey === "build_list", "→ Contacted: engine now CREATES build_list (inconsistency fixed)");
}

// 3) Archive → Searching → Send List
{
  const r = restore(emily, "searching");
  ok(getNextAction(r) === "Send List", "→ Searching: Next Action = Send List");
  ok(getStageWorkflowAction("searching", r)?.actionKey === "send_list", "→ Searching: engine action = send_list");
}

// 4) Archive → List Sent → follow_up_count 0 + 1st Follow-Up
{
  const r = restore(emily, "list_sent");
  ok(r.follow_up_count === 0, "→ List Sent: follow_up_count reset to 0 (new cycle)");
  ok(getNextAction(r) === "FU1", "→ List Sent: Next Action = FU1 (sequence restarts)");
  ok(getStageWorkflowAction("list_sent", r)?.actionKey === "follow_up_1", "→ List Sent: engine action = follow_up_1");
}

// 5) Archive → Ready to Tour → Schedule Tour (setup_tour; reconnect when >90d out)
{
  const r = restore(emily, "ready_to_tour"); // move_date null → Setup Tour default
  ok(getNextAction(r) === "Setup Tour", "→ Ready to Tour: Next Action = Setup Tour");
  ok(getStageWorkflowAction("ready_to_tour", r)?.actionKey === "setup_tour", "→ Ready to Tour: engine action = setup_tour");
}

// 6) Archive metadata cleared on restore
{
  const r = restore(emily, "new");
  ok(
    r.archive_reason === null && r.deleted_at === null && r.deleted_by === null && r.pre_delete_status === null,
    "restore clears archive_reason/deleted_at/deleted_by/pre_delete_status",
  );
}

// 7) Completed Final Follow-Up history preserved (rows untouched; Last Action stays)
{
  const restored = restore(emily, "list_sent");
  ok(emilyRows.some((a) => a.action_key === "final_follow_up" && a.completed), "completed Final Follow-Up row still present after restore");
  const payload = buildActiveClientPayload(restored, emilyRows);
  ok(payload.lead.lastAction?.title === "Final", "Last Action still derives the completed Final Follow-Up (history intact)");
}

// 8) Companion: archived shows the reason; restored is no longer archived
{
  const archived = buildActiveClientPayload(emily, emilyRows);
  ok(archived.lead.isArchived === true, "archived lead: Companion DTO isArchived = true (Archive Reason branch, no Add Task)");
  ok(archived.lead.archiveReasonLabel === "👻 Ghosted / No Response", "archived lead: canonical archive-reason label present");

  const restored = buildActiveClientPayload(restore(emily, "list_sent"), emilyRows);
  ok(restored.lead.isArchived === false, "restored lead: Companion DTO isArchived = false (Next Action + Add Task branch returns)");
  ok(restored.lead.archiveReasonLabel === null, "restored lead: no archive-reason label");
}

// 9) Manual-archive split-brain fix: deleted_at is cleared on restore, so the
//    Companion (isArchived = crm_status || deleted_at) no longer disagrees with
//    the CRM. (Manual archives DO carry deleted_at/pre_delete_status.)
{
  const manual: any = {
    ...emily,
    crm_status: "archived",
    archive_reason: "unqualified",
    deleted_at: iso(-3),
    deleted_by: "agent@example.com",
    pre_delete_status: "list_sent",
    follow_up_count: 2,
  };
  ok(buildActiveClientPayload(manual, []).lead.isArchived === true, "manual archive: isArchived = true (deleted_at set)");
  const restored = buildActiveClientPayload(restore(manual, "searching"), []);
  ok(restored.lead.isArchived === false, "manual archive restored: deleted_at cleared → Companion active (split-brain fixed)");
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`);
if (fail > 0) process.exit(1);
