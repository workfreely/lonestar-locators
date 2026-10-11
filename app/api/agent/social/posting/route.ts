export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { requireSocialAgent } from "@/lib/auth/requireSocialAgent"
import { connectionHealth, connectionHealthLabel } from "@/lib/social/connectionHealth"

// GET  → posting state for the agent's own connections
// POST → start or pause posting on them
//
// ── PER ACCOUNT, AND THE ACCOUNTS COME FROM THE SESSION ─────────────────────────────────────
// Pause is already a per-connection fact: social_connections.posting_paused, honoured by the
// publish worker and by the planner's `enabled` test. So this route changes nothing about how
// pausing WORKS — it only lets an agent set it for the connections they actually hold, which are
// resolved from the authenticated user and never read from the request.
//
// ── THE EXISTING RPCs DO THE WRITE ──────────────────────────────────────────────────────────
// sa_pause_destination / sa_resume_destination already exist, are SECURITY DEFINER, and are what
// the admin surface uses. Reusing them means one implementation of "pause a destination" rather
// than a second one that could drift. The id passed to them is taken from the session's list, so
// an agent cannot pause someone else's account by naming it.
//
// ── THE OWNER-LEVEL KILL SWITCH IS NOT TOUCHED ──────────────────────────────────────────────
// social_settings.auto_posting is the admin's global pause for the whole account. It is not read
// or written here. An agent pausing their own destination must never resume the platform, and an
// agent starting theirs must never override the admin having stopped everything.
type Body = { action?: "start" | "pause" }

export async function GET() {
  const guard = await requireSocialAgent()
  if (!guard.ok) return guard.response
  const { supabase, connectionIds } = guard

  const { data, error } = await supabase
    .from("social_connections")
    .select("id, provider, username, status, posting_paused, token_expires_at")
    .in("id", connectionIds)
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 })

  const accounts = ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    connectionId: c.id,
    provider: c.provider,
    username: c.username,
    // DERIVED, never echoed from `status`. That column is written at OAuth time and never
    // revisited, so it says "connected" for a token that expired twelve days ago.
    health: connectionHealth(c as { status?: string | null; token_expires_at?: string | null }),
    healthLabel: connectionHealthLabel(connectionHealth(c as { status?: string | null; token_expires_at?: string | null })),
    posting: c.posting_paused === true ? "Paused" : "Running",
  }))
  return NextResponse.json({ accounts })
}

export async function POST(req: Request) {
  const guard = await requireSocialAgent()
  if (!guard.ok) return guard.response
  const { supabase, connectionIds } = guard

  let body: Body = {}
  try { body = (await req.json()) as Body } catch { /* validated below */ }
  // Exact match only; an unrecognised action is a bad request, never a default. "Start posting to
  // a real audience" is not a safe fallback for a typo.
  if (body.action !== "start" && body.action !== "pause") {
    return NextResponse.json({ error: "bad_action" }, { status: 400 })
  }

  // NOTE the absence of a connectionId parameter. The action applies to the connections the
  // SESSION holds. There is nothing for a caller to name, so there is nothing to forge.
  const rpc = body.action === "pause" ? "sa_pause_destination" : "sa_resume_destination"
  const failed: string[] = []
  for (const id of connectionIds) {
    const { error } = await supabase.rpc(rpc, { p_connection_id: id })
    if (error) failed.push(id)
  }
  if (failed.length === connectionIds.length) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 })
  }

  // Re-read rather than echoing the intent: the response says what the accounts ARE, not what was
  // asked for, so a partial failure cannot be reported as a success.
  const { data } = await supabase
    .from("social_connections")
    .select("id, provider, posting_paused")
    .in("id", connectionIds)
  return NextResponse.json({
    ok: true,
    partial: failed.length > 0 ? failed.length : undefined,
    accounts: ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      connectionId: c.id, provider: c.provider,
      posting: c.posting_paused === true ? "Paused" : "Running",
    })),
  })
}
