"use client"

import { useMemo, useState } from "react"
import {
  buildGuestCardFields,
  buildGuestCardSubject,
  buildGuestCardBody,
  buildGuestCardLocatorFallback,
  guestCardPdfFilename,
  type GuestCardFields,
  type GuestCardAgent,
} from "@/lib/leads/guestCard"
import { drawGuestCard, type PdfImage } from "@/lib/leads/guestCardPdf"
import {
  buildClientSignatureText,
  decideIabs,
  type ResolvedAgentIdentity,
} from "@/lib/notifications/agentSignature"

// Email Guest Card workflow. Step 1 auto-generates a branded Guest Card PDF
// (populated from the Smart Lead Form + the selected Favorite Property + the
// Agent Profile). Step 2 is this editable preview: the locator tweaks the
// subject / body / leasing-office recipient, then "Continue to Email" downloads
// the PDF and opens their own email client (mailto) pre-filled so they attach
// the PDF and send from their real address. Completing this launches Setup Tour.

// Load a remote image → PNG data URL + dims for jsPDF, via <canvas> so any format
// the browser decodes (webp/png/jpg) works. Returns null on error OR a CORS-
// tainted canvas, so the PDF still generates without the image (graceful).
async function loadPdfImage(url: string | null | undefined, square: boolean): Promise<PdfImage> {
  if (!url) return null
  return new Promise<PdfImage>((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onerror = () => resolve(null)
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        if (square) {
          const s = Math.min(img.naturalWidth, img.naturalHeight) || 1
          canvas.width = s
          canvas.height = s
          const ctx = canvas.getContext("2d")
          if (!ctx) return resolve(null)
          ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, s, s)
        } else {
          // Cap the longest side so a large logo upload can't bloat the PDF.
          let w = img.naturalWidth || 1
          let h = img.naturalHeight || 1
          const max = 600
          if (Math.max(w, h) > max) {
            const s = max / Math.max(w, h)
            w = Math.round(w * s)
            h = Math.round(h * s)
          }
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext("2d")
          if (!ctx) return resolve(null)
          ctx.drawImage(img, 0, 0, w, h)
        }
        resolve({ dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height })
      } catch {
        resolve(null) // tainted canvas (CORS) — skip the image, keep the PDF
      }
    }
    img.src = url
  })
}

async function generateAndDownloadPdf(
  f: GuestCardFields,
  signature: ResolvedAgentIdentity | null,
  showDisclosure: boolean,
  leasingEmail: string,
  generatedDate: string,
) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const [agentPhoto, brokerageLogo] = await Promise.all([
    loadPdfImage(signature?.photoUrl, true),
    loadPdfImage(signature?.logoUrl, false),
  ])
  drawGuestCard(doc, {
    fields: f,
    signature,
    showDisclosure,
    leasingEmail,
    generatedDate,
    agentPhoto,
    brokerageLogo,
  })
  doc.save(guestCardPdfFilename(f))
}

export default function GuestCardModal({
  open,
  onClose,
  lead,
  property,
  agent,
  signature = null,
  prefillTo = "",
  onSent,
}: {
  open: boolean
  onClose: () => void
  lead: any
  property: any
  agent: GuestCardAgent
  /** Resolved signed-in locator identity for the shared disclosure + signature. */
  signature?: ResolvedAgentIdentity | null
  prefillTo?: string
  onSent?: () => void
}) {
  const fields = useMemo(
    () => buildGuestCardFields(lead || {}, property || {}, agent || {}),
    [lead, property, agent]
  )

  // Texas IABS shows when the agent serves TX, the lead's market is TX, or an
  // IABS URL is explicitly configured (decideIabs). Resolved from the signature.
  const showDisclosure = useMemo(
    () => (signature ? decideIabs(signature, { leadCity: lead?.city }).show : false),
    [signature, lead]
  )

  // Date the card was generated, MM/DD/YYYY in the locator's local time.
  const generatedDate = useMemo(() => {
    const d = new Date()
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`
  }, [])

  const [to, setTo] = useState(prefillTo)
  const [subject, setSubject] = useState(() => buildGuestCardSubject(fields))
  const [body, setBody] = useState(() => {
    const base = buildGuestCardBody(fields, { leasingEmail: prefillTo, generatedDate })
    const sig = signature
      ? buildClientSignatureText(signature, { showDisclosure })
      : buildGuestCardLocatorFallback(fields)
    return `${base}\n\n${sig}`
  })
  const [busy, setBusy] = useState(false)

  if (!open) return null

  async function handleContinue() {
    setBusy(true)
    try {
      await generateAndDownloadPdf(fields, signature, showDisclosure, to, generatedDate)
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
              <span>Beds/Baths: <span className="text-[var(--crm-text-primary)]">{fields.bedsBaths || "—"}</span></span>
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
            The PDF isn&apos;t auto-attached — it downloads so you can attach it in your email app before sending.
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
