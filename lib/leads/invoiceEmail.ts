import { formatUnitDisplay } from "@bc/companion-shared"

// Send Invoice email content — built ENTIRELY from the canonical saved invoice
// fields so the agent never re-enters anything. Pure (no DB / no I/O): safe to
// import anywhere, including tests. The composer appends the shared agent/
// brokerage signature (same system as Guest Card).
//
// PROPERTY-FACING ONLY. This email goes to the leasing office, so it MUST NEVER
// expose internal Locator Beast information: broker split, expected commission
// (after split), client rebate/incentives, internal property-call notes, or any
// CRM internals. "Invoice Amount" is the Total Invoice Amount (base rent ×
// commission %) — the amount requested from the property, never the expected
// commission. Missing optional fields are omitted, never rendered as
// undefined/null/empty/misleading zeros.

export type InvoiceEmailData = {
  clientName: string | null
  propertyName: string | null
  unitNumber: string | null
  leaseStartDate: string | null // "YYYY-MM-DD"
  leaseTerm: string | null // months, as entered (e.g. "12")
  baseRent: number | null
  commissionPct: number | null
  totalInvoice: number | null // computed Total Invoice Amount (base × commission%)
  /** Property contact greeting only — NOT the recipient email. */
  contactName?: string | null
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** "$1,200.00" (two decimals for a payment request). */
function money2(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "2026-08-18" → "August 18, 2026" without any timezone shift (parses the parts). */
function longDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd).trim())
  if (!m) return String(ymd)
  const year = Number(m[1]), mo = Number(m[2]), day = Number(m[3])
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return String(ymd)
  return `${MONTHS[mo - 1]} ${day}, ${year}`
}

const has = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== ""

/**
 * Concise professional subject: "Invoice – {Client} – #{Unit}". Unit uses the
 * shared "#" display formatter (never "##"); it is gracefully omitted when
 * unavailable rather than showing an empty value.
 */
export function buildInvoiceSubject(d: Pick<InvoiceEmailData, "clientName" | "unitNumber">): string {
  const parts: string[] = ["Invoice"]
  if (has(d.clientName)) parts.push(String(d.clientName).trim())
  const unit = formatUnitDisplay(d.unitNumber) // "#3456" or ""
  if (unit) parts.push(unit)
  return parts.join(" – ")
}

/**
 * Clean, professional, property-facing invoice body from the canonical fields.
 * Only lines with real values are included. Internal fields are NEVER included.
 * The composer appends the shared signature after this.
 */
export function buildInvoiceEmailBody(d: InvoiceEmailData): string {
  const lines: string[] = []
  if (has(d.propertyName)) lines.push(`Property: ${String(d.propertyName).trim()}`)
  if (has(d.clientName)) lines.push(`Client: ${String(d.clientName).trim()}`)
  const unit = formatUnitDisplay(d.unitNumber)
  if (unit) lines.push(`Unit: ${unit}`)
  if (has(d.leaseStartDate)) lines.push(`Lease Start: ${longDate(String(d.leaseStartDate))}`)
  if (has(d.leaseTerm)) {
    const term = String(d.leaseTerm).trim()
    lines.push(`Lease Term: ${/month/i.test(term) ? term : `${term} months`}`)
  }
  if (d.baseRent != null) lines.push(`Base Rent: ${money2(d.baseRent)}`)
  if (d.commissionPct != null) lines.push(`Commission: ${d.commissionPct}%`)
  if (d.totalInvoice != null) lines.push(`Invoice Amount: ${money2(d.totalInvoice)}`)

  const greeting = has(d.contactName) ? `Hello ${String(d.contactName).trim()},` : "Hello,"
  const intro = "Please find the invoice details below for the recently signed lease:"
  const closing = "Please let me know if you need anything further to process this invoice."
  return `${greeting}\n\n${intro}\n\n${lines.join("\n")}\n\n${closing}`
}
