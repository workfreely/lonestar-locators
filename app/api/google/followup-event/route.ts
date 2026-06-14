import { NextResponse } from "next/server"
import { createFollowUpCalendarEvent } from "@/lib/google/createCalendarEvent"

/**
 * POST /api/google/followup-event
 *
 * Called fire-and-forget from LeadPanel after a follow-up step is completed.
 * Creates the next Calendar reminder in the FU chain (FU2 / FU3 / Final FU).
 *
 * Body:
 *   completed_step  — the follow_up_count that was JUST set (1, 2, or 3)
 *   first_name      — lead first name
 *   last_name       — lead last name
 *   phone           — lead phone
 *   city            — lead city
 *   source          — lead source
 *   desired_rent    — lead budget
 *   beds            — lead beds
 *   move_date       — lead move date (YYYY-MM-DD)
 *
 * Always returns HTTP 200 so fire-and-forget callers are never blocked.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()

    const { completed_step, ...lead } = body

    if (typeof completed_step !== "number") {
      console.warn("⚠️  [followup-event] Missing or invalid completed_step:", completed_step)
      return NextResponse.json({ success: false, error: "Missing completed_step" }, { status: 200 })
    }

    console.log(`📋 [followup-event] Received FU chain request — completedStep: ${completed_step} | Lead: ${lead.first_name} ${lead.last_name}`)

    const eventId = await createFollowUpCalendarEvent(
      {
        first_name:   lead.first_name   ?? null,
        last_name:    lead.last_name    ?? null,
        phone:        lead.phone        ?? null,
        city:         lead.city         ?? null,
        source:       lead.source       ?? null,
        desired_rent: lead.desired_rent ?? null,
        beds:         lead.beds         ?? null,
        move_date:    lead.move_date    ?? null,
      },
      completed_step
    )

    return NextResponse.json({ success: true, eventId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("❌ [followup-event] Error:", message)
    // Always 200 — CRM workflow must never be blocked by a Calendar failure
    return NextResponse.json({ success: false, error: message }, { status: 200 })
  }
}
