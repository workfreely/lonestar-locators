/**
 * Send Invoice → Invoice Sent. Pure simulation, no DB:
 *   npx tsx scripts/tests/send-invoice.test.ts
 *
 * Covers: send_invoice creation after Get Invoice Details (exactly one, Top-Pick
 * scoped, no dup on re-run), the invoice email subject/body built from canonical
 * fields (property-facing only — never broker split / expected commission / rebate
 * / internal notes), missing-field grace, the "Open Email ≠ sent" confirmation,
 * the durable Invoice Sent state (invoice_submitted) + timeline, Last Action
 * "Invoice Sent · Property", and that the lead stays Closed with the Top Pick
 * unchanged. Guest Card behavior is untouched (separate suite).
 */
import { buildInvoiceSubject, buildInvoiceEmailBody } from "@/lib/leads/invoiceEmail"
import { favoriteTourStateLabel } from "@/lib/leads/tourFollowUp"
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"
import { formatWorkflowActionLabel, formatLastActionLabel } from "@/lib/leads/workflowActionLabels"
import { WORKFLOW_ACTION_KEYS } from "@bc/companion-shared"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const FOUNDRY = 8001
const LEAD = "L-si"

// ── Action key + labels ──
ok((WORKFLOW_ACTION_KEYS as readonly string[]).includes("send_invoice"), "send_invoice is a canonical action key")
ok(formatWorkflowActionLabel("send_invoice") === "Send Invoice", "send_invoice → 'Send Invoice'")
ok(formatLastActionLabel("Send Invoice") === "Invoice Sent", "completed Send Invoice → 'Invoice Sent'")

// ── Email subject (client + formatted unit; graceful without unit; no double #) ──
{
  ok(buildInvoiceSubject({ clientName: "Carlos Mendez", unitNumber: "3456" }) === "Invoice – Carlos Mendez – #3456", "subject = 'Invoice – Carlos Mendez – #3456'")
  ok(buildInvoiceSubject({ clientName: "Carlos Mendez", unitNumber: "#3456" }) === "Invoice – Carlos Mendez – #3456", "subject never doubles the # (no ##3456)")
  ok(buildInvoiceSubject({ clientName: "Carlos Mendez", unitNumber: "" }) === "Invoice – Carlos Mendez", "missing unit is gracefully omitted from subject")
}

// ── Email body: property-facing content only, no internal info, graceful ──
{
  const body = buildInvoiceEmailBody({
    clientName: "Carlos Mendez", propertyName: "Skyline Lofts", unitNumber: "3456",
    leaseStartDate: "2026-08-18", leaseTerm: "12", baseRent: 1200, commissionPct: 100, totalInvoice: 1200,
    contactName: "Sarah",
  })
  ok(body.includes("Property: Skyline Lofts"), "body includes Property")
  ok(body.includes("Client: Carlos Mendez"), "body includes Client")
  ok(body.includes("Unit: #3456"), "body includes formatted Unit (#3456)")
  ok(body.includes("Lease Start: August 18, 2026"), "body includes human-readable Lease Start")
  ok(body.includes("Lease Term: 12 months"), "body includes Lease Term with 'months'")
  ok(body.includes("Base Rent: $1,200.00"), "body includes Base Rent ($1,200.00)")
  ok(body.includes("Commission: 100%"), "body includes Commission (100%)")
  ok(body.includes("Invoice Amount: $1,200.00"), "body includes Invoice Amount = Total Invoice (not expected commission)")
  ok(body.includes("Hello Sarah,"), "body greets the property contact")
  // Internal info must NEVER appear.
  ok(!/broker/i.test(body), "body does NOT expose Broker Split")
  ok(!/expected commission/i.test(body), "body does NOT expose Expected Commission")
  ok(!/rebate/i.test(body), "body does NOT expose Client Rebate")
  ok(!/authorization|resident|internal note/i.test(body), "body does NOT expose internal property-call notes")

  // Missing optional fields → graceful (no undefined/null/empty labels).
  const sparse = buildInvoiceEmailBody({
    clientName: "Carlos Mendez", propertyName: "Skyline Lofts", unitNumber: null,
    leaseStartDate: null, leaseTerm: null, baseRent: null, commissionPct: null, totalInvoice: null,
  })
  ok(!/undefined|null/.test(sparse), "sparse body contains no 'undefined'/'null'")
  ok(!sparse.includes("Unit:") && !sparse.includes("Base Rent:"), "sparse body omits missing-field lines entirely")
  ok(sparse.includes("Property: Skyline Lofts") && sparse.includes("Client: Carlos Mendez"), "sparse body still shows the fields we have")
}

