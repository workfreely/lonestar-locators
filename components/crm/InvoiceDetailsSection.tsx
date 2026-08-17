"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { SectionCard } from "./LeadPanelSections"
import {
  seedInvoiceForm,
  computeInvoiceTotals,
  formatInvoiceCurrency,
  CLIENT_INCENTIVE_OPTIONS,
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

  // Presentation mirrors the Get Invoice Details modal: a two-column grid with
  // group sub-headers and consistent, full-cell field/read-only widths (so the
  // auto values no longer shrink into tiny right-aligned text). Field logic, the
  // data model, and the calculations are unchanged.
  const gridCls = "grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2"
  const groupLabel =
    "col-span-1 sm:col-span-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-text-secondary)] pt-1"
  const fieldLabel = "block mb-1 text-[11px] font-medium text-[var(--crm-text-secondary)]"
  const inputCls =
    "w-full h-9 text-[13px] rounded-md border border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--crm-accent)]"
  const readonlyCls =
    "w-full h-9 flex items-center text-[13px] font-semibold rounded-md border border-[var(--crm-border-soft)] bg-[var(--crm-panel)] text-[var(--crm-text-primary)] px-2.5"
  const autoTag = <span className="ml-1 text-[10px] font-normal normal-case text-[var(--crm-text-muted)]">(auto)</span>

  return (
    <>
      <SectionCard title="Invoice Details" collapsible defaultOpen={false} storageKey="invoice-details">
        <div className={gridCls}>
          {/* Property Contact — who provided the lease info (or why they couldn't). */}
          <p className={groupLabel}>Property Contact</p>
          <div>
            <label className={fieldLabel}>Contact Name</label>
            <input
              className={inputCls}
              value={form.invoice_contact_name}
              onChange={(e) => setForm((f) => ({ ...f, invoice_contact_name: e.target.value }))}
              onBlur={() => saveText("invoice_contact_name")}
              placeholder="Who did you speak with?"
            />
          </div>
          <div>
            <label className={fieldLabel}>Contact Title</label>
            <input
              className={inputCls}
              value={form.invoice_contact_title}
              onChange={(e) => setForm((f) => ({ ...f, invoice_contact_title: e.target.value }))}
              onBlur={() => saveText("invoice_contact_title")}
              placeholder="e.g. Assistant Manager"
            />
          </div>

          <p className={groupLabel}>Lease Details</p>
          <div>
            <label className={fieldLabel}>Property Name</label>
            <input
              className={inputCls}
              value={form.invoice_property_name}
              onChange={(e) => setForm((f) => ({ ...f, invoice_property_name: e.target.value }))}
              onBlur={() => saveText("invoice_property_name")}
              placeholder="—"
            />
          </div>
          <div>
            <label className={fieldLabel}>Unit Number</label>
            <input
              className={inputCls}
              value={form.invoice_unit_number}
              onChange={(e) => setForm((f) => ({ ...f, invoice_unit_number: e.target.value }))}
              onBlur={() => saveText("invoice_unit_number")}
              placeholder="—"
            />
          </div>
          {/* Lease Start Date — blank/manual; never auto-filled from move date. */}
          <div>
            <label className={fieldLabel}>Lease Start Date</label>
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
          <div>
            <label className={fieldLabel}>Lease Term (Months)</label>
            <input
              className={inputCls}
              value={form.invoice_lease_term}
              onChange={(e) => setForm((f) => ({ ...f, invoice_lease_term: e.target.value }))}
              onBlur={() => saveText("invoice_lease_term")}
              placeholder="e.g. 12"
            />
          </div>

          <p className={groupLabel}>Commission</p>
          <div>
            <label className={fieldLabel}>Base Rent ($)</label>
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
          <div>
            <label className={fieldLabel}>Commission (%)</label>
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
          <div>
            <label className={fieldLabel}>Total Invoice Amount{autoTag}</label>
            <div className={readonlyCls}>{totalInvoice === null ? "—" : formatInvoiceCurrency(totalInvoice)}</div>
          </div>
          <div>
            <label className={fieldLabel}>Broker Split (%)</label>
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
          <div>
            <label className={fieldLabel}>Expected Commission{autoTag}</label>
            <div className={readonlyCls}>{expectedCommission === null ? "—" : formatInvoiceCurrency(expectedCommission)}</div>
          </div>
          <div className="hidden sm:block" />
          {/* Invoice Sent (durable state = leads.invoice_submitted; label only). */}
          <div>
            <label className={fieldLabel}>Invoice Sent</label>
            <div className="h-9 flex items-center">
              <input
                type="checkbox"
                className="w-4 h-4 rounded accent-[var(--kb-accent)] cursor-pointer"
                checked={form.invoice_submitted}
                onChange={(e) => saveBool("invoice_submitted", e.target.checked)}
              />
            </div>
          </div>
          {/* Commission Paid — READ-ONLY status. The canonical way to mark this is
              the Confirm Payment workflow (which completes commission_paid + records
              the timeline event); there is no second, uncontrolled write path here.
              Reflects the same canonical boolean (leads.invoice_commission_paid). */}
          <div>
            <label className={fieldLabel}>Commission Paid</label>
            <div className={readonlyCls}>{form.invoice_commission_paid ? "Yes" : "No"}</div>
          </div>

          {/* Notes — free-text context from the property call (e.g. "Unable to
              provide lease details without resident authorization."). */}
          <p className={groupLabel}>Notes</p>
          <textarea
            className="col-span-1 sm:col-span-2 w-full resize-y rounded-md border border-[var(--crm-border)] bg-[var(--crm-inset)] px-2.5 py-2 text-[13px] leading-relaxed text-[var(--crm-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--crm-accent)]"
            rows={3}
            value={form.invoice_notes}
            onChange={(e) => setForm((f) => ({ ...f, invoice_notes: e.target.value }))}
            onBlur={() => saveText("invoice_notes")}
            placeholder="Optional context from the property call"
          />
        </div>
      </SectionCard>

      {/* Client Incentive — tracks concessions offered to the client, for future gross /
          incentive / net commission reporting. Stored values are preserved (Cash Rebate /
          Free Movers / None); only the terminology is "Client Incentive". */}
      <SectionCard title="Client Incentive" collapsible defaultOpen={false} storageKey="invoice-rebate">
        <div className={gridCls}>
          <div>
            <label className={fieldLabel}>Client Incentive</label>
            <select
              className={`${inputCls} cursor-pointer [color-scheme:dark]`}
              value={form.invoice_rebate_type}
              onChange={(e) => saveRebateType(e.target.value)}
            >
              {CLIENT_INCENTIVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={fieldLabel}>Client Incentive Amount ($)</label>
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
        </div>
      </SectionCard>
    </>
  )
}
