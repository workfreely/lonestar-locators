export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// Connection-ID-scoped destination management. Platform-admin ONLY. Every action targets ONE
// connection by id and the underlying RPC verifies the connection belongs to the caller, so
// operating on one destination can never affect another. Disconnect revokes ONLY that
// destination's Vault token.
//
// POST body: { connectionId: string, action: "pause"|"resume"|"disconnect"|"label"|"cadence",
//              label?: string, postsPerDay?: number, staggerOffsetMinutes?: number }
type Body = {
  connectionId?: unknown
  action?: unknown
  label?: unknown
  postsPerDay?: unknown
  staggerOffsetMinutes?: unknown
}

const ACTIONS = new Set(["pause", "resume", "disconnect", "label", "cadence"])

export async function POST(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  let body: Body = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const connectionId = typeof body.connectionId === "string" ? body.connectionId : ""
  const action = typeof body.action === "string" ? body.action : ""
  if (!connectionId || !ACTIONS.has(action)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  let error: { message: string } | null = null
  if (action === "pause") {
    ;({ error } = await supabase.rpc("sa_pause_destination", { p_connection_id: connectionId }))
  } else if (action === "resume") {
    ;({ error } = await supabase.rpc("sa_resume_destination", { p_connection_id: connectionId }))
  } else if (action === "disconnect") {
    ;({ error } = await supabase.rpc("sa_disconnect_destination", { p_connection_id: connectionId }))
  } else if (action === "label") {
    const label = typeof body.label === "string" ? body.label.slice(0, 120) : null
    ;({ error } = await supabase.rpc("sa_update_destination_label", { p_connection_id: connectionId, p_label: label }))
  } else if (action === "cadence") {
    const postsPerDay = typeof body.postsPerDay === "number" ? Math.trunc(body.postsPerDay) : null
    const stagger = typeof body.staggerOffsetMinutes === "number" ? Math.trunc(body.staggerOffsetMinutes) : null
    ;({ error } = await supabase.rpc("sa_update_destination_cadence", {
      p_connection_id: connectionId,
      p_posts_per_day: postsPerDay,
      p_stagger_offset_minutes: stagger,
    }))
  }

  if (error) {
    // Ownership / not-found errors are raised inside the RPC; surface as 403 without leaking detail.
    return NextResponse.json({ error: "not_permitted" }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}
