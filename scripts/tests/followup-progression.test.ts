/**
 * List Sent follow-up progression proofs. Runnable, no DB / no side effects:
 *   npx tsx scripts/tests/followup-progression.test.ts
 *
 * Proves the Send List → Final Follow-Up chain:
 *   - successor identity chain FU1 → FU2 → FU3 → Final → (none)
 *   - the count-based automatic Next Action advances in lockstep with the
 *     successor rows (the fix): 1st → 2nd → 3rd → Final Follow-Up, then none
 *   - completing Final creates no successor and never repeats
 *   - only ever one open follow-up at a time
 *
 * (Duplicate-insert dedup by action_key is covered by
 *  scripts/tests/a1-workflow-canonicalization.test.ts via a mock client.)
 */
import { getNextFollowUpAction } from "@/lib/workflowEngine";
import { getNextAction } from "@/lib/nextAction";
import { rankLeadActions } from "@/lib/nextActions";
import { followUpSuccessorDueAt } from "@/lib/workflow/moveDateCadence";
import { formatWorkflowActionLabel } from "@/lib/leads/workflowActionLabels";

let pass = 0,
  fail = 0;
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`);
}

const now = Date.now();
const iso = (d: number) => new Date(now + d * 86400000).toISOString();

// 1) Successor identity chain
ok(getNextFollowUpAction("FU1")?.actionKey === "follow_up_2", "FU1 → follow_up_2");
ok(getNextFollowUpAction("FU2")?.actionKey === "follow_up_3", "FU2 → follow_up_3");
ok(getNextFollowUpAction("FU3")?.actionKey === "final_follow_up", "FU3 → final_follow_up");
ok(getNextFollowUpAction("Final") === null, "Final → no successor (chain ends)");
ok(getNextFollowUpAction("Final FU") === null, "Final FU → no successor");

// 2) Progression display advances in lockstep (mirrors the completeFollowUp /
//    handleCompleteAction fix: count +1 and next_action_date := successor due).
function mkRow(title: string, key: string, completed: boolean, due: number) {
  return { id: Math.random(), lead_id: "L", title, action_key: key, completed, completed_at: completed ? iso(-1) : null, due_at: iso(due), priority: "medium", notes: null, created_at: iso(-2) };
}
let lead: any = { id: "L", crm_status: "list_sent", follow_up_count: 0, next_action_date: iso(-1), move_date: iso(200) };
let rows: any[] = [mkRow("FU1", "follow_up_1", false, -1)];
const wantLabels = ["1st Follow-Up", "2nd Follow-Up", "3rd Follow-Up", "Final Follow-Up"];
const stepTitles = ["FU1", "FU2", "FU3", "Final"];
for (let i = 0; i < stepTitles.length; i++) {
  const r = rankLeadActions(lead, rows as any, getNextAction(lead));
  ok(formatWorkflowActionLabel(r.primary.title) === wantLabels[i], `open step ${i + 1} shows "${wantLabels[i]}"`, `got "${formatWorkflowActionLabel(r.primary.title)}"`);
  const openFU = rows.filter((x) => !x.completed && /follow_up|fu\d|final/i.test(x.action_key || x.title)).length;
  ok(openFU === 1, `  exactly one open follow-up at step ${i + 1} (got ${openFU})`);
  // Complete + apply the cache advance + create successor
  rows = rows.map((x) => (x.title === stepTitles[i] ? { ...x, completed: true, completed_at: iso(-1) } : x));
  const succ = getNextFollowUpAction(stepTitles[i]);
  const newCount = (Number(lead.follow_up_count) || 0) + 1;
  const nextDue = succ ? followUpSuccessorDueAt(stepTitles[i], lead, succ.dueAt) : null;
  lead = { ...lead, follow_up_count: newCount, next_action_date: nextDue };
  if (succ) rows.push(mkRow(succ.title, succ.actionKey, false, i + 2));
}

// 3) After Final: no follow-up surfaced, no repeat
ok(getNextAction(lead) === "Next Action", `after Final: getNextAction=Next Action (count=${lead.follow_up_count})`);
const rEnd = rankLeadActions(lead, rows as any, getNextAction(lead));
ok(rEnd.primary.urgency === "none", "after Final: not surfaced in the Agenda (urgency none)", `got ${rEnd.primary.urgency}`);
ok(rows.filter((x) => !x.completed && /follow_up|fu\d|final/i.test(x.action_key || x.title)).length === 0, "after Final: no open follow-up rows");

// 4) Completed-Final lead with a completed final_follow_up row also suppresses
const completedFinalLead: any = { id: "L2", crm_status: "list_sent", follow_up_count: 4, next_action_date: null };
const completedFinalRows = [mkRow("Final", "final_follow_up", true, -3)];
const rSeq = rankLeadActions(completedFinalLead, completedFinalRows as any, getNextAction(completedFinalLead));
ok(rSeq.primary.urgency === "none", "completed final_follow_up row → sequenceComplete → not in Agenda");

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`);
if (fail > 0) process.exit(1);
