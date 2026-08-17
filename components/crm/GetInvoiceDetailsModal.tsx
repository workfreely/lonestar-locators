"use client"

import { useEffect, useState } from "react"
import DateTimePicker from "./DateTimePicker"
import {
  seedInvoiceForm,
  buildInvoicePatch,
  computeInvoiceTotals,
  formatInvoiceCurrency,
  formatMoneyDisplay,
  formatPercentDisplay,
  rawNumericString,
  CLIENT_INCENTIVE_OPTIONS,
  type InvoiceForm,
} from "@/lib/leads/invoiceFields"
import { isValidLeaseTerm } from "@/lib/leads/leaseFollowUp"

// Present a stored "YYYY-MM-DD" as "Aug 28, 2026" for the date-picker button; blank
// stays blank. Purely presentational — the canonical stored value is unchanged.
function formatLeaseDateDisplay(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return value
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

// The four fields required to complete Get Invoice Details (enough to build a
// meaningful invoice record). Everything else — Unit Number, contact, Broker
// Split, Client Incentive, Notes — stays optional. Property Name is NOT here: it
// comes from the Top Pick (property-scoped workflow), never re-entered.
const REQUIRED_INVOICE_FIELDS: (keyof InvoiceForm)[] = [
  "invoice_lease_start_date",
  "invoice_lease_term",
  "invoice_base_rent",
  "invoice_commission_pct",
]

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
  // Only surface required-field errors AFTER the first Save attempt (no errors on
  // open) — then they clear live as the agent fills each field.
  const [attempted, setAttempted] = useState(false)
  // Which date field's calendar popover is open (Lease Start Date). Null = closed.
  const [openDateField, setOpenDateField] = useState<keyof InvoiceForm | null>(null)

  useEffect(() => {
    if (open) {
      setForm(seedInvoiceForm(lead ?? {}, autoPropertyName))
      setFocused(null)
      setAttempted(false)
      setOpenDateField(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  if (!open) return null

  const { totalInvoice, expectedCommission } = computeInvoiceTotals(form)
  // A required field is "missing" when blank; for the two numeric ones, also when
  // it isn't a real number. Recomputed each render, so errors clear as you type.
  const isFieldMissing = (field: keyof InvoiceForm): boolean => {
    if (field === "invoice_base_rent" || field === "invoice_commission_pct") {
      const raw = rawNumericString(form[field])
      return raw === "" || Number.isNaN(Number(raw))
    }
    // Lease Term must be a positive WHOLE number of months (6/12/18). Blank, 0,
    // negative, decimal, or free text ("12 months") are invalid.
    if (field === "invoice_lease_term") return !isValidLeaseTerm(form[field])
    return String(form[field] ?? "").trim() === ""
  }
  const missingRequired = REQUIRED_INVOICE_FIELDS.filter(isFieldMissing)
  const handleSave = () => {
    if (missingRequired.length > 0) {
      setAttempted(true)
      return
    }
    onSave(buildInvoicePatch(form))
  }
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

  // Required-field label (adds a red "*") + error ring once the agent has tried to
  // Save with it blank. `!border-red-500` overrides the base border color.
  const labelWith = (label: string, required?: boolean) => (
    <label className={fieldLabel}>
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
  )
  const errorCls = (field: keyof InvoiceForm, required?: boolean) =>
    required && attempted && isFieldMissing(field) ? " !border-red-500 ring-1 ring-red-500" : ""

  // A labeled plain text/date input (the native date icon opens its own picker).
  const textField = (field: keyof InvoiceForm, label: string, placeholder = "—", type = "text", required = false) => (
    <div>
      {labelWith(label, required)}
      <input
        type={type}
        className={(type === "date" ? `crm-native-date ${inputCls} [color-scheme:dark]` : inputCls) + errorCls(field, required)}
        value={String(form[field] ?? "")}
        onChange={(e) => setField(field, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )

  // A labeled DATE field that opens the shared calendar (DateTimePicker, date-only)
  // instead of forcing manual typing. Stores the canonical "YYYY-MM-DD" verbatim.
  const dateField = (field: keyof InvoiceForm, label: string, required = false) => {
    const val = String(form[field] ?? "")
    const isOpen = openDateField === field
    return (
      <div>
        {labelWith(label, required)}
        <button
          type="button"
          onClick={() => setOpenDateField(isOpen ? null : field)}
          className={`${inputCls} flex items-center justify-between text-left${errorCls(field, required)}`}
        >
          <span className={val ? "" : "text-[var(--crm-text-muted)]"}>{val ? formatLeaseDateDisplay(val) : "Select date"}</span>
          <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-[var(--crm-text-muted)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
        {isOpen && (
          <DateTimePicker
            value={val}
            dateOnly
            onApply={(v) => { setField(field, v); setOpenDateField(null) }}
            onCancel={() => setOpenDateField(null)}
          />
        )}
      </div>
    )
  }

  // A labeled money/percent input: raw while focused, formatted at rest.
  const numField = (field: keyof InvoiceForm, label: string, kind: "money" | "percent", required = false) => {
    const raw = String(form[field] ?? "")
    const display = focused === field ? raw : kind === "money" ? formatMoneyDisplay(raw) : formatPercentDisplay(raw)
    return (
      <div>
        {labelWith(label, required)}
        <input
          type="text"
          inputMode="decimal"
          className={inputCls + errorCls(field, required)}
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
          {dateField("invoice_lease_start_date", "Lease Start Date", true)}
          {textField("invoice_lease_term", "Lease Term (Months)", "Whole number, e.g. 12", "text", true)}

          <p className={groupLabel}>Commission</p>
          {numField("invoice_base_rent", "Base Rent", "money", true)}
          {numField("invoice_commission_pct", "Commission %", "percent", true)}
          {readOnly("Total Invoice Amount", totalInvoice)}
          {numField("invoice_broker_split_pct", "Broker Split %", "percent")}
          {readOnly("Expected Commission", expectedCommission)}
          <div className="hidden sm:block" />

          <p className={groupLabel}>Client Incentive</p>
          <div>
            <label className={fieldLabel}>Client Incentive</label>
            <select className={`${inputCls} py-1 leading-normal cursor-pointer [color-scheme:dark]`} value={form.invoice_rebate_type} onChange={(e) => set({ invoice_rebate_type: e.target.value })}>
              {CLIENT_INCENTIVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {numField("invoice_rebate_amount", "Client Incentive Amount ($)", "money")}

          <p className={groupLabel}>Notes</p>
          <textarea
            className="col-span-1 sm:col-span-2 w-full resize-y rounded-md border border-[var(--crm-border)] bg-[var(--crm-inset)] px-2.5 py-2 text-[13px] leading-relaxed text-[var(--crm-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--crm-accent)]"
            rows={3}
            value={form.invoice_notes}
            onChange={(e) => set({ invoice_notes: e.target.value })}
            placeholder="Optional context from the property call"
          />
        </div>

        {/* Footer — Cancel | Save Invoice Details. Save is blocked (modal stays open,
            get_invoice_details not completed) until the 4 required fields are valid. */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--crm-border)] px-5 py-3">
          <p className={`min-w-0 text-[12px] text-red-500 ${attempted && missingRequired.length > 0 ? "" : "invisible"}`}>
            Complete the required invoice details before continuing.
          </p>
          <div className="flex flex-none items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-[var(--crm-border)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSave} className="crm-cta px-4 py-2 rounded-lg text-[13px] font-semibold">
              Save Invoice Details
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
