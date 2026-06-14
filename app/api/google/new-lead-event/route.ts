import { NextResponse } from "next/server"
import { createNewLeadCalendarEvent } from "@/lib/google/createCalendarEvent"

/**
 * POST /api/google/new-lead-event
 *
 * Called fire-and-forget after a new lead is inserted into Supabase.
 * Creates a "🔥 NEW LEAD — CONTACT ASAP" Google Calendar event.
 *
 * Accepts both camelCase (LandingForm) and snake_case (LeadFormModal)
 * field names so either client can call this without transformation.
 *
 * Body fields (all optional except at least a name or phone):
 *   first_name / firstName
 *   last_name  / lastName
 *   phone
 *   city
 *   source
 *   desired_rent / desiredRent
 *   beds
 *   move_date / moveDate
 *   credit_score / creditScore
 */
export async function POST(req: Request) {
  console.log("📥 New lead calendar request received")

  try {
    const body = await req.json()
    console.log("📥 [new-lead-event] Raw request body:", JSON.stringify(body, null, 2))

    // Normalize camelCase (LandingForm) → snake_case (shared type)
    const lead = {
      first_name:   body.first_name   ?? body.firstName   ?? null,
      last_name:    body.last_name    ?? body.lastName     ?? null,
      phone:        body.phone                             ?? null,
      city:         body.city                              ?? null,
      source:       body.source                            ?? null,
      desired_rent: body.desired_rent ?? body.desiredRent  ?? null,
      beds:         body.beds                              ?? null,
      move_date:    body.move_date    ?? body.moveDate     ?? null,
      credit_score: body.credit_score ?? body.creditScore  ?? null,
    }

    console.log("📥 [new-lead-event] Normalized lead object:", JSON.stringify(lead, null, 2))
    console.log("📥 [new-lead-event] Calling createNewLeadCalendarEvent()...")

    const eventId = await createNewLeadCalendarEvent(lead)

    console.log("📥 [new-lead-event] createNewLeadCalendarEvent() returned eventId:", eventId)

    return NextResponse.json({ success: true, eventId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack   = err instanceof Error ? err.stack   : undefined
    console.error("❌ [/api/google/new-lead-event] Error:", message)
    if (stack) console.error("❌ [/api/google/new-lead-event] Stack:", stack)
    // Always return 200 — caller is fire-and-forget, lead creation must not be blocked
    return NextResponse.json({ success: false, error: message }, { status: 200 })
  }
}
