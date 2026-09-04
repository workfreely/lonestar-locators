export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getOAuthClientForWorkspace } from "@/lib/google/getOAuthClientForUser"
import { upsertFollowUpCalendarEvent, isFollowUpActionKey } from "@/lib/google/createCalendarEvent"

// B3 Phase 1 — Follow-Up Calendar sync (Locator Beast, per-agent).
//
// Called by the CRM after a canonical follow-up action is created, advanced, or
// rescheduled. It creates (or updates, by the stored google_event_id) the event
// in the OWNING agent's own primary Google Calendar and persists the event id
// back on the action row.
//
// Auth model: session-authed + workspace-scoped via requireWorkspaceMember. The
// ONLY client input is `actionId`; the workspace and the owning agent are
// resolved ENTIRELY server-side (never from the body), and the action's lead is
// verified to belong to the caller's workspace — so a client can never sync
// another tenant's action or target another account's calendar.
//
// Best-effort: no connected/valid Google credential, or any Google error, is
// skipped (200) — it never blocks or fails CRM/workflow behavior.
export async function POST(req: Request) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  const { workspaceId } = guard

  let actionId: number | string | null = null
  try {
    const body = (await req.json()) as { actionId?: number | string }
    actionId = body?.actionId ?? null
  } catch {
    /* handled below */
  }
  if (actionId == null) {
    return NextResponse.json({ ok: false, error: "actionId required" }, { status: 400 })
  }

  // Load the action (service role — RLS doesn't gate service-role reads, so the
  // workspace check below is the real guard).
  const { data: action } = await supabaseAdmin
    .from("lead_next_actions")
    .select("id, lead_id, action_key, title, due_at, status, google_event_id")
    .eq("id", actionId)
    .maybeSingle()
  if (!action) return NextResponse.json({ ok: true, skipped: "action not found" })

  // Only canonical follow-up actions get a calendar event.
  if (!isFollowUpActionKey(action.action_key)) {
    return NextResponse.json({ ok: true, skipped: "not a follow-up action" })
  }

  // IDOR guard — the action's lead MUST belong to the caller's own workspace.
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, workspace_id, first_name, last_name, phone, city, source, desired_rent, beds, move_date")
    .eq("id", action.lead_id)
    .maybeSingle()
  if (!lead || lead.workspace_id !== workspaceId) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 })
  }

  try {
    // OWNING agent's Google client (workspace.created_by, server-resolved).
    const client = await getOAuthClientForWorkspace(workspaceId, { verify: false })
    if (!client) return NextResponse.json({ ok: true, skipped: "google not connected" })

    const eventId = await upsertFollowUpCalendarEvent({
      client,
      existingEventId: action.google_event_id,
      actionKey: action.action_key as string,
      actionTitle: (action.title as string) ?? "Follow-Up",
      dueAt: action.due_at as string,
      lead: {
        first_name: lead.first_name,
        last_name: lead.last_name,
        phone: lead.phone,
        city: lead.city,
        source: lead.source,
        desired_rent: lead.desired_rent,
        beds: lead.beds,
        move_date: lead.move_date,
      },
    })

    if (eventId && eventId !== action.google_event_id) {
      const { error } = await supabaseAdmin
        .from("lead_next_actions")
        .update({ google_event_id: eventId })
        .eq("id", action.id)
      if (error) console.warn(`[followup-calendar] failed to persist google_event_id for action ${action.id}`)
    }
    return NextResponse.json({ ok: true, synced: true })
  } catch (e: unknown) {
    const code =
      (e as { response?: { data?: { error?: { message?: string } } | { error?: string } } })?.response?.data ??
      (e as { code?: string })?.code ??
      "error"
    // Non-PII: action id + error class only; never tokens, emails, or client data.
    console.warn(`[followup-calendar] sync skipped for action ${action.id} (${typeof code === "string" ? code : "google_error"})`)
    return NextResponse.json({ ok: true, skipped: "google error" })
  }
}
