// Guest Card content builders — pure field mapping + email subject/body
// templates shared by the Guest Card modal (email) and the PDF generator.
// No jsPDF, no DOM, no React here so it stays testable and reusable. The
// Guest Card pulls from three sources: the lead (Smart Lead Form), the
// selected Favorite Property, and the locator's own Agent Profile.
//
// TWO MODES, one builder:
//   • MODE A — scheduled tour (property.tourAt present): the subject is tagged
//     [TOUR SCHEDULED] and carries the date/time; the body states the tour and
//     includes a Tour Details section (before Client Details).
//   • MODE B — guest card only (no tour): the subject is tagged [GUEST CARD];
//     the body asks about availability and shows a Property of Interest section
//     instead of Tour Details.
//
// NO PLACEHOLDERS: a missing optional value omits its row / adjusts the
// sentence — the composer never renders "(# of beds)", "Not specified", or any
// instructional parenthetical.
//
// PRIVACY: a guest card goes to a leasing office (external). It carries ONLY
// non-sensitive resident basics (name, contact, move date, beds/baths, desired
// rent). It must NEVER include credit score, income, credit history, criminal
// background, eviction/broken-lease history, approval profile, or any client/
// locator notes — those stay internal to Locator Beast.

import { formatDateDisplay, formatDueDateTime } from "@bc/companion-shared"

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
  // The confirmed scheduled tour instant (UTC ISO) + the locator's zone, so the
  // guest card can state the exact tour date/time to the leasing office.
  tourAt?: string | null
  timeZone?: string | null
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
  // Verbose tour label ("Friday, August 21 • 9:00 AM"), kept for compatibility.
  scheduledTour: string
  // Short tour date ("09/22/2026") + wall-clock time ("9:00 AM"). tourDate feeds
  // the dormant PDF; tourTime feeds both the PDF and the email body. Both "" in
  // Mode B (no scheduled tour).
  tourDate: string
  tourTime: string
  // BODY: full, human-readable tour date ("Tuesday, September 22, 2026"). "" in Mode B.
  tourDateLong: string
  // SUBJECT-ONLY compact variants: abbreviated weekday + M/D/YYYY, no zero-padding
  // ("Tue 8/26/2026"), and a time that drops ":00" on the hour ("9 AM", but
  // "9:30 AM"). These keep the subject short — the body/PDF keep their own formats.
  tourDateCompact: string
  tourTimeCompact: string
  // "2 / 2" for the Client Details row.
  bedsBaths: string
  // "2 bed / 2 bath" / "studio" for the intro sentence ("" when unknown, so the
  // sentence drops the phrase entirely — never a placeholder).
  bedsBathsPhrase: string
  budget: string
  moveIn: string
  pets: string
  parking: string
  agentName: string
  brokerage: string
  agentPhone: string
  agentEmail: string
}

// Kept for defensive use by the PDF/body renderers: any stray blank OR legacy
// "Not specified" value is dropped rather than printed. The field builders below
// no longer EMIT "Not specified" (they emit "" for missing optional values), but
// stripPlaceholder still guards against it so a placeholder can never render.
export const NOT_SPECIFIED = "Not specified"
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
  if (!raw) return ""
  const d = raw.replace(/\D/g, "")
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  return raw.trim()
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

// Sentence-friendly beds/baths for the intro line ("a 2 bed / 2 bath at …").
// Studio reads "studio"; a lone bed/bath count still reads grammatically. "" when
// nothing was saved, so the caller drops the phrase entirely (no placeholder).
function bedsBathsPhraseLabel(lead: GuestCardLead): string {
  const beds = (lead.beds ?? "").toString().trim()
  const baths = (lead.baths ?? "").toString().trim()
  const isStudio = (lead.property_type ?? "").trim().toLowerCase() === "studio"
  if (isStudio && !beds) return baths ? `studio / ${baths} bath` : "studio"
  if (beds && baths) return `${beds} bed / ${baths} bath`
  if (beds) return `${beds} bed`
  if (baths) return `${baths} bath`
  return ""
}

