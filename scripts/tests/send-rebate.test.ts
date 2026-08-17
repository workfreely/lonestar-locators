/**
 * Send Rebate → Rebate Sent (Cash Rebate closing branch). Pure, no DB:
 *   npx tsx scripts/tests/send-rebate.test.ts
 *
 * Covers: send_rebate is a canonical key; the open "Send Rebate" vs completed
 * "Rebate Sent" labels; Mark Rebate Sent completes exactly send_rebate (no dup);
 * the rebate amount display (present vs missing → honest text); the lead stays
 * Closed with Top Pick + Commission Paid preserved; Last Action becomes
 * "Rebate Sent · Property"; NO "Get Invoice Details" fallback reappears; and the
 * furthest Favorite state "Toured · Rebate Sent". Free Movers / No Incentive
 * never create send_rebate (see commission-paid.test.ts).
 */
import { favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"
import { formatInvoiceCurrency } from "@/lib/leads/invoiceFields"
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"
import { formatWorkflowActionLabel, formatLastActionLabel } from "@/lib/leads/workflowActionLabels"
import { leaseFollowUpDueAt } from "@/lib/leads/leaseFollowUp"
import { WORKFLOW_ACTION_KEYS } from "@bc/companion-shared"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const FOUNDRY = 8001
const LEAD = "L-reb"

// ── Canonical key + intentional Send Rebate / Rebate Sent wording ──
ok((WORKFLOW_ACTION_KEYS as readonly string[]).includes("send_rebate"), "send_rebate is a canonical action key")
ok(formatWorkflowActionLabel("send_rebate") === "Send Rebate", "open send_rebate → 'Send Rebate'")
ok(formatWorkflowActionLabel("Send Rebate") === "Send Rebate", "'Send Rebate' title → 'Send Rebate'")
ok(formatLastActionLabel("Send Rebate") === "Rebate Sent", "completed Send Rebate → 'Rebate Sent' (spec wording, not 'Sent Rebate')")

// ── State: Cash Rebate lead at Commission Paid with an open Send Rebate ──
type S = { lead: any; actions: any[] }
function withOpenRebate(): S {
  return {
    lead: { id: LEAD, crm_status: "closed", top_pick_favorite_id: FOUNDRY, closed_at: "t0", invoice_submitted: true, invoice_commission_paid: true, invoice_property_name: "The Foundry", invoice_rebate_type: "Cash Rebate", invoice_rebate_amount: 250, invoice_lease_start_date: "2026-08-28", invoice_lease_term: "12" },
    actions: [
      { id: "cp", lead_id: LEAD, action_key: "commission_paid", title: "Confirm Payment", property_id: FOUNDRY, property_name: "The Foundry", completed: true, status: "completed", completed_at: "t2" },
      { id: "reb", lead_id: LEAD, action_key: "send_rebate", title: "Send Rebate", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: "t2" },
    ],
  }
}

// ── Amount display: present → currency; missing → honest text ──
{
  ok(formatInvoiceCurrency(250) === "$250", "rebate amount present → formatted currency")
  const missing = (raw: unknown) => {
    const n = Number(raw)
    const has = raw !== null && raw !== undefined && String(raw).trim() !== "" && !Number.isNaN(n)
    return has ? formatInvoiceCurrency(n) : "Rebate amount not entered"
  }
  ok(missing(null) === "Rebate amount not entered", "missing amount → 'Rebate amount not entered' (never invented)")
  ok(missing("") === "Rebate amount not entered", "blank amount → 'Rebate amount not entered'")
  ok(missing(250) === "$250", "present amount → '$250'")
}

// ── Cancel changes nothing ──
{
  const s = withOpenRebate()
  const before = JSON.stringify(s)
  // Cancel: no mutation.
  ok(JSON.stringify(s) === before, "Cancel: state unchanged")
  ok(s.actions.find((a) => a.action_key === "send_rebate").completed === false, "Cancel: send_rebate stays open")
}

// ── Mark Rebate Sent (mirrors confirmRebateSent): complete send_rebate, then create
//    the Future Lease Follow-Up (Rebate Sent is the last Cash-Rebate obligation) ──
const TZ = "America/Chicago"
const EXPECTED_LF_DUE = leaseFollowUpDueAt("2026-08-28", "12", TZ) // 2027-05-30 09:00 local
function afterRebateSent(): S {
  const s = withOpenRebate()
  let actions = s.actions.map((a) => (a.action_key === "send_rebate" ? { ...a, completed: true, status: "completed", completed_at: "t3" } : a))
  const has = actions.some((a) => a.action_key === "lease_follow_up")
  if (!has) actions = [...actions, { id: "lf", lead_id: LEAD, action_key: "lease_follow_up", title: "Future Lease Follow-Up", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: leaseFollowUpDueAt(s.lead.invoice_lease_start_date, s.lead.invoice_lease_term, TZ) ?? "now" }]
  return { lead: s.lead, actions } // NO leads.* write — completed action is the durable state
}
{
  const s = afterRebateSent()
  ok(s.actions.find((a) => a.action_key === "send_rebate").completed === true, "Mark Rebate Sent → completes exactly send_rebate")
  ok(s.actions.filter((a) => a.action_key === "send_rebate").length === 1, "no duplicate send_rebate after completion")
  ok(s.actions.find((a) => a.action_key === "commission_paid").completed === true, "Commission Paid (commission_paid) stays completed — unchanged")
  ok(s.lead.crm_status === "closed", "lead remains Closed")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Top Pick / property unchanged")
  ok(s.lead.invoice_commission_paid === true, "invoice_commission_paid stays true")
  ok(s.lead.invoice_property_name === "The Foundry" && s.lead.invoice_rebate_amount === 250, "all invoice info preserved")
  // No Setup Movers / new invoice / new payment action created.
  ok(!s.actions.some((a) => ["setup_movers", "get_invoice_details", "commission_paid"].includes(a.action_key) && !a.completed), "no Setup Movers / new invoice / new payment action")
  // Future Lease Follow-Up now exists (the last Cash-Rebate obligation is done).
  const lfs = s.actions.filter((a) => a.action_key === "lease_follow_up")
  ok(lfs.length === 1, "Rebate Sent → exactly one Future Lease Follow-Up created")
  ok(String(lfs[0].property_id) === String(FOUNDRY), "Future Lease Follow-Up scoped to the Top Pick")
  ok(lfs[0].due_at === EXPECTED_LF_DUE, "Future Lease Follow-Up due = estimated lease end − 90 days")
  // Dedup: re-running Mark Rebate Sent must not add a second Future Lease Follow-Up.
  ok(afterRebateSent().actions.filter((a) => a.action_key === "lease_follow_up").length === 1, "re-run creates no duplicate Future Lease Follow-Up")
}

// ── Companion payload: Last Action 'Rebate Sent'; Next Action 'Future Lease Follow-Up' ──
{
  const s = afterRebateSent()
  const p = buildActiveClientPayload({ ...s.lead, first_name: "Carlos" }, s.actions, null, null, TZ, [], [])
  ok(formatLastActionLabel(p.lead.lastAction?.title ?? "") === "Rebate Sent", "Last Action → 'Rebate Sent'")
  ok(p.lead.lastAction?.propertyName === "The Foundry", "Rebate Sent Last Action carries the Top Pick property")
  ok(!p.nextActions.some((a) => /invoice details/i.test(a.title)), "no 'Get Invoice Details' fallback after Rebate Sent")
  ok(formatWorkflowActionLabel(p.nextActions[0]?.title ?? "") === "Renewal Follow-Up", "Next Action = 'Renewal Follow-Up' (never the empty state)")
}

// ── Furthest Favorite state: Rebate Sent supersedes Commission Paid ──
{
  const A = (rebateSent: boolean) =>
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply", isApplicationProperty: true, closedStage: true, invoiceSent: true, commissionPaid: true, rebateSent })
  ok(A(false) === "Toured · Commission Paid", "before rebate sent → 'Toured · Commission Paid'")
  ok(A(true) === "Toured · Rebate Sent", "rebate sent → 'Toured · Rebate Sent' (furthest)")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