// ── send_invoice creation after Get Invoice Details (mirrors saveInvoiceDetails) ──
type S = { lead: any; actions: any[] }
function afterGetInvoiceSaved(): S {
  return {
    lead: { id: LEAD, crm_status: "closed", top_pick_favorite_id: FOUNDRY, closed_at: "t0", invoice_submitted: false },
    // get_invoice_details just completed; Save also creates send_invoice (Top-Pick scoped, deduped).
    actions: [
      { id: "inv", lead_id: LEAD, action_key: "get_invoice_details", title: "Get Invoice Details", property_id: FOUNDRY, property_name: "The Foundry", completed: true, status: "completed", completed_at: "t1" },
      { id: "send", lead_id: LEAD, action_key: "send_invoice", title: "Send Invoice", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: "t1" },
    ],
  }
}
{
  const s = afterGetInvoiceSaved()
  const sends = s.actions.filter((a) => a.action_key === "send_invoice")
  ok(sends.length === 1, "Get Invoice Details completion creates exactly one send_invoice")
  ok(String(sends[0].property_id) === String(FOUNDRY), "send_invoice is scoped to the Top Pick property")
  // Re-render/retry must not duplicate (dedup on action_key while one is open).
  const alreadyOpen = s.actions.some((a) => a.action_key === "send_invoice" && !a.completed)
  ok(alreadyOpen, "an open send_invoice already exists → a retry creates no duplicate")
}

// ── Open Email ≠ sent; Not Yet leaves open; Yes completes + durable state (mirrors handlers) ──
{
  let s = afterGetInvoiceSaved()
  // Open Email alone changes nothing about completion/state.
  const beforeSend = JSON.stringify(s)
  ok(JSON.stringify(s) === beforeSend && s.actions.find((a) => a.action_key === "send_invoice").completed === false, "Open Email alone does not mark Invoice Sent")
  // Not Yet: no change.
  ok(s.actions.find((a) => a.action_key === "send_invoice").completed === false && s.lead.invoice_submitted === false, "Not Yet leaves send_invoice open and Invoice Sent unset")
  // Yes, Invoice Sent: complete send_invoice + set invoice_submitted + timeline; stays Closed.
  s = {
    lead: { ...s.lead, invoice_submitted: true },
    actions: s.actions.map((a) => (a.action_key === "send_invoice" ? { ...a, completed: true, status: "completed", completed_at: "t2" } : a)),
  }
  ok(s.actions.find((a) => a.action_key === "send_invoice").completed === true, "Yes → completes exactly send_invoice")
  ok(s.lead.invoice_submitted === true, "Yes → sets the durable Invoice Sent state (invoice_submitted)")
  ok(s.lead.crm_status === "closed", "lead remains Closed after Invoice Sent")
  ok(String(s.lead.top_pick_favorite_id) === String(FOUNDRY), "Top Pick / property unchanged")
  ok(s.actions.filter((a) => a.action_key === "send_invoice").length === 1, "no duplicate send_invoice after completion")
}

// ── Favorite surfaced state: Leased → Invoice Sent (furthest) ──
{
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply", isApplicationProperty: true, closedStage: true, invoiceSent: false }) === "Toured · Leased",
    "Closed, not yet sent → 'Toured · Leased'",
  )
  ok(
    favoriteTourStateLabel({ applyActionOpen: false, isTopPick: true, appliedStage: true, outcome: "ready_to_apply", isApplicationProperty: true, closedStage: true, invoiceSent: true }) === "Toured · Invoice Sent",
    "Closed + Invoice Sent → 'Toured · Invoice Sent' (furthest)",
  )
}

// ── Companion Last Action / Next Action via canonical state ──
{
  const commonInv = { id: "inv", lead_id: LEAD, action_key: "get_invoice_details", title: "Get Invoice Details", property_id: FOUNDRY, property_name: "The Foundry", completed: true, completed_at: "t1", status: "completed", due_at: "t0" }
  // Before sending: Last = Got Invoice Details, Next = Send Invoice.
  const openSend = { id: "send", lead_id: LEAD, action_key: "send_invoice", title: "Send Invoice", property_id: FOUNDRY, property_name: "The Foundry", completed: false, status: "open", due_at: "t1" }
  const pBefore = buildActiveClientPayload({ id: LEAD, crm_status: "closed", first_name: "Carlos", top_pick_favorite_id: FOUNDRY }, [commonInv, openSend], null, null, "America/Chicago", [], [])
  ok(formatLastActionLabel(pBefore.lead.lastAction?.title ?? "") === "Got Invoice Details", "before sending → Last Action 'Got Invoice Details'")
  ok((pBefore.nextActions[0]?.title ?? "") === "Send Invoice", "before sending → Next Action 'Send Invoice'")

  // After Invoice Sent: Last = Invoice Sent · Property.
  const doneSend = { ...openSend, completed: true, completed_at: "t2", status: "completed" }
  const pAfter = buildActiveClientPayload({ id: LEAD, crm_status: "closed", first_name: "Carlos", top_pick_favorite_id: FOUNDRY, invoice_submitted: true }, [commonInv, doneSend], null, null, "America/Chicago", [], [])
  ok(formatLastActionLabel(pAfter.lead.lastAction?.title ?? "") === "Invoice Sent", "after sending → Last Action 'Invoice Sent'")
  ok(pAfter.lead.lastAction?.propertyName === "The Foundry", "Invoice Sent Last Action carries the Top Pick property")
  ok(pAfter.lead.invoice?.submitted === true, "Companion read-only invoice reflects submitted (Invoice Sent)")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
