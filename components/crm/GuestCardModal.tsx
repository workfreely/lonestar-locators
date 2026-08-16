"use client"

import { useEffect, useMemo, useState } from "react"
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

// The email IS the Guest Card now: PDF generation is DISCONNECTED from the active
// send flow (no auto-download, no attach step). The generator below + guestCardPdf
// are intentionally PRESERVED (dormant) for a possible future "download Guest Card"
// option — flip this to re-enable. Keeping the reference here also keeps the
// generator + its helpers/imports live (never dead code).
const ATTACH_PDF = false

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

  // This property-facing Guest Card intentionally carries NO Texas IABS
  // disclosure / Consumer Protection Notice — it goes to a leasing office, not a
  // prospective client. The IABS infrastructure (decideIabs / buildIabsDisclosureText
  // / buildClientSignatureText's disclosure arg) is preserved for the client-facing
  // deliverables that DO require it; here we simply never render it.
  const showDisclosure = false

  // Date the card was generated, MM/DD/YYYY in the locator's local time.
  const generatedDate = useMemo(() => {
    const d = new Date()
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`
  }, [])

  const [to, setTo] = useState(prefillTo)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)

  // Seed the editable To / Subject / Body from the CANONICAL fields each time the
  // modal opens (and whenever the target lead/property changes). This component
  // stays mounted (open is toggled by the parent), so a one-time useState
  // initializer would capture the empty pre-open fields and render
  // "Not specified" forever — reseeding on open is what binds the real client +
  // property. `fields` is memoized on [lead, property, agent], so a re-render that
  // doesn't change the target never clobbers the locator's in-progress edits.
  useEffect(() => {
    if (!open) return
    setTo(prefillTo)
    setSubject(buildGuestCardSubject(fields))
    const base = buildGuestCardBody(fields)
    const sig = signature
      ? buildClientSignatureText(signature, { showDisclosure })
      : buildGuestCardLocatorFallback(fields)
    setBody(`${base}\n\n${sig}`)
  }, [open, fields, signature, prefillTo])

  if (!open) return null

  async function handleContinue() {
    setBusy(true)
    // Dormant: the PDF no longer downloads in the active flow (the email is the
    // Guest Card). Preserved behind ATTACH_PDF for a future download option.
    if (ATTACH_PDF) {
      try {
        await generateAndDownloadPdf(fields, signature, showDisclosure, to, generatedDate)
      } catch (err) {
        console.error("[guest-card] PDF generation failed:", err)
      }
    }
    // Open the agent's own email client with the editable Subject + Body.
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
              Review the email, then open it to send.
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

        {/* Body — begins directly with the editable email fields. The Subject and
            Body already identify the property/client/tour, so no separate summary
            block (and no PDF) is shown; this gives the body more vertical room. */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
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
        <div className="flex items-center justify-end gap-3 border-t border-[var(--crm-border)] px-6 py-4">
          <div className="flex flex-none items-center gap-2">
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
              className="crm-cta min-w-[120px] whitespace-nowrap rounded-lg px-4 py-2 text-center text-[13px] font-semibold disabled:opacity-60"
            >
              {busy ? "Preparing…" : "Open Email"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
