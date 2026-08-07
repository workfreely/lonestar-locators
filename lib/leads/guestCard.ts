// Guest Card content builders — pure field mapping + email subject/body
// templates shared by the Guest Card modal (email) and the PDF generator.
// No jsPDF, no DOM, no React here so it stays testable and reusable. The
// Guest Card pulls from three sources: the lead (Smart Lead Form), the
// selected Favorite Property, and the locator's own Agent Profile.
//
// PRIVACY: a guest card goes to a leasing office (external). It carries ONLY
// non-sensitive resident basics (name, contact, move-in, beds/baths, desired
// rent). It must NEVER include credit score, income, credit history, criminal
// background, eviction/broken-lease history, approval profile, or any client/
// locator notes — those stay internal to Locator Beast.

import { formatDateDisplay } from "@bc/companion-shared"

export type GuestCardLead = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  desired_rent?: string | null
  beds?: string | null
  baths?: string | null
  property_type?: string | null
  move_date?: string | null
  city?: string | null
  // Not in the schema today — populated defensively if ever present.
  pets?: string | null
  parking?: string | null
}

export type GuestCardProperty = {
  property_name?: string | null
  property_address?: string | null
  property_url?: string | null
}

export type GuestCardAgent = {
  name?: string | null
  brokerage?: string | null
  phone?: string | null
  email?: string | null
}

export type GuestCardFields = {
  clientFirstName: string
  clientLastName: string
  clientName: string
  clientEmail: string
  clientPhone: string
  propertyName: string
  bedsBaths: string
  budget: string
  moveIn: string
  pets: string
  parking: string
  agentName: string
  brokerage: string
  agentPhone: string
  agentEmail: string
}

export const NOT_SPECIFIED = "Not specified"
// Treat both blank and the "Not specified" placeholder as omit-worthy, so client-
// facing sections never show empty rows or invented placeholder values.
export const stripPlaceholder = (v: string | null | undefined): string =>
  !v || v === NOT_SPECIFIED ? "" : v