// Move date as MM/DD/YYYY via the shared timezone-safe formatter (a date-only
// "YYYY-MM-DD" is parsed by parts, never shifted a day by UTC). "" when absent.
function moveInLabel(moveDate: string | null | undefined): string {
  if (!moveDate || !String(moveDate).trim()) return ""
  return formatDateDisplay(moveDate)
}

// Short scheduled-tour date ("09/22/2026") in the tour's zone (Mode A subject +
// Tour Details). Uses the locator's saved IANA zone so it matches the CRM.
function tourDateShort(iso: string, tz?: string | null): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: tz || undefined,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
}

// Scheduled-tour wall-clock time ("9:00 AM") in the tour's zone.
function tourTimeLabel(iso: string, tz?: string | null): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: tz || undefined,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

// BODY: full, human-readable tour date ("Tuesday, September 22, 2026").
function tourDateLongLabel(iso: string, tz?: string | null): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: tz || undefined,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

// SUBJECT-ONLY: abbreviated weekday + M/D/YYYY, no zero-padding ("Tue 8/26/2026").
// Built by parts so there is no comma between the weekday and the date.
function tourDateCompactLabel(iso: string, tz?: string | null): string {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString("en-US", { timeZone: tz || undefined, weekday: "short" })
  const md = d.toLocaleDateString("en-US", { timeZone: tz || undefined, month: "numeric", day: "numeric", year: "numeric" })
  return `${weekday} ${md}`
}

// SUBJECT-ONLY: wall-clock time that drops ":00" on the hour ("9 AM") but keeps
// nonzero minutes ("9:30 AM", "12:15 PM"). Derived in the tour's zone.
function tourTimeCompactLabel(iso: string, tz?: string | null): string {
  return tourTimeLabel(iso, tz).replace(/:00(\s[AP]M)$/, "$1")
}

export function buildGuestCardFields(
  lead: GuestCardLead,
  property: GuestCardProperty,
  agent: GuestCardAgent
): GuestCardFields {
  const clientFirstName = titleCase(lead.first_name) || ""
  const clientLastName = titleCase(lead.last_name) || ""
  const clientName = [clientFirstName, clientLastName].filter(Boolean).join(" ")

  const propertyName =
    (property.property_name ?? "").trim() || (property.property_address ?? "").trim()

  return {
    clientFirstName,
    clientLastName,
    clientName,
    clientEmail: (lead.email ?? "").trim(),
    clientPhone: digitsToPhone(lead.phone),
    propertyName,
    // Verbose tour label (kept for compatibility) + the short date/time parts.
    scheduledTour: property.tourAt
      ? formatDueDateTime(property.tourAt, { verbose: true, timeZone: property.timeZone ?? undefined })
      : "",
    tourDate: property.tourAt ? tourDateShort(property.tourAt, property.timeZone) : "",
    tourTime: property.tourAt ? tourTimeLabel(property.tourAt, property.timeZone) : "",
    tourDateLong: property.tourAt ? tourDateLongLabel(property.tourAt, property.timeZone) : "",
    tourDateCompact: property.tourAt ? tourDateCompactLabel(property.tourAt, property.timeZone) : "",
    tourTimeCompact: property.tourAt ? tourTimeCompactLabel(property.tourAt, property.timeZone) : "",
    bedsBaths: bedsBathsLabel(lead),
    bedsBathsPhrase: bedsBathsPhraseLabel(lead),
    // Desired rent is optional on a guest card — omit when absent (no placeholder).
    budget: (lead.desired_rent ?? "").trim(),
    moveIn: moveInLabel(lead.move_date),
    // Not in the schema yet — left empty so callers omit the row entirely.
    pets: (lead.pets || "").trim(),
    parking: (lead.parking || "").trim(),
    agentName: (agent.name || "").trim(),
    brokerage: (agent.brokerage || "").trim(),
    agentPhone: digitsToPhone(agent.phone),
    agentEmail: (agent.email || "").trim(),
  }
}

