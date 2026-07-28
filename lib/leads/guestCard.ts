// Guest Card content builders — pure field mapping + email subject/body
// templates shared by the Guest Card modal (email) and the PDF generator.
// No jsPDF, no DOM, no React here so it stays testable and reusable. The
// Guest Card pulls from three sources: the lead (Smart Lead Form), the
// selected Favorite Property, and the locator's own Agent Profile.

export type GuestCardLead = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  desired_rent?: string | null
  beds?: string | null
  property_type?: string | null
  move_date?: string | null
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
  bedroom: string
  budget: string
  moveIn: string
  pets: string
  parking: string
  agentName: string
  brokerage: string
  agentPhone: string
  agentEmail: string
}

const NOT_SPECIFIED = "Not specified"

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

function bedroomLabel(lead: GuestCardLead): string {
  if ((lead.property_type || "").toLowerCase() === "studio") return "Studio"
  const beds = (lead.beds || "").toString().trim()
  if (!beds) return NOT_SPECIFIED
  const n = beds.replace(/\D/g, "")
  return n ? `${n} Bedroom` : beds
}

function moveInLabel(moveDate: string | null | undefined): string {
  if (!moveDate) return NOT_SPECIFIED
  const d = new Date(moveDate)
  if (isNaN(d.getTime())) return moveDate.trim() || NOT_SPECIFIED
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
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
    bedroom: bedroomLabel(lead),
    budget: orNotSpecified(lead.desired_rent),
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

export function buildGuestCardBody(f: GuestCardFields): string {
  const clientInfo = block([
    ["Name", f.clientName],
    ["Email", f.clientEmail],
    ["Phone", f.clientPhone],
    ["Touring Property", f.propertyName],
    ["Bedroom", f.bedroom],
    ["Budget", f.budget],
    ["Move-in Date", f.moveIn],
    ["Pets", f.pets],
    ["Parking Preferences", f.parking],
  ])

  const locatorInfo = block([
    ["Locator", f.agentName],
    ["Brokerage", f.brokerage],
    ["Phone", f.agentPhone],
    ["Email", f.agentEmail],
  ])

  return `Hello,

I hope you're having a great day!

My client is interested in touring a ${f.bedroom} at ${f.propertyName} and is planning to move around ${f.moveIn}.

If you have any other available floor plans or units that you think would be a good fit based on their preferences, I'd love your recommendations.

Could you also please confirm the current locator commission for this property?

Please CC me on any emails you send to the client so I can help coordinate the leasing process.

Thank you!

──────────────────────────────

CLIENT INFORMATION

${clientInfo}

──────────────────────────────

LOCATOR INFORMATION

${locatorInfo}`
}

// Safe filename for the downloaded PDF, e.g. "Guest-Card-Devon-Carter.pdf".
export function guestCardPdfFilename(f: GuestCardFields): string {
  const base = `Guest Card ${f.clientName}`.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-")
  return `${base || "Guest-Card"}.pdf`
}