function titleCase(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

function digitsToPhone(raw: string | null | undefined): string {
  if (!raw) return NOT_SPECIFIED
  const d = raw.replace(/\D/g, "")
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  return raw.trim() || NOT_SPECIFIED
}

// Exact Beds/Baths from the Smart Lead Form selections — never inferred/broadened.
// beds/baths are "1" | "2" | "3+"; a Studio submission saves neither, so the
// property type carries it ("Studio"). Returns "" when nothing was saved (row
// omitted rather than shown blank).
function bedsBathsLabel(lead: GuestCardLead): string {
  const beds = (lead.beds ?? "").toString().trim()
  const baths = (lead.baths ?? "").toString().trim()
  const isStudio = (lead.property_type ?? "").trim().toLowerCase() === "studio"
  const bedsPart = beds || (isStudio ? "Studio" : "")
  if (bedsPart && baths) return `${bedsPart} / ${baths}`
  return bedsPart || baths || ""
}

// Move-in date as MM/DD/YYYY via the shared timezone-safe formatter (a date-only
// "YYYY-MM-DD" is parsed by parts, never shifted a day by UTC). "" when absent.
function moveInLabel(moveDate: string | null | undefined): string {
  if (!moveDate || !String(moveDate).trim()) return ""
  return formatDateDisplay(moveDate)
}

function orNotSpecified(raw: string | null | undefined): string {
  const v = (raw || "").trim()
  return v || NOT_SPECIFIED
}

export function buildGuestCardFields(
  lead: GuestCardLead,
  property: GuestCardProperty,
  agent: GuestCardAgent
): GuestCardFields {
  const clientFirstName = titleCase(lead.first_name) || ""
  const clientLastName = titleCase(lead.last_name) || ""
  const clientName = [clientFirstName, clientLastName].filter(Boolean).join(" ") || NOT_SPECIFIED

  return {
    clientFirstName,
    clientLastName,
    clientName,
    clientEmail: orNotSpecified(lead.email),
    clientPhone: digitsToPhone(lead.phone),
    propertyName: orNotSpecified(property.property_name) === NOT_SPECIFIED
      ? orNotSpecified(property.property_address)
      : (property.property_name as string).trim(),
    bedsBaths: bedsBathsLabel(lead),
    // Desired rent is optional on a guest card — omit when absent (no placeholder).
    budget: (lead.desired_rent ?? "").trim(),
    moveIn: moveInLabel(lead.move_date),
    // Not in the schema yet — left empty so callers omit the row entirely
    // rather than printing "Not specified".
    pets: (lead.pets || "").trim(),
    parking: (lead.parking || "").trim(),
    agentName: (agent.name || "").trim() || NOT_SPECIFIED,
    brokerage: (agent.brokerage || "").trim() || NOT_SPECIFIED,
    agentPhone: digitsToPhone(agent.phone),
    agentEmail: orNotSpecified(agent.email),
  }
}

export function buildGuestCardSubject(f: GuestCardFields): string {
  return `[GUEST CARD] ${f.propertyName} - ${f.brokerage} (${f.clientName})`
}

// [label, value] rows; empty-value rows are dropped (e.g. Pets / Parking when
// the Smart Lead Form doesn't have that data yet).
function block(rows: [string, string][]): string {
  return rows
    .filter(([, value]) => value.trim().length > 0)
    .map(([label, value]) => `${label}:\n${value}`)
    .join("\n\n")
}

// Client-facing body WITHOUT the locator signature — the caller appends the
// shared compliance disclosure + agent signature (buildClientSignatureText) so
// the guest card, renter email, and any future deliverable share one signature.
// Organized: Property → Prospective Resident (→ caller adds Locator Signature).
export function buildGuestCardBody(
  f: GuestCardFields,
  opts?: { leasingEmail?: string | null; generatedDate?: string | null },
): string {
  const property = block([
    ["Community", stripPlaceholder(f.propertyName)],
    ["Leasing Office Email", (opts?.leasingEmail ?? "").trim()],
    ["Date Generated", (opts?.generatedDate ?? "").trim()],
  ])

  const resident = block([
    ["Name", stripPlaceholder(f.clientName)],
    ["Phone", stripPlaceholder(f.clientPhone)],
    ["Email", stripPlaceholder(f.clientEmail)],
    ["Move-in Date", f.moveIn],
    ["Beds / Baths", f.bedsBaths],
    ["Desired Rent", f.budget],
  ])

  return `Hello,

I hope you're having a great day!

My client is interested in touring ${f.propertyName}${f.moveIn ? ` and is planning to move in around ${f.moveIn}` : ""}.

If you have any other available floor plans or units that you think would be a good fit based on their preferences, I'd love your recommendations.

Could you also please confirm the current locator commission for this property?

Please CC me on any emails you send to the client so I can help coordinate the leasing process.

Thank you!

──────────────────────────────

PROPERTY

${property}

──────────────────────────────

PROSPECTIVE RESIDENT

${resident}`
}

// Fallback locator block (plain text) used only when a resolved signature is
// unavailable — keeps the guest card usable without duplicating the shared
// signature component.
export function buildGuestCardLocatorFallback(f: GuestCardFields): string {
  const locatorInfo = block([
    ["Locator", f.agentName],
    ["Brokerage", f.brokerage],
    ["Phone", f.agentPhone],
    ["Email", f.agentEmail],
  ])
  return `──────────────────────────────\n\n${locatorInfo}`
}

// Safe filename for the downloaded PDF, e.g. "Guest-Card-Devon-Carter.pdf".
export function guestCardPdfFilename(f: GuestCardFields): string {
  const base = `Guest Card ${f.clientName}`.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")
  return `${base || "Guest-Card"}.pdf`
}
