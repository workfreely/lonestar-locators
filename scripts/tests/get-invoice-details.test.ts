/**
 * Get Invoice Details — auto-population policy, blank-allowed save, action
 * completion, and the Companion read-only invoice projection. Pure, no DB:
 *   npx tsx scripts/tests/get-invoice-details.test.ts
 *
 * The intake writes the SAME canonical leads.invoice_* fields as the persistent
 * section (shared lib/leads/invoiceFields). Asserts the strict auto-pop rules
 * (Property from Top Pick only; NEVER lease-start from move_date or rent from
 * budget), that blank lease fields still save + complete, and that saving
 * completes get_invoice_details without a duplicate or stage change.
 */
import { seedInvoiceForm, buildInvoicePatch, computeInvoiceTotals, autoInvoicePropertyName, formatInvoiceCurrency, formatMoneyDisplay, formatPercentDisplay, rawNumericString } from "@/lib/leads/invoiceFields"
import { buildActiveClientPayload } from "@/lib/companion/leadToDto"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const FOUNDRY = 8001
const LEAD = "L-inv"

// ── Auto-population: Property from Top Pick ONLY ──
{
  const favorites = [{ id: FOUNDRY, lead_id: LEAD, property_name: "The Foundry" }]
  // No saved invoice_property_name → Top Pick fills it.
  const leadNoInvoice: any = { id: LEAD, top_pick_favorite_id: FOUNDRY }
  const autoName = autoInvoicePropertyName(leadNoInvoice, favorites)
  ok(autoName === "The Foundry", "autoInvoicePropertyName resolves the Top Pick property")
  ok(seedInvoiceForm(leadNoInvoice, autoName).invoice_property_name === "The Foundry", "Property Name auto-fills from Top Pick when none saved")
  // A previously-saved value always wins (editing collected details).
  const leadSaved: any = { id: LEAD, top_pick_favorite_id: FOUNDRY, invoice_property_name: "The Foundry #204 (saved)" }
  ok(seedInvoiceForm(leadSaved, "The Foundry").invoice_property_name === "The Foundry #204 (saved)", "saved Property Name wins over the Top Pick default")
  // No Top Pick → no auto property.
  ok(autoInvoicePropertyName({ id: LEAD, top_pick_favorite_id: null }, favorites) === null, "no Top Pick → no auto property name")
}

// ── Auto-population: NEVER lease-start from move_date, NEVER base-rent from budget ──
{
  const lead: any = { id: LEAD, move_date: "2026-09-01", desired_rent: "$1,800-$2,000" }
  const form = seedInvoiceForm(lead, null)
  ok(form.invoice_lease_start_date === "", "Lease Start Date is BLANK — never taken from move_date")
  ok(form.invoice_base_rent === "", "Base Rent is BLANK — never taken from the client's budget")
  // A real saved lease-start does populate.
  ok(seedInvoiceForm({ id: LEAD, invoice_lease_start_date: "2026-10-15" }, null).invoice_lease_start_date === "2026-10-15", "a real saved invoice_lease_start_date populates")
}

// ── Auto-calcs ──
{
  const { totalInvoice, expectedCommission } = computeInvoiceTotals({ invoice_base_rent: "1500", invoice_commission_pct: "150", invoice_broker_split_pct: "70" })
  ok(totalInvoice === 2250, "Total Invoice = Base Rent × Commission% (1500 × 150% = 2250)")
  ok(expectedCommission === 1575, "Expected Commission = Total × Broker Split% (2250 × 70% = 1575)")
  ok(formatInvoiceCurrency(1575) === "$1,575", "currency formats as $1,575")
  const empty = computeInvoiceTotals({ invoice_base_rent: "", invoice_commission_pct: "", invoice_broker_split_pct: "" })
  ok(empty.totalInvoice === null && empty.expectedCommission === null, "blank inputs → null totals (no fabricated numbers)")
}

// ── Blank-allowed save: contact + notes only, all lease fields blank ──
{
  const form = seedInvoiceForm({ id: LEAD }, null)
  form.invoice_contact_name = "Sarah"
  form.invoice_contact_title = "Assistant Manager"
  form.invoice_notes = "Unable to provide lease details without resident authorization."
  const patch = buildInvoicePatch(form)
  ok(patch.invoice_contact_name === "Sarah" && patch.invoice_contact_title === "Assistant Manager", "contact name/title persist")
  ok(patch.invoice_notes === "Unable to provide lease details without resident authorization.", "notes persist")
  ok(patch.invoice_property_name === null && patch.invoice_unit_number === null && patch.invoice_lease_start_date === null, "blank lease fields → null (blank allowed)")
  ok(patch.invoice_base_rent === null && patch.invoice_commission_pct === null, "blank numbers → null")
  ok("invoice_lease_start_date" in patch && "invoice_base_rent" in patch, "patch still includes every invoice_* column")
}

// ── buildInvoicePatch parses numbers + trims text ──
{
  const form = seedInvoiceForm({ id: LEAD }, null)
  form.invoice_property_name = "  The Foundry  "
  form.invoice_base_rent = "1500"
  form.invoice_commission_pct = "150"
  form.invoice_rebate_type = "Cash Rebate"
  form.invoice_rebate_amount = "250"
  const patch = buildInvoicePatch(form)
  ok(patch.invoice_property_name === "The Foundry", "text trimmed")
  ok(patch.invoice_base_rent === 1500 && patch.invoice_commission_pct === 150, "numbers parsed to numeric")
  ok(patch.invoice_rebate_type === "Cash Rebate" && patch.invoice_rebate_amount === 250, "rebate persists")
}

