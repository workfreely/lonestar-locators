import { google } from "googleapis"
import { getOAuthClient } from "./getOAuthClient"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewLeadEventInput {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  city?: string | null
  source?: string | null
  desired_rent?: string | null
  beds?: string | null
  move_date?: string | null
  credit_score?: string | number | null
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  tiktok:    "TikTok",
  instagram: "Instagram",
  facebook:  "Facebook",
  website:   "Website",
  manual:    "Manual",
  referral:  "Referral",
  google:    "Google",
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return phone
}

function formatMoveDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD — parse at noon to avoid timezone off-by-one
  const d = new Date(`${dateStr}T12:00:00`)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
}

function formatSource(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? (source.charAt(0).toUpperCase() + source.slice(1).toLowerCase())
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildDescription(lead: NewLeadEventInput): string {
  const lines: string[] = []

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  if (fullName)          lines.push(`Client: ${fullName}`)
  if (lead.phone)        lines.push(`Phone: ${formatPhone(lead.phone)}`)
  if (lead.city)         lines.push(`City: ${lead.city}`)
  if (lead.source)       lines.push(`Source: ${formatSource(lead.source)}`)
  if (lead.desired_rent) lines.push(`Budget: ${lead.desired_rent}`)
  if (lead.beds)         lines.push(`Beds: ${lead.beds}`)
  if (lead.move_date)    lines.push(`Move Date: ${formatMoveDate(lead.move_date)}`)
  if (lead.credit_score) lines.push(`Credit: ${lead.credit_score}`)

  lines.push("")
  lines.push("ACTION: Send First Text")

  return lines.join("\n")
}

// ─── Shared low-level insert ──────────────────────────────────────────────────

async function insertCalendarEvent(eventBody: object, label: string): Promise<string> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is not set in environment variables")
  }

  console.log(`📅 [calendar] Inserting event: ${label}`)
  console.log(`📅 [calendar] GOOGLE_CALENDAR_ID: ${calendarId}`)
  console.log(`📅 [calendar] Event body:`, JSON.stringify(eventBody, null, 2))

  try {
    const oauth2Client = getOAuthClient()
    const calendar = google.calendar({ version: "v3", auth: oauth2Client })

    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
    })

    console.log(`📅 [calendar] Google API response status:`, response.status)

    const eventId = response.data.id
    if (!eventId) throw new Error("Google Calendar API returned no event ID")

    console.log(`✅ [calendar] Event created — ID: ${eventId} | ${label}`)
    return eventId
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status  = (err as any)?.response?.status
    const data    = (err as any)?.response?.data
    const stack   = err instanceof Error ? err.stack : undefined

    console.error(`❌ [calendar] Failed: ${label}`)
    console.error(`❌ [calendar] Message:`, message)
    if (status) console.error(`❌ [calendar] HTTP status:`, status)
    if (data)   console.error(`❌ [calendar] Response data:`, JSON.stringify(data, null, 2))
    if (stack)  console.error(`❌ [calendar] Stack:`, stack)

    throw new Error(`Calendar insert failed (${label}): ${message}`)
  }
}

// ─── List Sent — FU1 reminder ─────────────────────────────────────────────────

export interface ListSentEventInput {
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  city?: string | null
  source?: string | null
  desired_rent?: string | null
  beds?: string | null
  move_date?: string | null
}

function buildListSentDescription(lead: ListSentEventInput): string {
  const lines: string[] = []

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  if (fullName)          lines.push(`Client: ${fullName}`)
  if (lead.phone)        lines.push(`Phone: ${formatPhone(lead.phone)}`)
  if (lead.city)         lines.push(`City: ${lead.city}`)
  if (lead.source)       lines.push(`Source: ${formatSource(lead.source)}`)
  if (lead.desired_rent) lines.push(`Budget: ${lead.desired_rent}`)
  if (lead.beds)         lines.push(`Beds: ${lead.beds}`)
  if (lead.move_date)    lines.push(`Move Date: ${formatMoveDate(lead.move_date)}`)

  lines.push("")
  lines.push("ACTION:")
  lines.push("Check thoughts on apartment list.")
  lines.push("Identify favorite properties.")
  lines.push("Get tours scheduled.")

  return lines.join("\n")
}

/**
 * Creates a "📋 LIST FOLLOW-UP (FU1)" Google Calendar event.
 * Scheduled for the next calendar day at 10:00 AM America/Chicago.
 * Duration: 15 minutes.
 *
 * @param lead  - Lead that was just moved to list_sent
 * @returns     - The created Google Calendar event ID
 * @throws      - If GOOGLE_CALENDAR_ID is missing or the Calendar API call fails
 */
export async function createListSentCalendarEvent(lead: ListSentEventInput): Promise<string> {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown Lead"

  // Next calendar day at 10:00 AM Chicago — regardless of what time it is now.
  // We compute tomorrow's date in Chicago time, then express the event as a
  // local datetime string with an explicit timeZone so Google converts correctly.
  const nowChicago = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })
  )
  const tomorrowChicago = new Date(nowChicago)
  tomorrowChicago.setDate(nowChicago.getDate() + 1)

  const yyyy = tomorrowChicago.getFullYear()
  const mm   = String(tomorrowChicago.getMonth() + 1).padStart(2, "0")
  const dd   = String(tomorrowChicago.getDate()).padStart(2, "0")

  const startDateTime = `${yyyy}-${mm}-${dd}T10:00:00`
  const endDateTime   = `${yyyy}-${mm}-${dd}T10:15:00`

  console.log(`📅 [list-sent-event] Lead: ${fullName} | Scheduled: ${startDateTime} America/Chicago`)

  const eventBody = {
    summary: "📋 LIST FOLLOW-UP (FU1)",
    description: buildListSentDescription(lead),
    start: { dateTime: startDateTime, timeZone: "America/Chicago" },
    end:   { dateTime: endDateTime,   timeZone: "America/Chicago" },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 0 }, // notification at event time
      ],
    },
  }

  return insertCalendarEvent(eventBody, `LIST FU1 — ${fullName}`)
}

