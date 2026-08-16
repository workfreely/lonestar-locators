"use client"

import { useEffect, useState } from "react"
import {
  seedInvoiceForm,
  buildInvoicePatch,
  computeInvoiceTotals,
  formatInvoiceCurrency,
  formatMoneyDisplay,
  formatPercentDisplay,
  INVOICE_REBATE_TYPES,
  type InvoiceForm,
} from "@/lib/leads/invoiceFields"

// Get Invoice Details — a compact, centered batch-intake for the post-close
// lease/commission info, consistent with the Tour Follow-Up / Check Application
// modal system. Wider, responsive TWO-COLUMN layout (collapses to one column on
// small screens) so the agent sees most fields without scrolling; every editable
// input shares one height/width. Writes the SAME canonical leads.invoice_* fields
// as the persistent Invoice Details section (shared lib/leads/invoiceFields) — no
// second invoice model. Only Property Name auto-populates (from the Top Pick);
// every lease field starts blank/manual (never from move date or budget), and
// BLANK IS ALLOWED — the agent can save just the contact + notes when a property
// refuses to share lease details, and still complete the action. Money/percent
// fields accept a raw number and format at rest (blur), never mid-type.

export default function GetInvoiceDetailsModal({
  open,
  onClose,
  lead,
  propertyName,
  clientName,
  autoPropertyName,
  onSave,
}: {
  open: boolean
  onClose: () => void
  lead: any | null
  propertyName: string | null
  clientName: string | null
  autoPropertyName?: string | null
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [form, setForm] = useState<InvoiceForm>(() => seedInvoiceForm(lead ?? {}, autoPropertyName))
  // Which numeric field is focused — formatted "$1,200"/"100%" at rest, raw digits
  // while editing (so we never fight the user mid-type).
  const [focused, setFocused] = useState<keyof InvoiceForm | null>(null)

  useEffect(() => {
    if (open) {
      setForm(seedInvoiceForm(lead ?? {}, autoPropertyName))
      setFocused(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  if (!open) return null

  const { totalInvoice, expectedCommission } = computeInvoiceTotals(form)
  const set = (patch: Partial<InvoiceForm>) => setForm((f) => ({ ...f, ...patch }))
  // Typed computed-key setter — avoids a generic type-assertion inside JSX (which
  // the .tsx parser can mistake for a JSX tag).
  const setField = (field: keyof InvoiceForm, value: string) => setForm((f) => ({ ...f, [field]: value }))

  const groupLabel = "col-span-1 sm:col-span-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-text-secondary)] pt-1"
  const fieldLabel = "block mb-1 text-[11px] font-medium text-[var(--crm-text-secondary)]"
  const inputCls =
    "w-full h-9 text-[13px] rounded-md border border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] px-2.5 focus:outline-none focus:ring-1 focus:ring-[var(--crm-accent)]"
  const readonlyCls =
    "w-full h-9 flex items-center text-[13px] font-semibold rounded-md border border-[var(--crm-border-soft)] bg-[var(--crm-panel)] text-[var(--crm-text-primary)] px-2.5"

  // A labeled plain text/date input (the native date icon opens its own picker).
  const textField = (field: keyof InvoiceForm, label: string, placeholder = "—", type = "text") => (
    <div>
      <label className={fieldLabel}>{label}</label>
      <input
        type={type}
        className={type === "date" ? `crm-native-date ${inputCls} [color-scheme:dark]` : inputCls}
        value={String(form[field] ?? "")}
        onChange={(e) => setField(field, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )

  // A labeled money/percent input: raw while focused, formatted at rest.
  const numField = (field: keyof InvoiceForm, label: string, kind: "money" | "percent") => {
    const raw = String(form[field] ?? "")
    const display = focused === field ? raw : kind === "money" ? formatMoneyDisplay(raw) : formatPercentDisplay(raw)
    return (
      <div>
        <label className={fieldLabel}>{label}</label>
        <input
          type="text"
          inputMode="decimal"
          className={inputCls}
          value={display}
          onFocus={() => setFocused(field)}
          onBlur={() => setFocused(null)}
          onChange={(e) => setField(field, e.target.value)}
          placeholder="—"
        />
      </div>
    )
  }

  const readOnly = (label: string, value: number | null) => (
    <div>
      <label className={fieldLabel}>{label}</label>
      <div className={readonlyCls}>{value === null ? "—" : formatInvoiceCurrency(value)}</div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-[var(--crm-panel)] shadow-2xl">
        {/* Header — Action · Property (same treatment as the other workflow modals). */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--crm-border)] px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-bold text-[var(--crm-text-primary)]">
              Get Invoice Details{propertyName ? ` · ${propertyName}` : ""}
            </h3>
            <p className="mt-0.5 text-[12px] text-[var(--crm-text-muted)]">
              {clientName ? `${clientName} · ` : ""}Lease Signed
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-none rounded-lg p-1.5 text-[var(--crm-text-muted)] transition-colors hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Two-column grid (collapses to one column below sm). */}
        <div className="grid grid-cols-1 gap-x-5 gap-y-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <p className={groupLabel}>Property Contact</p>
          {textField("invoice_contact_name", "Contact Name", "Who did you speak with?")}
          {textField("invoice_contact_title", "Contact Title", "e.g. Assistant Manager")}

          <p className={groupLabel}>Lease Details</p>
          {textField("invoice_property_name", "Property Name")}
          {textField("invoice_unit_number", "Unit Number")}
          {textField("invoice_lease_start_date", "Lease Start Date", "—", "date")}
          {textField("invoice_lease_term", "Lease Term (Months)", "e.g. 12")}

          <p className={groupLabel}>Commission</p>
          {numField("invoice_base_rent", "Base Rent", "money")}
          {numField("invoice_commission_pct", "Commission %", "percent")}
          {readOnly("Total Invoice Amount", totalInvoice)}
          {numField("invoice_broker_split_pct", "Broker Split %", "percent")}
          {readOnly("Expected Commission", expectedCommission)}
          <div className="hidden sm:block" />

          <p className={groupLabel}>Client Rebate</p>
          <div>
            <label className={fieldLabel}>Client Rebate Type</label>
            <select className={`${inputCls} cursor-pointer [color-scheme:dark]`} value={form.invoice_rebate_type} onChange={(e) => set({ invoice_rebate_type: e.target.value })}>
              {INVOICE_REBATE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {numField("invoice_rebate_amount", "Client Rebate Amount ($)", "money")}

          <p className={groupLabel}>Notes</p>
          <textarea
            className="col-span-1 sm:col-span-2 w-full resize-y rounded-md border border-[var(--crm-border)] bg-[var(--crm-inset)] px-2.5 py-2 text-[13px] leading-relaxed text-[var(--crm-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--crm-accent)]"
            rows={3}
            value={form.invoice_notes}
            onChange={(e) => set({ invoice_notes: e.target.value })}
            placeholder="Optional context from the property call"
          />
        </div>

        {/* Footer — Cancel | Save Invoice Details (Save always allowed; blank ok). */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--crm-border)] px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--crm-border)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(buildInvoicePatch(form))} className="crm-cta px-4 py-2 rounded-lg text-[13px] font-semibold">
            Save Invoice Details
          </button>
        </div>
      </div>
    </div>
  )
}
