"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { SectionCard } from "./LeadPanelSections"
import {
  seedInvoiceForm,
  computeInvoiceTotals,
  formatInvoiceCurrency,
  INVOICE_REBATE_TYPES,
  type InvoiceForm,
} from "@/lib/leads/invoiceFields"

// Post-close commission tracking for a Closed lead — the persistent home for the
// lease + commission info needed to get paid (and who at the property provided
// it), instead of stuffing it into Notes, and the data source for future
// commission reporting/analytics. Reads/writes the SAME canonical leads.invoice_*
// fields as the Get Invoice Details intake modal (one model, one source of truth);
// the field logic is shared via lib/leads/invoiceFields. Rendered for Closed leads.

export default function InvoiceDetailsSection({
  lead,
  onUpdateLead,
}: {
  lead: any
  onUpdateLead?: (updatedLead: any) => void
}) {
  const [form, setForm] = useState<InvoiceForm>(() => seedInvoiceForm(lead))

  // The panel reuses one instance across leads — reseed whenever the selected lead
  // changes OR its stored invoice values change underneath us (e.g. the Get Invoice
  // Details modal just saved for THIS lead), so the section reflects the save at once.
  useEffect(() => {
    setForm(seedInvoiceForm(lead))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    lead.id,
    lead.invoice_contact_name,
    lead.invoice_contact_title,
    lead.invoice_notes,
    lead.invoice_property_name,
    lead.invoice_unit_number,
    lead.invoice_lease_start_date,
    lead.invoice_lease_term,
    lead.invoice_base_rent,
    lead.invoice_commission_pct,
    lead.invoice_broker_split_pct,
    lead.invoice_rebate_type,
    lead.invoice_rebate_amount,
    lead.invoice_submitted,
    lead.invoice_commission_paid,
  ])

  // Optimistic local update + persist a single column. Errors are non-fatal
  // (e.g. before the invoice_* migration is applied) — the in-session value
  // still shows via onUpdateLead.
  async function persist(patch: Record<string, unknown>) {
    if (onUpdateLead) onUpdateLead({ ...lead, ...patch })
    // Demo leads are client-side only ("demo-1" ids) — optimistic update above
    // is enough; never write to the bigint-keyed leads table.
    if (isDemoLeadId(lead.id)) return
    const { error } = await supabase.from("leads").update(patch).eq("id", lead.id)
    if (error) console.error("[invoice-details] save failed:", error.message)
  }

  function saveText(column: keyof InvoiceForm) {
    const value = String(form[column]).trim()
    const next = value || null
    if ((lead[column] ?? null) === next) return
    persist({ [column]: next })
  }

  function saveNumber(column: keyof InvoiceForm) {
    const raw = String(form[column]).trim()
    if (raw === "") {
      if ((lead[column] ?? null) !== null) persist({ [column]: null })
      return
    }
    const n = Number(raw)
    if (Number.isNaN(n)) return
    if (Number(lead[column]) === n) return
    persist({ [column]: n })
  }

  function saveDate(value: string) {
    setForm((f) => ({ ...f, invoice_lease_start_date: value }))
    persist({ invoice_lease_start_date: value || null })
  }

  // Ongoing status flags. NOTE: these no longer complete the Get Invoice Details
  // action — Save Invoice Details (the intake modal) is the completion trigger.
  // invoice_submitted is reserved for the future Send Invoice step.
  function saveBool(column: "invoice_submitted" | "invoice_commission_paid", value: boolean) {
    setForm((f) => ({ ...f, [column]: value }))
    persist({ [column]: value })
  }

  function saveRebateType(value: string) {
    setForm((f) => ({ ...f, invoice_rebate_type: value }))
    persist({ invoice_rebate_type: value })
  }

  // Auto-calcs (live, read-only, never stored) — shared with the intake modal.
  const { totalInvoice, expectedCommission } = computeInvoiceTotals(form)

  const rowCls = "flex items-center justify-between gap-3"
  const labelCls = "text-[12.5px] text-[var(--crm-text-secondary)] flex-none"
  const inputCls =
    "w-[56%] text-[12.5px] rounded-md border border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--kb-accent)]"
  const autoValueCls = "text-[12.5px] font-bold text-[var(--crm-text-primary)] text-right"
  const autoTag = <span className="ml-1 text-[10px] text-[var(--crm-text-muted)] normal-case">(auto)</span>

  return (
    <>
      <SectionCard title="Invoice Details" collapsible defaultOpen={false} storageKey="invoice-details">
        {/* Property Contact — who provided the lease info (or why they couldn't). */}
        <div className={rowCls}>
          <label className={labelCls}>Contact Name</label>
          <input
            className={inputCls}
            value={form.invoice_contact_name}
            onChange={(e) => setForm((f) => ({ ...f, invoice_contact_name: e.target.value }))}
            onBlur={() => saveText("invoice_contact_name")}
            placeholder="Who did you speak with?"
          />
        </div>
        <div className={rowCls}>
          <label className={labelCls}>Contact Title</label>
          <input
            className={inputCls}
            value={form.invoice_contact_title}
            onChange={(e) => setForm((f) => ({ ...f, invoice_contact_title: e.target.value }))}
            onBlur={() => saveText("invoice_contact_title")}
            placeholder="e.g. Assistant Manager"
          />
        </div>

        {/* Property Name */}
        <div className={rowCls}>
          <label className={labelCls}>Property Name</label>
          <input
            className={inputCls}
            value={form.invoice_property_name}
            onChange={(e) => setForm((f) => ({ ...f, invoice_property_name: e.target.value }))}
            onBlur={() => saveText("invoice_property_name")}
            placeholder="—"
          />
        </div>

        {/* Unit Number */}
        <div className={rowCls}>
          <label className={labelCls}>Unit Number</label>
          <input
            className={inputCls}
            value={form.invoice_unit_number}
            onChange={(e) => setForm((f) => ({ ...f, invoice_unit_number: e.target.value }))}
            onBlur={() => saveText("invoice_unit_number")}
            placeholder="—"
          />
        </div>

        {/* Lease Start Date — blank/manual; never auto-filled from move date. */}
        <div className={rowCls}>
          <label className={labelCls}>Lease Start Date</label>
          <input
            type="date"
            className={`crm-native-date ${inputCls} [color-scheme:dark]`}
            value={form.invoice_lease_start_date}
            onChange={(e) => saveDate(e.target.value)}
            onClick={(e) => {
              const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void }
              try {
                el.showPicker?.()
              } catch {
                /* unsupported — the icon still opens it */
              }
            }}
          />
        </div>

        {/* Lease Term */}
        <div className={rowCls}>
          <label className={labelCls}>Lease Term (Months)</label>
          <input
            className={inputCls}
            value={form.invoice_lease_term}
            onChange={(e) => setForm((f) => ({ ...f, invoice_lease_term: e.target.value }))}
            onBlur={() => saveText("invoice_lease_term")}
            placeholder="e.g. 12 months"
          />
        </div>

        {/* Base Rent */}
        <div className={rowCls}>
          <label className={labelCls}>Base Rent ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={form.invoice_base_rent}
            onChange={(e) => setForm((f) => ({ ...f, invoice_base_rent: e.target.value }))}
            onBlur={() => saveNumber("invoice_base_rent")}
            placeholder="—"
          />
        </div>

        {/* Commission % */}
        <div className={rowCls}>
          <label className={labelCls}>Commission (%)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            className={inputCls}
            value={form.invoice_commission_pct}
            onChange={(e) => setForm((f) => ({ ...f, invoice_commission_pct: e.target.value }))}
            onBlur={() => saveNumber("invoice_commission_pct")}
            placeholder="—"
          />
        </div>

        {/* Total Invoice Amount — auto (Base Rent × Commission %) */}
        <div className={`${rowCls} pt-0.5`}>
          <span className={labelCls}>Total Invoice Amount{autoTag}</span>
          <span className={autoValueCls}>{totalInvoice === null ? "—" : formatInvoiceCurrency(totalInvoice)}</span>
        </div>

        {/* Broker Split % */}
        <div className={rowCls}>
          <label className={labelCls}>Broker Split (%)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            className={inputCls}
            value={form.invoice_broker_split_pct}
            onChange={(e) => setForm((f) => ({ ...f, invoice_broker_split_pct: e.target.value }))}
            onBlur={() => saveNumber("invoice_broker_split_pct")}
            placeholder="—"
          />
        </div>

        {/* Expected Commission — auto (Total × Broker Split %) */}
        <div className={rowCls}>
          <span className={labelCls}>Expected Commission{autoTag}</span>
          <span className={autoValueCls}>
            {expectedCommission === null ? "—" : formatInvoiceCurrency(expectedCommission)}
          </span>
        </div>

        {/* Invoice Sent (durable state = leads.invoice_submitted; label only). */}
        <div className={rowCls}>
          <label className={labelCls}>Invoice Sent</label>
          <input
            type="checkbox"
            className="w-4 h-4 rounded accent-[var(--kb-accent)] cursor-pointer"
            checked={form.invoice_submitted}
            onChange={(e) => saveBool("invoice_submitted", e.target.checked)}
          />
        </div>

        {/* Commission Paid — READ-ONLY status. The canonical way to mark this is
            the Confirm Payment workflow (which completes commission_paid + records
            the timeline event); there is no second, uncontrolled write path here.
            Reflects the same canonical boolean (leads.invoice_commission_paid). */}
        <div className={rowCls}>
          <label className={labelCls}>Commission Paid</label>
          <span className="text-[12.5px] font-semibold text-[var(--crm-text-primary)]">
            {form.invoice_commission_paid ? "Yes" : "No"}
          </span>
        </div>

        {/* Notes — free-text context from the property call (e.g. "Unable to
            provide lease details without resident authorization."). */}
        <div className="pt-1">
          <label className={`${labelCls} block mb-1`}>Notes</label>
          <textarea
            className={`${inputCls} w-full resize-y`}
            rows={2}
            value={form.invoice_notes}
            onChange={(e) => setForm((f) => ({ ...f, invoice_notes: e.target.value }))}
            onBlur={() => saveText("invoice_notes")}
            placeholder="Optional context from the property call"
          />
        </div>
      </SectionCard>

      {/* Client Rebate — tracks concessions offered to the client, for future gross /
          rebate / net commission reporting. */}
      <SectionCard title="Client Rebate" collapsible defaultOpen={false} storageKey="invoice-rebate">
        {/* Client Rebate Type */}
        <div className={rowCls}>
          <label className={labelCls}>Client Rebate Type</label>
          <select
            className={`${inputCls} cursor-pointer [color-scheme:dark]`}
            value={form.invoice_rebate_type}
            onChange={(e) => saveRebateType(e.target.value)}
          >
            {INVOICE_REBATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Client Rebate Amount */}
        <div className={rowCls}>
          <label className={labelCls}>Client Rebate Amount ($)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={form.invoice_rebate_amount}
            onChange={(e) => setForm((f) => ({ ...f, invoice_rebate_amount: e.target.value }))}
            onBlur={() => saveNumber("invoice_rebate_amount")}
            placeholder="—"
          />
        </div>
      </SectionCard>
    </>
  )
}