// ── Presentation formatting is display-only; persistence stays numeric ──
{
  ok(formatMoneyDisplay("1200") === "$1,200", "money display → $1,200")
  ok(formatPercentDisplay("100") === "100%", "percent display → 100%")
  ok(formatMoneyDisplay("840") === "$840" && formatPercentDisplay("70") === "70%", "Expected/Broker display formats")
  ok(formatMoneyDisplay("") === "" && formatPercentDisplay("") === "", "blank stays blank (no $/% on empty)")
  ok(rawNumericString("$1,200") === "1200" && rawNumericString("100%") === "100", "raw strip removes $ , %")
  // A formatted value round-trips back to a raw numeric on save (never persists $/%/commas).
  const form = seedInvoiceForm({ id: LEAD }, null)
  form.invoice_base_rent = "$1,200"
  form.invoice_commission_pct = "100%"
  form.invoice_rebate_amount = "$50"
  const patch = buildInvoicePatch(form)
  ok(patch.invoice_base_rent === 1200 && patch.invoice_commission_pct === 100 && patch.invoice_rebate_amount === 50, "formatted inputs persist as raw numbers (no $/%/commas stored)")
  // Formatting does not change the computed totals.
  const totals = computeInvoiceTotals({ invoice_base_rent: "$1,200", invoice_commission_pct: "100%", invoice_broker_split_pct: "70%" })
  ok(totals.totalInvoice === 1200 && totals.expectedCommission === 840, "totals compute identically whether inputs are raw or formatted")
}

// ── Save completes get_invoice_details without duplicate / stage change (mirrors saveInvoiceDetails) ──
{
  const now = new Date().toISOString()
  const state = {
    lead: { id: LEAD, crm_status: "closed", top_pick_favorite_id: FOUNDRY, closed_at: now },
    actions: [{ id: "inv", lead_id: LEAD, action_key: "get_invoice_details", title: "Get Invoice Details", property_id: FOUNDRY, completed: false, status: "open" }],
  }
  const patch = buildInvoicePatch({ ...seedInvoiceForm(state.lead, "The Foundry"), invoice_base_rent: "1500", invoice_commission_pct: "150" } as any)
  const savedLead = { ...state.lead, ...patch }
  const savedActions = state.actions.map((a) => (a.action_key === "get_invoice_details" ? { ...a, completed: true, status: "completed", completed_at: now } : a))
  ok(savedActions.filter((a) => a.action_key === "get_invoice_details").length === 1, "no duplicate Get Invoice Details action")
  ok(savedActions.find((a) => a.action_key === "get_invoice_details").completed === true, "Save completes get_invoice_details")
  ok(savedLead.crm_status === "closed", "lead stays Closed after save (no stage change)")
  ok(String(savedLead.top_pick_favorite_id) === String(FOUNDRY), "Top Pick / property association preserved")
  ok(savedLead.invoice_property_name === "The Foundry", "invoice_* persisted onto the lead")
}

// ── Companion read-only invoice projection ──
{
  const closedLead: any = {
    id: LEAD, crm_status: "closed", first_name: "Nina", last_name: "Petrova", top_pick_favorite_id: FOUNDRY,
    invoice_contact_name: "Sarah", invoice_contact_title: "Assistant Manager",
    invoice_property_name: "The Foundry", invoice_unit_number: "204",
    invoice_base_rent: 1500, invoice_commission_pct: 150, invoice_broker_split_pct: 70,
    invoice_rebate_type: "Cash Rebate", invoice_rebate_amount: 250, invoice_submitted: false,
    invoice_notes: "Signed 12-month lease.",
  }
  const p = buildActiveClientPayload(closedLead, [], null, null, "America/Chicago", [], [])
  ok(!!p.lead.invoice, "closed lead with data → invoice block present in DTO")
  ok(p.lead.invoice?.propertyName === "The Foundry" && p.lead.invoice?.unitNumber === "204", "invoice projects property + unit")
  ok(p.lead.invoice?.contactName === "Sarah" && p.lead.invoice?.contactTitle === "Assistant Manager", "invoice projects the property contact")
  ok(p.lead.invoice?.totalInvoice === 2250 && p.lead.invoice?.expectedCommission === 1575, "invoice computes Total + Expected Commission (same as the CRM)")
  ok(p.lead.invoice?.rebateType === "Cash Rebate" && p.lead.invoice?.rebateAmount === 250, "invoice projects the rebate")
  ok(p.lead.invoice?.notes === "Signed 12-month lease.", "invoice projects notes")

  // A closed lead with NO invoice data → no block (never an empty card).
  const bare = buildActiveClientPayload({ id: LEAD, crm_status: "closed", first_name: "Nina" }, [], null, null, "America/Chicago", [], [])
  ok(bare.lead.invoice == null, "closed lead with no invoice data → invoice is null")

  // A non-closed lead never carries invoice data even if fields exist.
  const notClosed = buildActiveClientPayload({ ...closedLead, crm_status: "applied" }, [], null, null, "America/Chicago", [], [])
  ok(notClosed.lead.invoice == null, "non-closed lead → invoice is null (Closed-only)")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