// Subject — short, pipe-separated, NO brokerage. MODE A (scheduled tour):
// "[TOUR SCHEDULED] {Property} | {Client} | {M/D/YYYY} at {Time}" (compact time,
// e.g. "9 AM" / "9:30 AM"). MODE B (no tour): "[GUEST CARD] {Property} | {Client}"
// — never a fabricated date. Missing segments are dropped (no placeholder).
export function buildGuestCardSubject(f: GuestCardFields): string {
  const hasTour = !!(f.tourDateCompact && f.tourTimeCompact)
  const property = stripPlaceholder(f.propertyName) || "Guest Card"
  const client = stripPlaceholder(f.clientName)
  const segments = [property]
  if (client) segments.push(client)
  if (hasTour) segments.push(`${f.tourDateCompact} at ${f.tourTimeCompact}`)
  return `${hasTour ? "[TOUR SCHEDULED]" : "[GUEST CARD]"} ${segments.join(" | ")}`
}

// [label, value] rows; empty-value rows are dropped. Used by the plain-text
// locator fallback below (the body uses inlineSection for its "Label: value" rows).
function block(rows: [string, string][]): string {
  return rows
    .filter(([, value]) => value.trim().length > 0)
    .map(([label, value]) => `${label}:\n${value}`)
    .join("\n\n")
}

// A titled "Label: value" section for the email body. A blank line follows the
// header (so the section title breathes above its fields), but the fields
// themselves stay COMPACT — single-spaced, no blank line between each. Empty rows
// are dropped; the whole section is "" (and omitted by the caller's filter) when
// no row has a value — so a section header never appears above nothing.
function inlineSection(header: string, rows: [string, string][]): string {
  const body = rows
    .filter(([, v]) => (v ?? "").trim().length > 0)
    .map(([label, v]) => `${label}: ${v.trim()}`)
    .join("\n")
  return body ? `${header}\n\n${body}` : ""
}

// Client-facing body WITHOUT the locator signature — the caller appends the
// shared agent signature (buildClientSignatureText) so the guest card, renter
// email, and any future deliverable share one signature. The second `opts`
// argument is accepted for backwards compatibility and intentionally unused
// (the leasing email lives in the To field; no "Date Generated" row in the body).
export function buildGuestCardBody(
  f: GuestCardFields,
  _opts?: { leasingEmail?: string | null; generatedDate?: string | null },
): string {
  const hasTour = !!(f.tourDate && f.tourTime)
  const property = stripPlaceholder(f.propertyName) || "the community"
  const phrase = f.bedsBathsPhrase
  // Body uses the full, human-readable date ("Tuesday, September 22, 2026 at
  // 9:00 AM") — the compact form is subject-only.
  const tourWhen = hasTour ? `${f.tourDateLong} at ${f.tourTime}` : ""

  // Intro — adjusts when beds/baths are unknown (drops the phrase, stays grammatical).
  let intro: string
  if (hasTour) {
    intro = phrase
      ? `My client is interested in a ${phrase} at ${property} and has scheduled a tour for ${tourWhen}.`
      : `My client has scheduled a tour at ${property} for ${tourWhen}.`
  } else {
    intro = phrase
      ? `My client is interested in a ${phrase} at ${property} and would like more information about your current availability.`
      : `My client is interested in ${property} and would like more information about your current availability.`
  }

  // Tour Details (Mode A) comes BEFORE Client Details; Property of Interest (Mode B)
  // replaces it when there is no scheduled tour.
  const context = hasTour
    ? inlineSection("Tour Details", [
        ["Touring Property", property],
        ["Tour Date", tourWhen],
      ])
    : inlineSection("Property of Interest", [["Community", property]])

  const clientDetails = inlineSection("Client Details", [
    ["Client Name", stripPlaceholder(f.clientName)],
    ["Beds / Baths", f.bedsBaths],
    ["Budget", f.budget],
    ["Move Date", f.moveIn],
  ])

  return [
    "Hello,",
    intro,
    "If you have any other available floor plans or units that you think would be a good fit based on their preferences, I'd love your recommendations.",
    "Could you also please confirm the current locator commission for this property?",
    context,
    clientDetails,
    "Thank you!",
  ]
    .filter((line) => line && line.trim().length > 0)
    .join("\n\n")
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
