"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { SectionCard } from "./LeadPanelSections"

// Post-close commission tracking for a Closed lead — a structured home for the
// lease + commission info needed to get paid, instead of stuffing it into
// Notes, and the data source for future commission reporting/analytics.
// Rendered only for Closed leads (see LeadPanel). Persists to leads.invoice_*.

const REBATE_TYPES = ["None", "Cash Rebate", "Free Movers", "Gift Card", "Other"] as const

type InvoiceForm = {
  invoice_property_name: string
  invoice_unit_number: string
  invoice_lease_start_date: string
  invoice_lease_term: string
  invoice_base_rent: string
  invoice_commission_pct: string
  invoice_broker_split_pct: string
  invoice_rebate_type: string
  invoice_rebate_amount: string
  invoice_submitted: boolean
  invoice_commission_paid: boolean
}

function seedForm(lead: any): InvoiceForm {
  const num = (v: any) => (v === null || v === undefined || v === "" ? "" : String(v))
  return {
    invoice_property_name: lead.invoice_property_name ?? "",
    invoice_unit_number: lead.invoice_unit_number ?? "",
    invoice_lease_start_date: (lead.invoice_lease_start_date ?? "").slice(0, 10),
    invoice_lease_term: lead.invoice_lease_term ?? "",
    invoice_base_rent: num(lead.invoice_base_rent),
    invoice_commission_pct: num(lead.invoice_commission_pct),
    invoice_broker_split_pct: num(lead.invoice_broker_split_pct),
    invoice_rebate_type: lead.invoice_rebate_type ?? "None",
    invoice_rebate_amount: num(lead.invoice_rebate_amount),
    invoice_submitted: !!lead.invoice_submitted,
    invoice_commission_paid: !!lead.invoice_commission_paid,
  }
}

function formatCurrency(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export default function InvoiceDetailsSection({
  lead,
  onUpdateLead,
}: {
  lead: any
  onUpdateLead?: (updatedLead: any) => void
}) {
  const [form, setForm] = useState<InvoiceForm>(() => seedForm(lead))

  // The panel reuses one instance across leads — reseed whenever the selected
  // lead changes (or its stored invoice values change underneath us).
  useEffect(() => {
    setForm(seedForm(lead))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  // Optimistic local update + persist a single column. Errors are non-fatal
  // (e.g. before the invoice_* migration is applied) — the in-session value
  // still shows via onUpdateLead.
  async function persist(patch: Record<string, unknown>) {
    if (onUpdateLead) onUpdateLead({ ...lead, ...patch })
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

  function saveBool(column: "invoice_submitted" | "invoice_commission_paid", value: boolean) {
    setForm((f) => ({ ...f, [column]: value }))
    persist({ [column]: value })
  }

  function saveRebateType(value: string) {
    setForm((f) => ({ ...f, invoice_rebate_type: value }))
    persist({ invoice_rebate_type: value })
  }

  // Auto-calculations (live, read-only, never stored — always derivable):
  //   Total Invoice Amount = Base Rent × Commission %   ($1,500 × 150% = $2,250)
  //   Expected Commission  = Total × Broker Split %      ($2,250 × 70% = $1,575)
  const baseNum = parseFloat(form.invoice_base_rent)
  const pctNum = parseFloat(form.invoice_commission_pct)
  const totalInvoice =
    !Number.isNaN(baseNum) && !Number.isNaN(pctNum) ? (baseNum * pctNum) / 100 : null
  const brokerNum = parseFloat(form.invoice_broker_split_pct)
  const expectedCommission =
    totalInvoice !== null && !Number.isNaN(brokerNum) ? (totalInvoice * brokerNum) / 100 : null

  const rowCls = "flex items-center justify-between gap-3"
  const labelCls = "text-[12.5px] text-[var(--crm-text-secondary)] flex-none"
  const inputCls =
    "w-[56%] text-[12.5px] rounded-md border border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-primary)] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[var(--kb-accent)]"
  const autoValueCls = "text-[12.5px] font-bold text-[var(--crm-text-primary)] text-right"
  const autoTag = <span className="ml-1 text-[10px] text-[var(--crm-text-muted)] normal-case">(auto)</span>

  return (
    <>
      <SectionCard title="Invoice Details" collapsible defaultOpen={false} storageKey="invoice-details">
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

        {/* Lease Start Date */}
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
          <label className={labelCls}>Lease Term</label>
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
          <span className={autoValueCls}>{totalInvoice === null ? "—" : formatCurrency(totalInvoice)}</span>
        </div>

        {/* Broker Split % — the only commission input the user enters */}
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
            {expectedCommission === null ? "—" : formatCurrency(expectedCommission)}
          </span>
        </div>

        {/* Invoice Submitted */}
        <div className={rowCls}>
          <label className={labelCls}>Invoice Submitted</label>
          <input
            type="checkbox"
            className="w-4 h-4 rounded accent-[var(--kb-accent)] cursor-pointer"
            checked={form.invoice_submitted}
            onChange={(e) => saveBool("invoice_submitted", e.target.checked)}
          />
        </div>

        {/* Commission Paid */}
        <div className={rowCls}>
          <label className={labelCls}>Commission Paid</label>
          <input
            type="checkbox"
            className="w-4 h-4 rounded accent-[var(--kb-accent)] cursor-pointer"
            checked={form.invoice_commission_paid}
            onChange={(e) => saveBool("invoice_commission_paid", e.target.checked)}
          />
        </div>
      </SectionCard>

      {/* Rebate — tracks concessions offered to the client, for future gross /
          rebate / net commission reporting. */}
      <SectionCard title="Rebate" collapsible defaultOpen={false} storageKey="invoice-rebate">
        {/* Rebate Type */}
        <div className={rowCls}>
          <label className={labelCls}>Rebate Type</label>
          <select
            className={`${inputCls} cursor-pointer [color-scheme:dark]`}
            value={form.invoice_rebate_type}
            onChange={(e) => saveRebateType(e.target.value)}
          >
            {REBATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Rebate Amount */}
        <div className={rowCls}>
          <label className={labelCls}>Rebate Amount ($)</label>
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
