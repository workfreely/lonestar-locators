import { google } from "googleapis"
import { getOAuthClient } from "./getOAuthClient"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeadForCalendar {
  id?: string | number | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  crm_status?: string | null
  next_action_date?: string | null  // YYYY-MM-DD
  desired_rent?: string | null
  property_type?: string | null
  credit_score?: string | number | null
  locator_notes?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

// All follow-up events default to 9:00 AM Central Time (SA/Austin/Dallas/Houston markets)
const EVENT_TIMEZONE = "America/Chicago"
const EVENT_START_HOUR = 9   // 9:00 AM
const EVENT_DURATION_MINUTES = 30

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildDescription(lead: LeadForCalendar): string {
  const lines: string[] = []

  if (lead.crm_status)    lines.push(`Stage: ${lead.crm_status}`)
  if (lead.phone)         lines.push(`Phone: ${lead.phone}`)
  if (lead.desired_rent)  lines.push(`Budget: ${lead.desired_rent}`)
  if (lead.property_type) lines.push(`Property Type: ${lead.property_type}`)
  if (lead.credit_score)  lines.push(`Credit: ${lead.credit_score}`)
  if (lead.locator_notes) lines.push(`\nNotes:\n${lead.locator_notes}`)

  return lines.join("\n")
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Creates a Google Calendar follow-up event for the given lead.
 *
 * @param lead  - Lead object containing next_action_date and profile fields
 * @returns     - The Google Calendar event ID of the created event
 * @throws      - If the Calendar API call fails or required fields are missing
 */
export async function syncFollowUpEvent(lead: LeadForCalendar): Promise<string> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) {
    throw new Error("GOOGLE_CALENDAR_ID is not set in environment variables")
  }

  if (!lead.next_action_date) {
    throw new Error(`Lead ${lead.id ?? "unknown"} has no next_action_date — cannot create Calendar event`)
  }

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown Lead"

  // Build ISO datetime strings for the event in Central Time.
  // next_action_date is YYYY-MM-DD — append the start time and let Google
  // interpret it in EVENT_TIMEZONE.
  const startTime = `${lead.next_action_date}T0${EVENT_START_HOUR}:00:00`
  const endHour   = EVENT_START_HOUR + Math.floor(EVENT_DURATION_MINUTES / 60)
  const endMin    = EVENT_DURATION_MINUTES % 60
  const endTime   = `${lead.next_action_date}T${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`

  const eventBody = {
    summary: `📞 Follow Up — ${fullName}`,
    description: buildDescription(lead),
    start: {
      dateTime: startTime,
      timeZone: EVENT_TIMEZONE,
    },
    end: {
      dateTime: endTime,
      timeZone: EVENT_TIMEZONE,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 24 * 60 }, // 1 day before
        { method: "popup", minutes: 60 },       // 1 hour before
      ],
    },
  }

  console.log(`📅 [calendar] Creating follow-up event for "${fullName}" on ${lead.next_action_date}`)

  try {
    const oauth2Client = getOAuthClient()
    const calendar = google.calendar({ version: "v3", auth: oauth2Client })

    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
    })

    const eventId = response.data.id

    if (!eventId) {
      throw new Error("Google Calendar API returned no event ID")
    }

    console.log(`✅ [calendar] Event created — ID: ${eventId} | Lead: ${fullName} | Date: ${lead.next_action_date}`)

    return eventId
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`❌ [calendar] Failed to create event for lead ${lead.id ?? "unknown"} (${fullName}): ${message}`)
    throw new Error(`syncFollowUpEvent failed for lead ${lead.id ?? "unknown"}: ${message}`)
  }
}
