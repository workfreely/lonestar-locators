"use client"

import { useMemo, useState } from "react"
import {
  buildGuestCardFields,
  buildGuestCardSubject,
  buildGuestCardBody,
  guestCardPdfFilename,
  type GuestCardFields,
  type GuestCardAgent,
} from "@/lib/leads/guestCard"

// Email Guest Card workflow. Step 1 auto-generates a branded Guest Card PDF
// (populated from the Smart Lead Form + the selected Favorite Property + the
// Agent Profile). Step 2 is this editable preview: the locator tweaks the
// subject / body / leasing-office recipient, then "Continue to Email" downloads
// the PDF and opens their own email client (mailto) pre-filled so they attach
// the PDF and send from their real address. Completing this launches Setup Tour.

const ACCENT: [number, number, number] = [79, 70, 229] // indigo-600
const INK: [number, number, number] = [31, 35, 43]
const MUTED: [number, number, number] = [107, 114, 128]
const HAIRLINE: [number, number, number] = [214, 217, 224]

async function generateAndDownloadPdf(f: GuestCardFields) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 54

  // Header band.
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, pageW, 96, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("GUEST CARD", marginX, 40)
  doc.setFontSize(20)
  doc.text(f.brokerage, marginX, 66)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.text(f.propertyName, marginX, 84)

  let y = 140

  const section = (title: string) => {
    doc.setTextColor(...ACCENT)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text(title.toUpperCase(), marginX, y)
    y += 8
    doc.setDrawColor(...HAIRLINE)
    doc.setLineWidth(1)
    doc.line(marginX, y, pageW - marginX, y)
    y += 20
  }

  const row = (label: string, value: string) => {
    if (!value || !value.trim()) return // omit empty rows (e.g. Pets / Parking)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(label, marginX, y)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...INK)
    doc.setFontSize(11)
    const wrapped = doc.splitTextToSize(value, pageW - marginX - 190)
    doc.text(wrapped, marginX + 150, y)
    y += Math.max(22, wrapped.length * 14 + 8)
  }

  section("Client Information")
  row("Name", f.clientName)
  row("Email", f.clientEmail)
  row("Phone", f.clientPhone)
  row("Touring Property", f.propertyName)
  row("Bedroom", f.bedroom)
  row("Budget", f.budget)
  row("Move-in Date", f.moveIn)
  row("Pets", f.pets)
  row("Parking Preferences", f.parking)

  y += 12
  section("Locator Information")
  row("Locator", f.agentName)
  row("Brokerage", f.brokerage)
  row("Phone", f.agentPhone)
  row("Email", f.agentEmail)

  doc.save(guestCardPdfFilename(f))
}

export default function GuestCardModal({
  open,
  onClose,
  lead,
  property,
  agent,
  prefillTo = "",
  onSent,
}: {
  open: boolean
  onClose: () => void
  lead: any
  property: any
  agent: GuestCardAgent
  prefillTo?: string
  onSent?: () => void
}) {
  const fields = useMemo(
    () => buildGuestCardFields(lead || {}, property || {}, agent || {}),
    [lead, property, agent]
  )

  const [to, setTo] = useState(prefillTo)
  const [subject, setSubject] = useState(() => buildGuestCardSubject(fields))
  const [body, setBody] = useState(() => buildGuestCardBody(fields))
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function handleContinue() {
    setBusy(true)
    try {
      await generateAndDownloadPdf(fields)
    } catch (err) {
      console.error("[guest-card] PDF generation failed:", err)
    }
    const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailto, "_self")
    setBusy(false)
    onSent?.()
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
          <div>
            <h3 className="text-[16px] font-bold text-[var(--crm-text-primary)]">Email Guest Card</h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--crm-text-secondary)]">
              Review the branded Guest Card, personalize the email, then continue to send.
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

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Guest Card summary — what the generated PDF contains */}
          <div className="rounded-xl border border-[var(--crm-border-soft)] bg-[var(--crm-card)] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--crm-accent)]">
                Guest Card PDF
              </span>
              <span className="text-[11px] text-[var(--crm-text-muted)]">Auto-generated &amp; downloaded on continue</span>
            </div>
            <p className="mt-1.5 text-[13.5px] font-semibold text-[var(--crm-text-primary)]">{fields.propertyName}</p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-[var(--crm-text-secondary)]">
              <span>Client: <span className="text-[var(--crm-text-primary)]">{fields.clientName}</span></span>
              <span>Bedroom: <span className="text-[var(--crm-text-primary)]">{fields.bedroom}</span></span>
              <span>Budget: <span className="text-[var(--crm-text-primary)]">{fields.budget}</span></span>
              <span>Move-in: <span className="text-[var(--crm-text-primary)]">{fields.moveIn}</span></span>
              <span>Locator: <span className="text-[var(--crm-text-primary)]">{fields.agentName}</span></span>
              <span>Brokerage: <span className="text-[var(--crm-text-primary)]">{fields.brokerage}</span></span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Leasing Office Email</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="leasing@property.com (you can also fill this in your email app)"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Email Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              className={`${inputCls} resize-y font-[inherit] leading-relaxed`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--crm-border)] px-6 py-4">
          <p className="text-[11.5px] text-[var(--crm-text-muted)]">
            The PDF downloads so you can attach it in your email app.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--crm-border)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-text-secondary)] transition-colors hover:bg-[var(--crm-card)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={busy}
              className="crm-cta rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
            >
              {busy ? "Preparing…" : "Continue to Email"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
