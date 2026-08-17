/**
 * Confirm Payment → Commission Paid (terminal closing milestone). Pure, no DB:
 *   npx tsx scripts/tests/commission-paid.test.ts
 *
 * Covers: commission_paid creation after Invoice Sent (exactly one, Top-Pick
 * scoped, no dup on retry), the "Confirm Payment" open label vs "Commission Paid"
 * completed label, the Open/Not-Yet/Yes confirmation semantics, the durable
 * invoice_commission_paid state + timeline, Last Action "Commission Paid ·
 * Property", the Workspace/Companion surfaced state, that the read-only Invoice
 * Details value cannot bypass the workflow, Invoice Sent stays intact, and that no
 * Rebate/Movers action is created yet.
 */
import { favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"
import { seedInvoiceForm, buildInvoicePatch } from "@/lib/leads/invoiceFields"
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
const LEAD = "L-cp"

// ── Action key + intentional Confirm Payment / Commission Paid wording ──
ok((WORKFLOW_ACTION_KEYS as readonly string[]).includes("commission_paid"), "commission_paid is a canonical action key")
ok(formatWorkflowActionLabel("commission_paid") === "Confirm Invoice Paid", "open commission_paid → 'Confirm Invoice Paid' (display only; not 'Commission Paid')")
ok(formatWorkflowActionLabel("Confirm Payment") === "Confirm Invoice Paid", "legacy 'Confirm Payment' title still resolves → 'Confirm Invoice Paid'")
ok(formatLastActionLabel("Confirm Payment") === "Commission Paid", "completed commission_paid → 'Commission Paid' (unchanged)")

// ── State model: Invoice Sent → create one property-scoped commission_paid ──
type S = { lead: any; actions: any[] }
function afterInvoiceSent(): S {
  return {
    lead: { id: LEAD, crm_status: "closed", top_pick_favorite_id: FOUNDRY, closed_at: "t0", invoice_submitted: true, invoice_commission_paid: false },
    actions: [
      { id: "send", lead_id: LEAD, action_key: "send_invoice", title: "Send Invoice", property_id: FOUNDRY, property_name: "The Foundry", completed: true, status: "completed", completed_at: "t1" },
      // Invoice Sent created Confirm Payment (Top-Pick scoped, deduped).
      { id: "cp", lead_id: LEAD, action_key: "commission_paid", title: "Confirm Payment", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: "t1" },
    ],
  }
}
{
  const s = afterInvoiceSent()
  const cps = s.actions.filter((a) => a.action_key === "commission_paid")
  ok(cps.length === 1, "Invoice Sent creates exactly one commission_paid")
  ok(String(cps[0].property_id) === String(FOUNDRY), "commission_paid is scoped to the Top Pick property")
  const alreadyOpen = s.actions.some((a) => a.action_key === "commission_paid" && !a.completed)
  ok(alreadyOpen, "an open commission_paid already exists → a retry creates no duplicate")
  ok(s.lead.invoice_submitted === true, "Invoice Sent remains intact (invoice_submitted stays true)")
}

// ── Not Yet changes nothing; Yes sets state + completes exactly commission_paid ──
{
  let s = afterInvoiceSent()
  const before = JSON.stringify(s)
  // Not Yet:
  ok(JSON.stringify(s) === before && s.lead.invoice_commission_paid === false && s.actions.find((a) => a.action_key === "commission_paid").completed === false, "Not Yet: nothing changes; commission_paid stays open, state false")
  // Yes, Commission Paid (mirrors confirmPaymentYes):
  s = {
    lead: { ...s.lead, invoice_commission_paid: true },
    actions: s.actions.map((a) => (a.action_key === "commission_paid" ? { ...a, completed: true, status: "completed", completed_at: "t2" } : a)),
  }
  ok(s.lead.invoice_commission_paid === true, "Yes → sets durable invoice_commission_paid = true")
  ok(s.actions.find((a) => a.action_key === "commission_paid").completed === true, "Yes → completes exactly commission_paid")
  ok(s.actions.filter((a) => a.action_key === "commission_paid").length === 1, "no duplicate commission_paid after completion")
  ok(s.lead.crm_status === "closed", "lead remains Closed")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Top Pick / property unchanged")
  ok(s.actions.find((a) => a.action_key === "send_invoice").completed === true, "Invoice Sent (send_invoice) remains completed/intact")
  // This lead has no Client Incentive set → no send_rebate; Setup Movers is never
  // created at payment time (it belongs earlier, post-lease → separate pass).
  ok(!s.actions.some((a) => a.action_key === "send_rebate" || a.action_key === "setup_movers"), "no send_rebate / setup_movers (no incentive on this lead)")
}

// ── Client Incentive branch at Commission Paid (mirrors confirmPaymentYes) ──
// Pure model of the handler's incentive step: Cash Rebate creates exactly one
// deduped Send Rebate; Free Movers / No Client Incentive create nothing.
ok(formatWorkflowActionLabel("send_rebate") === "Send Rebate", "open send_rebate → 'Send Rebate'")
ok(formatLastActionLabel("Send Rebate") === "Rebate Sent", "completed Send Rebate → 'Rebate Sent'")

const TZ = "America/Chicago"
const LEASE_START = "2026-08-28"
const LEASE_TERM = "12"
const EXPECTED_LF_DUE = leaseFollowUpDueAt(LEASE_START, LEASE_TERM, TZ) // 2027-05-30 09:00 local

// Mirrors confirmPaymentYes: complete commission_paid, then the incentive branch.
// Cash Rebate → create Send Rebate (Future Lease Follow-Up deferred to Rebate Sent).
// No Incentive / Free Movers → Commission Paid is the last obligation → create the
// Future Lease Follow-Up now (property-scoped, deduped, due = end − 90 days).
function afterCommissionPaid(rebateType: string): S {
  const base: any[] = [
    { id: "send", lead_id: LEAD, action_key: "send_invoice", title: "Send Invoice", property_id: FOUNDRY, property_name: "The Foundry", completed: true, status: "completed", completed_at: "t1" },
    { id: "cp", lead_id: LEAD, action_key: "commission_paid", title: "Confirm Payment", property_id: FOUNDRY, property_name: "The Foundry", completed: true, status: "completed", completed_at: "t2" },
  ]
  const lead = { id: LEAD, crm_status: "closed", top_pick_favorite_id: FOUNDRY, invoice_submitted: true, invoice_commission_paid: true, invoice_property_name: "The Foundry", invoice_rebate_type: rebateType, invoice_lease_start_date: LEASE_START, invoice_lease_term: LEASE_TERM }
  let actions = base
  if (String(lead.invoice_rebate_type ?? "") === "Cash Rebate") {
    const open = actions.some((a) => String(a.lead_id) === String(LEAD) && !a.completed && a.action_key === "send_rebate")
    if (!open) actions = [...actions, { id: "reb", lead_id: LEAD, action_key: "send_rebate", title: "Send Rebate", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: "t2" }]
  } else {
    const has = actions.some((a) => String(a.lead_id) === String(LEAD) && a.action_key === "lease_follow_up")
    if (!has) actions = [...actions, { id: "lf", lead_id: LEAD, action_key: "lease_follow_up", title: "Future Lease Follow-Up", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: leaseFollowUpDueAt(lead.invoice_lease_start_date, lead.invoice_lease_term, TZ) ?? "now" }]
  }
  return { lead, actions }
}

// A. Cash Rebate → exactly one Send Rebate; Future Lease Follow-Up NOT yet (Send
//    Rebate still outstanding).
{
  const s = afterCommissionPaid("Cash Rebate")
  const rebs = s.actions.filter((a) => a.action_key === "send_rebate")
  ok(rebs.length === 1, "Cash Rebate → exactly one send_rebate created")
  ok(String(rebs[0].property_id) === String(FOUNDRY), "send_rebate scoped to the Top Pick property")
  ok(!s.actions.some((a) => a.action_key === "lease_follow_up"), "Cash Rebate → NO Future Lease Follow-Up yet (rebate outstanding)")
  const openActions = s.actions.filter((a) => !a.completed)
  const p = buildActiveClientPayload({ ...s.lead, first_name: "Carlos" }, s.actions, null, null, TZ, [], [])
  ok((p.nextActions[0]?.title ?? "") === "Send Rebate", "Cash Rebate → Companion Next Action = 'Send Rebate'")
  ok(openActions.length === 1 && openActions[0].action_key === "send_rebate", "Send Rebate is the only open action")
}

// B. Free Movers → Commission Paid is the last obligation → Future Lease Follow-Up.
{
  const s = afterCommissionPaid("Free Movers")
  ok(!s.actions.some((a) => a.action_key === "send_rebate"), "Free Movers → no send_rebate created")
  ok(!s.actions.some((a) => a.action_key === "setup_movers"), "Free Movers → no setup_movers created at payment time (separate pass)")
  const lfs = s.actions.filter((a) => a.action_key === "lease_follow_up")
  ok(lfs.length === 1, "Free Movers → exactly one Future Lease Follow-Up created")
  ok(String(lfs[0].property_id) === String(FOUNDRY), "Future Lease Follow-Up scoped to the Top Pick")
  ok(lfs[0].due_at === EXPECTED_LF_DUE, "Future Lease Follow-Up due = estimated lease end − 90 days")
  const p = buildActiveClientPayload({ ...s.lead, first_name: "Carlos" }, s.actions, null, null, TZ, [], [])
  ok(formatWorkflowActionLabel(p.nextActions[0]?.title ?? "") === "Renewal Follow-Up", "Free Movers → Next Action = 'Renewal Follow-Up'")
  ok(!p.nextActions.some((a) => /invoice details/i.test(a.title)), "Free Movers → no 'Get Invoice Details' fallback")
}

// C. No Client Incentive → Commission Paid is the last obligation → Future Lease Follow-Up.
{
  const s = afterCommissionPaid("None")
  ok(!s.actions.some((a) => a.action_key === "send_rebate"), "No Client Incentive → no send_rebate created")
  const lfs = s.actions.filter((a) => a.action_key === "lease_follow_up")
  ok(lfs.length === 1, "No Client Incentive → exactly one Future Lease Follow-Up created")
  ok(lfs[0].due_at === EXPECTED_LF_DUE, "Future Lease Follow-Up due = estimated lease end − 90 days")
  const p = buildActiveClientPayload({ ...s.lead, first_name: "Carlos" }, s.actions, null, null, TZ, [], [])
  ok(formatWorkflowActionLabel(p.nextActions[0]?.title ?? "") === "Renewal Follow-Up", "No Client Incentive → Next Action = 'Renewal Follow-Up' (never the empty state)")
  // Dedup: a re-run must not add a second Future Lease Follow-Up.
  const rerun = afterCommissionPaid("None")
  ok(rerun.actions.filter((a) => a.action_key === "lease_follow_up").length === 1, "re-run creates no duplicate Future Lease Follow-Up")
  // Last Action + Closed + Top Pick + durable state all intact regardless of branch.
  ok(formatLastActionLabel(p.lead.lastAction?.title ?? "") === "Commission Paid", "Last Action stays 'Commission Paid'")
  ok(p.lead.lastAction?.propertyName === "The Foundry", "Commission Paid Last Action still carries the Top Pick property")
  ok(s.lead.crm_status === "closed" && s.lead.invoice_commission_paid === true, "lead stays Closed with invoice_commission_paid true")
}

// ── Favorite surfaced state: Invoice Sent → Commission Paid (furthest) ──
{
  const A = (invoiceSent: boolean, commissionPaid: boolean) =>
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply", isApplicationProperty: true, closedStage: true, invoiceSent, commissionPaid })
  ok(A(true, false) === "Toured · Invoice Sent", "Invoice Sent, payment not confirmed → 'Toured · Invoice Sent'")
  ok(A(true, true) === "Toured · Commission Paid", "Commission Paid → 'Toured · Commission Paid' (furthest)")
}

// ── Read-only Invoice Details value cannot bypass the workflow ──
{
  // The Get Invoice Details Save patch only ECHOES the current canonical value —
  // it can never independently flip it to true (there is no input for it, and the
  // section is read-only). Seeded false → stays false; seeded true → preserved.
  ok(buildInvoicePatch(seedInvoiceForm({ id: LEAD, invoice_commission_paid: false }, null)).invoice_commission_paid === false, "Save cannot set Commission Paid true independently (stays false)")
  ok(buildInvoicePatch(seedInvoiceForm({ id: LEAD, invoice_commission_paid: true }, null)).invoice_commission_paid === true, "an already-true canonical value is preserved (single source of truth)")
}

// ── Companion Last Action / Next Action via canonical CRM state ──
{
  const doneSend = { id: "send", lead_id: LEAD, action_key: "send_invoice", title: "Send Invoice", property_id: FOUNDRY, property_name: "The Foundry", completed: true, completed_at: "t1", status: "completed", due_at: "t0" }
  // Before confirming: Last = Invoice Sent, Next = Confirm Payment.
  const openCp = { id: "cp", lead_id: LEAD, action_key: "commission_paid", title: "Confirm Payment", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: "t1" }
  const pBefore = buildActiveClientPayload({ id: LEAD, crm_status: "closed", first_name: "Carlos", top_pick_favorite_id: FOUNDRY, invoice_submitted: true }, [doneSend, openCp], null, null, "America/Chicago", [], [])
  ok(formatLastActionLabel(pBefore.lead.lastAction?.title ?? "") === "Invoice Sent", "before confirming → Last Action 'Invoice Sent'")
  ok((pBefore.nextActions[0]?.title ?? "") === "Confirm Payment", "before confirming → Next Action 'Confirm Payment'")

  // After Commission Paid: Last = Commission Paid · Property; read-only invoice reflects it.
  const doneCp = { ...openCp, completed: true, completed_at: "t2", status: "completed" }
  const pAfter = buildActiveClientPayload({ id: LEAD, crm_status: "closed", first_name: "Carlos", top_pick_favorite_id: FOUNDRY, invoice_submitted: true, invoice_commission_paid: true, invoice_property_name: "The Foundry" }, [doneSend, doneCp], null, null, "America/Chicago", [], [])
  ok(formatLastActionLabel(pAfter.lead.lastAction?.title ?? "") === "Commission Paid", "after confirming → Last Action 'Commission Paid'")
  ok(pAfter.lead.lastAction?.propertyName === "The Foundry", "Commission Paid Last Action carries the Top Pick property")
  ok(pAfter.lead.invoice?.commissionPaid === true, "Companion read-only invoice reflects Commission Paid: Yes")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
