"use client"

import { useEffect, useMemo, useState } from "react"
import { buildClientSignatureText, type ResolvedAgentIdentity } from "@/lib/notifications/agentSignature"
import { buildInvoiceSubject, buildInvoiceEmailBody, type InvoiceEmailData } from "@/lib/leads/invoiceEmail"

// Send Invoice — the same email-composer pattern as Email Guest Card (editable
// Recipient / Subject / Message → "Open Email" opens the agent's mail client via
// mailto). It is NOT a second email system: identical architecture + the shared
// agent/brokerage signature. All content is prefilled from the canonical saved
// invoice_* fields (the agent never re-enters invoice info) and is PROPERTY-FACING
// only — internal fields (broker split, expected commission, client rebate, notes)
// are never included (see lib/leads/invoiceEmail). Opening the email does NOT mark
// it sent; the parent shows a "Did you send the invoice?" confirmation afterward.

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

export default function SendInvoiceModal({
  open,
  onClose,
  lead,
  propertyName,
  clientName,
  signature = null,
  onOpened,
}: {
  open: boolean
  onClose: () => void
  lead: any | null
  propertyName: string | null
  clientName: string | null
  signature?: ResolvedAgentIdentity | null
  /** Fired after the agent opens the prepared email — the parent then confirms
   *  "Did you send the invoice?" (Open Email does NOT mark it sent). */
  onOpened?: () => void
}) {
  // Canonical invoice data → email content. Total Invoice Amount = base × comm%
  // (the amount requested from the property — never the expected commission).
  const invoiceData: InvoiceEmailData = useMemo(() => {
    const base = num(lead?.invoice_base_rent)
    const comm = num(lead?.invoice_commission_pct)
    return {
      clientName,
      propertyName,
      unitNumber: lead?.invoice_unit_number ?? null,
      leaseStartDate: (lead?.invoice_lease_start_date ?? "").slice(0, 10) || null,
      leaseTerm: lead?.invoice_lease_term ?? null,
      baseRent: base,
      commissionPct: comm,
      totalInvoice: base != null && comm != null ? (base * comm) / 100 : null,
      contactName: lead?.invoice_contact_name ?? null,
    }
  }, [lead, propertyName, clientName])

  // No canonical property/accounting email exists — start blank; the agent fills it.
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)

  // Reseed the editable fields from the canonical invoice data each time the modal
  // opens (mirrors the Guest Card composer — the component stays mounted).
  useEffect(() => {
    if (!open) return
    setTo("")
    setSubject(buildInvoiceSubject(invoiceData))
    const base = buildInvoiceEmailBody(invoiceData)
    const sig = signature ? buildClientSignatureText(signature, { showDisclosure: false }) : ""
    setBody(sig ? `${base}\n\n${sig}` : base)
  }, [open, invoiceData, signature])

  if (!open) return null

  function handleOpenEmail() {
    setBusy(true)
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailto, "_self")
    setBusy(false)
    onOpened?.()
    onClose()
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2 text-[13px] text-[var(--crm-text-primary)] outline-none transition-colors focus:border-[var(--crm-accent)]"
  const labelCls = "text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-text-secondary)]"

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--crm-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--crm-border)] px-6 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-bold text-[var(--crm-text-primary)]">
              Send Invoice{propertyName ? ` · ${propertyName}` : ""}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--crm-text-secondary)]">Review the email, then open it to send.</p>
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

        {/* Body — editable Recipient / Subject / Message. */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <label className={labelCls}>Recipient</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="billing@property.com (you can also fill this in your email app)"
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className={`${inputCls} resize-y font-[inherit] leading-relaxed`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--crm-border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--crm-border)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-text-secondary)] transition-colors hover:bg-[var(--crm-card)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleOpenEmail}
            disabled={busy}
            className="crm-cta min-w-[120px] whitespace-nowrap rounded-lg px-4 py-2 text-center text-[13px] font-semibold disabled:opacity-60"
          >
            {busy ? "Preparing…" : "Open Email"}
          </button>
        </div>
      </div>
    </div>
  )
}
