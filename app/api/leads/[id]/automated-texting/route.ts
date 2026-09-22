import { NextRequest, NextResponse } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"
import { supabaseAdmin } from "@/lib/supabase/admin"

// Per-lead Automated Texting enrollment — the ONE normal application writer of
// leads.followup_opt_in (direct client PostgREST UPDATE of that column is revoked;
// only the service role can flip it, which is what this route does).
//
// SERVER AUTHORITATIVE, dual gate. The controlling locator is the CALLER as an
// ACTIVE MEMBER of the LEAD'S WORKSPACE — NOT lead.owner_user_id (unreliable: some
// leads have a NULL owner from service-role inserts), and NEVER a phone number.
// A flip requires: authenticated user + active workspace membership (billing) +
// the caller's ACCOUNT is Automated-Texting authorized + the lead is in that
// workspace. Any failure → refused; nothing is written.
//
// INERT: this only sets the enrollment flag. No dispatcher, no run/intent, no
// send — the flag simply gates a future dispatcher (which also re-checks BOTH
// account authorization and this per-lead enrollment).

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  const { userId, workspaceId, supabase } = guard
  const { id } = await ctx.params

  let body: { enabled?: unknown } | null = null
  try {
    body = (await req.json()) as { enabled?: unknown }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }
  const enabled = body?.enabled === true

  // ACCOUNT authorization — the caller's OWN account (never owner_user_id/phone),
  // resolved live so a revoked account is refused immediately.
  const { data: authorized } = await supabase.rpc("is_automated_texting_authorized", { p_user_id: userId })
  if (authorized !== true) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 })
  }

  // The lead must belong to the caller's workspace (canonical ownership boundary).
  const { data: lead } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Flip via the service role (followup_opt_in UPDATE is revoked from clients).
  const { error } = await supabaseAdmin
    .from("leads")
    .update({ followup_opt_in: enabled })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
  if (error) {
    console.error("[automated-texting] update failed:", error.message)
    return NextResponse.json({ error: "update_failed" }, { status: 500 })
  }

  // Best-effort audit — never blocks the response, never logs sensitive data.
  try {
    await supabaseAdmin.from("security_events").insert({
      user_id: userId,
      workspace_id: workspaceId,
      event_type: "automation_enrollment",
      metadata: { lead_id: String(id), enabled },
    })
  } catch (e) {
    console.error("[automated-texting] audit failed:", e instanceof Error ? e.message : "unknown")
  }

  return NextResponse.json({ ok: true, enabled })
}

// Read the caller's authorization + this lead's enrollment (for the UI control).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  const { userId, workspaceId, supabase } = guard
  const { id } = await ctx.params
  const { data: authorized } = await supabase.rpc("is_automated_texting_authorized", { p_user_id: userId })
  const { data: lead } = await supabase
    .from("leads")
    .select("followup_opt_in")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  return NextResponse.json({
    accountAuthorized: authorized === true,
    enrolled: lead?.followup_opt_in === true,
  })
}
