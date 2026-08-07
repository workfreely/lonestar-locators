// Shared Guest Card PDF layout. Pure drawing over a caller-provided jsPDF doc so
// the browser modal (loads images via <canvas>) and the node preview (loads via
// sharp) render the IDENTICAL guest card. Images are preloaded by the caller and
// passed in; a null image is simply skipped, so PDF generation always succeeds
// even when a photo/logo fails to load.
//
// Sections: Property → Prospective Resident → Locator Signature (IABS disclosure
// above the signature). Never includes sensitive screening data (see guestCard.ts).

import type { jsPDF } from "jspdf"
import type { GuestCardFields } from "./guestCard"
import { stripPlaceholder } from "./guestCard"
import type { ResolvedAgentIdentity } from "../notifications/agentSignature"
import { buildIabsDisclosureText, DEFAULT_AGENT_TITLE } from "../notifications/agentSignature"

export type PdfImage = { dataUrl: string; width: number; height: number } | null

export type DrawGuestCardInput = {
  fields: GuestCardFields
  signature: ResolvedAgentIdentity | null
  showDisclosure: boolean
  leasingEmail?: string | null
  generatedDate?: string | null
  agentPhoto?: PdfImage
  brokerageLogo?: PdfImage
}

const ACCENT: [number, number, number] = [79, 70, 229] // indigo-600
const INK: [number, number, number] = [31, 35, 43]
const MUTED: [number, number, number] = [107, 114, 128]
const HAIRLINE: [number, number, number] = [214, 217, 224]

const EMPTY_IDENTITY: ResolvedAgentIdentity = {
  name: null, title: "", brokerage: null, serviceAreas: null, phone: null,
  email: null, website: null, photoUrl: null, logoUrl: null, iabsUrl: null, servesTexas: false,
}

export function drawGuestCard(doc: jsPDF, input: DrawGuestCardInput): void {
  const { fields: f, signature, showDisclosure, leasingEmail, generatedDate, agentPhoto, brokerageLogo } = input
  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 54
  const contentW = pageW - marginX * 2

  const brokerageTitle = (signature?.brokerage ?? f.brokerage ?? "").trim() || "Guest Card"

  // Header band
  doc.setFillColor(...ACCENT)
  doc.rect(0, 0, pageW, 96, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("GUEST CARD", marginX, 40)
  doc.setFontSize(20)
  doc.text(brokerageTitle, marginX, 66)
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

  // Label/value row — omits blanks and the "Not specified" placeholder.
  const row = (label: string, value: string) => {
    const v = stripPlaceholder(value)
    if (!v.trim()) return
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(label, marginX, y)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...INK)
    doc.setFontSize(11)
    const wrapped = doc.splitTextToSize(v, contentW - 150)
    doc.text(wrapped, marginX + 150, y)
    y += Math.max(22, wrapped.length * 14 + 8)
  }

  // PROPERTY
  section("Property")
  row("Community", f.propertyName)
  row("Leasing Office Email", (leasingEmail ?? "").trim())
  row("Date Generated", (generatedDate ?? "").trim())

  // PROSPECTIVE RESIDENT
  y += 8
  section("Prospective Resident")
  row("Name", f.clientName)
  row("Phone", f.clientPhone)
  row("Email", f.clientEmail)
  row("Move-in Date", f.moveIn)
  row("Beds / Baths", f.bedsBaths)
  row("Desired Rent", f.budget)

  // LOCATOR SIGNATURE
  y += 8
  section("Locator Signature")

  // Texas IABS disclosure above the signature. A flat PDF can't carry a clickable
  // link, so the full URL is printed verbatim (never a substituted form).
  if (showDisclosure) {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const disc = doc.splitTextToSize(buildIabsDisclosureText(signature ?? EMPTY_IDENTITY), contentW)
    doc.text(disc, marginX, y)
    y += disc.length * 12 + 14
  }

  // Agent photo (optional) + details to its right.
  const detailsX = agentPhoto ? marginX + 72 : marginX
  if (agentPhoto) {
    try {
      doc.addImage(agentPhoto.dataUrl, "PNG", marginX, y, 56, 56)
    } catch {
      /* image failed — skip, keep generating */
    }
  }
  let dy = y + 12
  const sigName = (signature?.name ?? f.agentName ?? "").trim()
  if (sigName) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.setTextColor(...INK)
    doc.text(sigName, detailsX, dy)
    dy += 16
  }
  const detail = (value?: string | null) => {
    const t = stripPlaceholder(value ?? "").trim()
    if (!t) return
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(...MUTED)
    doc.text(t, detailsX, dy)
    dy += 14
  }
  detail(signature?.title || DEFAULT_AGENT_TITLE)
  detail(signature?.brokerage ?? f.brokerage)
  detail(signature?.phone ?? f.agentPhone)
  detail(signature?.email ?? f.agentEmail)
  detail(signature?.website)

  y = Math.max(dy, y + (agentPhoto ? 68 : 0)) + 8

  // Brokerage logo — only when configured; keeps aspect ratio, capped size.
  if (brokerageLogo) {
    const h = 28
    const ratio = brokerageLogo.width && brokerageLogo.height ? brokerageLogo.width / brokerageLogo.height : 3
    const w = Math.min(ratio * h, 180)
    try {
      doc.addImage(brokerageLogo.dataUrl, "PNG", marginX, y, w, h)
    } catch {
      /* logo failed — skip */
    }
  }
}