// ─── FU chain — FU2 / FU3 / Final ────────────────────────────────────────────

// Config for each step that can be scheduled after a completed FU.
// Key = the follow_up_count value that was JUST set (i.e. which FU was completed).
const FU_NEXT_EVENT: Record<number, { summary: string; actions: string[] }> = {
  1: {
    summary: "📋 LIST FOLLOW-UP (FU2)",
    actions: [
      "Check whether they reviewed the apartment list.",
      "Answer questions about the properties.",
      "Encourage scheduling tours.",
    ],
  },
  2: {
    summary: "📋 LIST FOLLOW-UP (FU3)",
    actions: [
      "Final attempt to re-engage.",
      "Offer to revise the apartment list.",
      "Identify any blockers to scheduling a tour.",
    ],
  },
  3: {
    summary: "🛑 FINAL FOLLOW-UP",
    actions: [
      "Send the 'pause your search' message.",
      "Leave the door open for future assistance.",
    ],
  },
}

/**
 * Creates the next follow-up Calendar reminder after a FU step is completed.
 * Only fires for steps 1, 2, 3 — step 4+ (chain end) throws so callers know to skip.
 *
 * Scheduled for next calendar day at 10:00 AM America/Chicago, 15-minute duration.
 *
 * @param lead          - The lead whose follow-up was just completed
 * @param completedStep - The follow_up_count that was JUST set (1 = FU1 done, 2 = FU2 done, 3 = FU3 done)
 */
export async function createFollowUpCalendarEvent(
  lead: ListSentEventInput,
  completedStep: number
): Promise<string> {
  const config = FU_NEXT_EVENT[completedStep]
  if (!config) {
    throw new Error(`No follow-up event configured for completedStep=${completedStep} — chain ends here`)
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown Lead"

  // Next calendar day at 10:00 AM Chicago
  const nowChicago = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })
  )
  const tomorrowChicago = new Date(nowChicago)
  tomorrowChicago.setDate(nowChicago.getDate() + 1)

  const yyyy = tomorrowChicago.getFullYear()
  const mm   = String(tomorrowChicago.getMonth() + 1).padStart(2, "0")
  const dd   = String(tomorrowChicago.getDate()).padStart(2, "0")

  const startDateTime = `${yyyy}-${mm}-${dd}T10:00:00`
  const endDateTime   = `${yyyy}-${mm}-${dd}T10:15:00`

  // Build description — same lead info block, FU-specific action lines
  const lines: string[] = []
  const fullNameLine = [lead.first_name, lead.last_name].filter(Boolean).join(" ")
  if (fullNameLine)     lines.push(`Client: ${fullNameLine}`)
  if (lead.phone)       lines.push(`Phone: ${formatPhone(lead.phone)}`)
  if (lead.city)        lines.push(`City: ${lead.city}`)
  if (lead.source)      lines.push(`Source: ${formatSource(lead.source)}`)
  if (lead.desired_rent) lines.push(`Budget: ${lead.desired_rent}`)
  if (lead.beds)        lines.push(`Beds: ${lead.beds}`)
  if (lead.move_date)   lines.push(`Move Date: ${formatMoveDate(lead.move_date)}`)
  lines.push("")
  lines.push("ACTION:")
  config.actions.forEach((a) => lines.push(a))

  console.log(`📅 [fu-chain] Step ${completedStep} done → ${config.summary} | Lead: ${fullName} | ${startDateTime} Chicago`)

  const eventBody = {
    summary: config.summary,
    description: lines.join("\n"),
    start: { dateTime: startDateTime, timeZone: "America/Chicago" },
    end:   { dateTime: endDateTime,   timeZone: "America/Chicago" },
    reminders: {
      useDefault: false,
      overrides: [{ method: "popup", minutes: 0 }],
    },
  }

  return insertCalendarEvent(eventBody, `${config.summary} — ${fullName}`)
}

// ─── New Lead event ───────────────────────────────────────────────────────────

/**
 * Creates a "🔥 NEW LEAD (TEXT ASAP)" Google Calendar event.
 * Starts at current time + 5 minutes, runs for 15 minutes.
 * Includes a popup reminder at event time.
 *
 * @param lead  - Lead data from either the website intake form or CRM manual entry
 * @returns     - The created Google Calendar event ID
 * @throws      - If GOOGLE_CALENDAR_ID is missing or the Calendar API call fails
 */
export async function createNewLeadCalendarEvent(lead: NewLeadEventInput): Promise<string> {
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown Lead"

  // Start: now + 5 minutes. End: start + 15 minutes.
  const startMs = Date.now() + 5 * 60 * 1000
  const endMs   = startMs + 15 * 60 * 1000

  const toISO = (ms: number) => new Date(ms).toISOString()

  const eventBody = {
    summary: "🔥 NEW LEAD (TEXT ASAP)",
    description: buildDescription(lead),
    start: { dateTime: toISO(startMs) },
    end:   { dateTime: toISO(endMs) },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 0 }, // notification at event time
      ],
    },
  }

  console.log(`📅 [new-lead-event] Lead: ${fullName} | Start: ${toISO(startMs)}`)

  return insertCalendarEvent(eventBody, `NEW LEAD — ${fullName}`)
}
