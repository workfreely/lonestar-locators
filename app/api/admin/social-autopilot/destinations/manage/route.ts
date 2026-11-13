export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { SOCIAL_MARKETS } from "@/lib/social/markets"

// Connection-ID-scoped destination management. Platform-admin ONLY. Every action targets ONE
// connection by id and the underlying RPC verifies the connection belongs to the caller, so
// operating on one destination can never affect another. Disconnect revokes ONLY that
// destination's Vault token.
//
// POST body: { connectionId: string, action: "pause"|"resume"|"disconnect"|"label"|"cadence"|"markets",
//              label?: string, postsPerDay?: number, staggerOffsetMinutes?: number,
//              markets?: string[] | null }
type Body = {
  connectionId?: unknown
  action?: unknown
  label?: unknown
  postsPerDay?: unknown
  staggerOffsetMinutes?: unknown
  markets?: unknown
}

const ACTIONS = new Set(["pause", "resume", "disconnect", "label", "cadence", "markets"])

/**
 * Resolve the submitted market labels to their CANONICAL spellings, or report which ones are not
 * markets at all.
 *
 * Validated against SOCIAL_MARKETS rather than accepted as free text, because a label that
 * matches no content silently empties the destination's pool: the planner would leave every slot
 * unfilled and the account would simply stop posting with nothing to point at. A typo is caught
 * here, where it can be shown to the operator, rather than becoming a mystery three days later.
 *
 * Matching ignores case so "dallas" is accepted, but the CANONICAL spelling is what gets stored —
 * markets live in the database verbatim, and two spellings of one market would be two markets.
 * Dallas and DFW are distinct entries in that list and are never merged into each other.
 */
function canonicalMarkets(raw: unknown): { ok: true; markets: string[] | null } | { ok: false; unknown: string[] } {
  // null / absent / an empty list all CLEAR the restriction. "Unrestricted" has to be expressible,
  // and this is the one action that can express it. A bare string is accepted as a one-market list,
  // matching parseMarketRestriction's own tolerance — the two must agree about what a caller may
  // send, or a body this route accepts could be read differently by the thing enforcing it.
  const list = Array.isArray(raw) ? raw
    : typeof raw === "string" ? [raw]
    : raw === null || raw === undefined ? []
    : null
  if (!list) return { ok: false, unknown: [] }
  const wanted = [...new Set(
    list.filter((m): m is string => typeof m === "string").map((m) => m.trim()).filter(Boolean),
  )]
  if (wanted.length === 0) return { ok: true, markets: null }
  const resolved: string[] = []
  const unknown: string[] = []
  for (const w of wanted) {
    const hit = SOCIAL_MARKETS.find((m) => m.toLowerCase() === w.toLowerCase())
    if (hit) resolved.push(hit)
    else unknown.push(w)
  }
  if (unknown.length) return { ok: false, unknown }
  return { ok: true, markets: [...new Set(resolved)].sort() }
}

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
  } else if (action === "markets") {
    const parsed = canonicalMarkets(body.markets)
    if (!parsed.ok) {
      // 400, not 403: the caller is permitted, the VALUE is wrong. Naming the offending labels is
      // the difference between a fixable mistake and a silent restriction nothing matches.
      return NextResponse.json(
        { error: "unknown_market", unknown: parsed.unknown, allowed: SOCIAL_MARKETS },
        { status: 400 },
      )
    }
    ;({ error } = await supabase.rpc("sa_update_destination_markets", {
      p_connection_id: connectionId,
      p_markets: parsed.markets,
    }))
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
