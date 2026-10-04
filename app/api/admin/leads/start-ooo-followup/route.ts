export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { supabaseAdmin } from "@/lib/supabase/admin"

/**
 * START FOLLOW-UP for a lead that arrived while the locator was Out of Office.
 *
 * The locator is back and has deliberately chosen this lead. That explicit intent
 * is the whole justification for this route existing: it creates the new_lead run
 * the automatic path refused to create.
 *
 * ── WHY THIS CANNOT BE "CLEAR A FLAG AND LET THE ENGINE NOTICE" ─────────────
 * lifecycleSeed's new_lead branch ALSO enforces NEW_LEAD_ENROLL_WINDOW_MS (6h),
 * because Text 1 names the form the client just submitted. An OOO lead is days
 * old by the time anyone returns, so clearing the hold would silently do nothing
 * — the worst failure available, because it looks like it worked. This route
 * therefore seeds the run DIRECTLY, and the five preconditions below are what
 * replace the window as the protection.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * No new sequence family, no new template key, no bypass of the gate, the
 * outbound intent, the claim, the Mac send or the ACK. It creates one ordinary
 * new_lead/t1 run and steps aside; everything after is the existing engine, and
 * advanceRun schedules t2 at the usual 30–45s once t1 is acknowledged.
 *
 * It never touches ooo_held_at (permanent arrival history), never changes
 * crm_status, and never reads or writes another lead.
 */
export async function POST(req: NextRequest) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response

  let leadId: number | string | undefined
  try {
    leadId = (await req.json())?.leadId
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const leadIdNum = Number(leadId)
  if (!Number.isFinite(leadIdNum)) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 })
  }

  // OWNERSHIP via the CALLER'S session, not the service role: the RLS-scoped read
  // returns nothing for another workspace's lead, so a bad id and a foreign lead
  // are indistinguishable from outside — both 404.
  const { data: owned } = await guard.supabase
    .from("leads")
    .select("id, crm_status, ooo_held_at, ooo_released_at")
    .eq("id", leadIdNum)
    .maybeSingle()
  if (!owned) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

  const lead = owned as {
    id: number
    crm_status: string | null
    ooo_held_at: string | null
    ooo_released_at: string | null
  }

  // Only a lead that was actually held. Without this the route would be a generic
  // "send this client the opening texts now" button, which is a different and far
  // more dangerous thing than the one being built.
  if (!lead.ooo_held_at) {
    return NextResponse.json({ error: "Lead was not held for Out of Office" }, { status: 400 })
  }
  // Still at the stage the new_lead opening belongs to. A lead the locator already
  // contacted must not receive "I'm back in the office and following up".
  if ((lead.crm_status ?? "").toLowerCase() !== "new") {
    return NextResponse.json({ error: "Lead is no longer New" }, { status: 400 })
  }

  // ── IDEMPOTENCY ────────────────────────────────────────────────────────────
  // Already released → success, not an error. A double click, a retried request
  // and a stale open tab must all be harmless.
  if (lead.ooo_released_at) {
    return NextResponse.json({ ok: true, alreadyStarted: true, reason: "already_released" })
  }
  // An active lifecycle run means the engine is already working this lead; a
  // second run would violate lead_followup_runs_one_active_lifecycle anyway, but
  // failing softly here keeps the UI honest.
  const { data: active } = await supabaseAdmin
    .from("lead_followup_runs")
    .select("id")
    .eq("lead_id", leadIdNum)
    .is("session_date", null)
    .in("status", ["waiting", "due"])
    .maybeSingle()
  if (active) {
    return NextResponse.json({ ok: true, alreadyStarted: true, reason: "active_run_exists" })
  }

  // ── RUN FIRST, STAMP SECOND ────────────────────────────────────────────────
  // Order is deliberate. If the stamp fails after the run exists, the button
  // still shows but a second click is refused by the active-run check above, so
  // nothing double-sends. Stamping first and then failing the insert would leave
  // a lead that LOOKS started, with no run and no visible action — permanently
  // stuck. Of the two failure modes, only this one is recoverable.
  const nowIso = new Date().toISOString()
  const { error: runErr } = await supabaseAdmin.from("lead_followup_runs").insert([{
    lead_id: leadIdNum,
    workspace_id: guard.workspaceId,
    owner_user_id: guard.userId,
    mode: "auto",
    status: "waiting",
    sequence_key: "new_lead",
    step_key: "t1",
    step_index: 0,
    sequence_version: 1,
    session_date: null,
    next_eligible_at: nowIso,
  }])
  if (runErr) {
    // 23505 = the one-active-lifecycle unique index. A concurrent click won the
    // race; the lead is started, which is the caller's desired end state.
    if ((runErr as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: true, alreadyStarted: true, reason: "concurrent_start" })
    }
    console.error("[start-ooo-followup] run insert failed:", runErr.message)
    return NextResponse.json({ error: "Could not start follow-up" }, { status: 500 })
  }

  // ooo_held_at is NEVER written here — it is permanent arrival history.
  const { error: stampErr } = await supabaseAdmin
    .from("leads")
    .update({ ooo_released_at: nowIso })
    .eq("id", leadIdNum)
  if (stampErr) {
    // The run exists, so follow-up WILL proceed. Report success and let the next
    // click no-op on the active-run check rather than implying nothing happened.
    console.error("[start-ooo-followup] released stamp failed:", stampErr.message)
  }

  return NextResponse.json({ ok: true, alreadyStarted: false, releasedAt: nowIso })
}
