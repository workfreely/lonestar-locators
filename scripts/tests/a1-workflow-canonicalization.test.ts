/**
 * Milestone A.1 — producer canonicalization proofs. Runnable, no DB writes:
 *   npx tsx scripts/tests/a1-workflow-canonicalization.test.ts
 *
 * Covers the six required proofs plus contacted_follow_up ↔ follow_up_1
 * coexistence. The DB-touching helper is exercised with a MOCK client that
 * records the dedup filters + insert payload — nothing hits production.
 */
import {
  getStageWorkflowAction,
  getNextFollowUpAction,
  createWorkflowActionIfNeeded,
  type WorkflowActionSpec,
} from "@/lib/workflowEngine";
import { formatWorkflowActionLabel, WORKFLOW_ACTION_KEYS } from "@bc/companion-shared";

let pass = 0,
  fail = 0;
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`);
}

// ── Mock Supabase client: records dedup filters + insert payload ──────────────
function makeMockClient(opts: { existing?: unknown[]; insertResult?: unknown }) {
  const existing = opts.existing ?? [];
  const insertResult = opts.insertResult ?? { data: { id: 1 }, error: null };
  const calls: { table?: string; selectFilters: Record<string, unknown>; insertPayload: any } = {
    selectFilters: {},
    insertPayload: null,
  };
  const makeBuilder = () => {
    const b: any = {
      from(t: string) { calls.table = t; return b; },
      select() { return b; },
      insert(rows: any[]) { calls.insertPayload = rows[0]; return b; },
      eq(col: string, val: unknown) { calls.selectFilters[col] = val; return b; },
      ilike(col: string, val: unknown) { calls.selectFilters["ilike:" + col] = val; return b; },
      limit() { return b; },
      single() { return Promise.resolve(insertResult); },
      then(res: any, rej: any) { return Promise.resolve({ data: existing, error: null }).then(res, rej); },
    };
    return b;
  };
  return { client: { from: (t: string) => makeBuilder().from(t) } as any, calls };
}

// ── Proof 1: each workflow action receives the correct canonical key ──────────
const stageExpect: Record<string, { title: string; key: string }> = {
  new: { title: "Contact Lead", key: "contact_lead" },
  contacted: { title: "Follow Up", key: "contacted_follow_up" },
  searching: { title: "Send List", key: "send_list" },
  list_sent: { title: "FU1", key: "follow_up_1" },
  applied: { title: "Check App", key: "check_application" },
  closed: { title: "Get Invoice Details", key: "get_invoice_details" },
};
for (const [stage, exp] of Object.entries(stageExpect)) {
  const spec = getStageWorkflowAction(stage, { follow_up_count: 0 });
  ok(spec?.actionKey === exp.key && spec?.title === exp.title, `stage "${stage}" → ${exp.key}`, `got ${JSON.stringify(spec)}`);
}
// ready_to_tour branches
const near = getStageWorkflowAction("ready_to_tour", { move_date: null });
ok(near?.actionKey === "setup_tour", "ready_to_tour (no move date) → setup_tour", JSON.stringify(near));
const farMove = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
const far = getStageWorkflowAction("ready_to_tour", { move_date: farMove });
ok(far?.actionKey === "reconnect_client", "ready_to_tour (>90d out) → reconnect_client", JSON.stringify(far));

// ── Proof 2: Follow-Up 1/2/3/Final remain DISTINCT ────────────────────────────
const fu1 = getStageWorkflowAction("list_sent", { follow_up_count: 0 });
const fu2 = getNextFollowUpAction("FU1");
const fu3 = getNextFollowUpAction("FU2");
const fin = getNextFollowUpAction("FU3");
const fuKeys = [fu1?.actionKey, fu2?.actionKey, fu3?.actionKey, fin?.actionKey];
ok(
  JSON.stringify(fuKeys) === JSON.stringify(["follow_up_1", "follow_up_2", "follow_up_3", "final_follow_up"]),
  "FU chain keys distinct: follow_up_1/2/3/final_follow_up",
  JSON.stringify(fuKeys),
);
ok(new Set(fuKeys).size === 4, "FU chain has 4 distinct keys");
ok(
  fu1?.actionKey !== "contacted_follow_up" && stageExpect.contacted.key === "contacted_follow_up",
  "contacted_follow_up is distinct from follow_up_1",
);

// ── Proof 3: Get Invoice Details separate from Confirm Lease ───────────────────
const closed = getStageWorkflowAction("closed", {});
ok(closed?.actionKey === "get_invoice_details", "closed → get_invoice_details (NOT confirm_lease)", JSON.stringify(closed));
ok(WORKFLOW_ACTION_KEYS.includes("confirm_lease" as any) && closed?.actionKey !== "confirm_lease", "confirm_lease exists but is not produced by 'closed'");

// ── Proof 4: repeating the same workflow creation does not produce two open rows
async function run() {
  // (a) an open row with the same action_key already exists → no insert
  const dup = makeMockClient({ existing: [{ id: 99 }] });
  const r1 = await createWorkflowActionIfNeeded(dup.client, 123, { title: "FU1", dueAt: new Date().toISOString(), actionKey: "follow_up_1", sequence: 1 } as WorkflowActionSpec);
  ok(r1 === null && dup.calls.insertPayload === null, "duplicate open follow_up_1 → skipped (no second insert)");
  ok(dup.calls.selectFilters["action_key"] === "follow_up_1" && dup.calls.selectFilters["status"] === "open", "dedup keyed on action_key + status='open' (not title)", JSON.stringify(dup.calls.selectFilters));
  ok(!("ilike:title" in dup.calls.selectFilters), "dedup does NOT use ilike(title)");

  // (b) no existing open row → inserts, tagged workflow/open with the key
  const fresh = makeMockClient({ existing: [] });
  await createWorkflowActionIfNeeded(fresh.client, 123, { title: "FU1", dueAt: "2026-08-10T14:00:00Z", actionKey: "follow_up_1", sequence: 1 } as WorkflowActionSpec);
  const p = fresh.calls.insertPayload;
  ok(
    p && p.action_key === "follow_up_1" && p.action_type === "workflow" && p.origin === "workflow" && p.status === "open" && p.workflow_version === 1 && p.sequence === 1,
    "fresh insert payload = workflow/open/origin=workflow/workflow_version=1/sequence=1",
    JSON.stringify(p),
  );

  // ── Proof 5: custom tasks exempt from workflow dedup ────────────────────────
  // The helper only ever queries by action_key; a manual row (action_key=null)
  // can neither match nor block a workflow insert. So even with a "manual" row
  // "present", a workflow insert for the same lead proceeds.
  const withManual = makeMockClient({ existing: [] }); // manual rows never surface (query filters action_key)
  await createWorkflowActionIfNeeded(withManual.client, 123, { title: "Contact Lead", dueAt: "2026-08-10T14:00:00Z", actionKey: "contact_lead" } as WorkflowActionSpec);
  ok(withManual.calls.insertPayload?.action_key === "contact_lead" && withManual.calls.selectFilters["action_key"] === "contact_lead", "workflow dedup filters by action_key, so custom (null-key) rows are exempt");

  // contacted_follow_up (completed) + follow_up_1 (open) coexist: creating
  // follow_up_1 when no OPEN follow_up_1 exists inserts, regardless of a prior
  // completed contacted_follow_up (different key, and the unique index only
  // covers status='open').
  const coexist = makeMockClient({ existing: [] });
  const rc = await createWorkflowActionIfNeeded(coexist.client, 123, { title: "FU1", dueAt: "2026-08-10T14:00:00Z", actionKey: "follow_up_1", sequence: 1 } as WorkflowActionSpec);
  ok(rc !== null && coexist.calls.insertPayload?.action_key === "follow_up_1", "completed contacted_follow_up does not block a new open follow_up_1");

  // ── Proof 6: existing display labels unchanged ──────────────────────────────
  const labelCases: [string, string][] = [
    ["FU1", "Follow-Up 1"],
    ["FU2", "Follow-Up 2"],
    ["FU3", "Follow-Up 3"],
    ["Final", "Final Follow-Up"],
    ["Get Invoice Details", "Get Invoice Details"],
    ["Contact Lead", "Contact Lead"],
    ["Follow Up", "Follow Up"], // contacted-stage label unchanged
    ["Send List", "Send List"],
    ["Setup Tour", "Setup Tour"],
  ];
  for (const [title, expected] of labelCases) {
    ok(formatWorkflowActionLabel(title) === expected, `label "${title}" → "${expected}"`, `got "${formatWorkflowActionLabel(title)}"`);
  }

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
run();
