export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { readAutoPosting, normalizeAutoPosting } from "@/lib/social/autoPosting"

/**
 * SOCIAL BEAST — the master Auto Posting switch.
 *
 * GET  reports the current state (and the resume stamp, which is what makes the backlog rule work).
 * POST sets it, through the SECURITY DEFINER RPC that owns the state transition — the route never
 *      writes the columns itself, because setting 'on' without stamping the resume time would make
 *      every post missed during the pause eligible again.
 *
 * This governs INSTAGRAM automatic publishing only. TikTok has its own route, its own credentials
 * and its own explicit per-post confirmation; nothing here can start a TikTok post.
 */
export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const s = await readAutoPosting(guard.supabase, guard.userId)
  return NextResponse.json({
    autoPosting: s.state,
    resumedAt: s.resumedAt,
    // Surfaced rather than hidden: "paused because we could not read the setting" is a different
    // thing to tell an operator than "paused because you paused it".
    unreadable: s.unreadable ?? false,
  })
}

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response

  let body: Record<string, unknown>
  try {
    body = (await req.json()) ?? {}
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // Only the two real states are accepted; anything else is a 400 rather than being coerced,
  // because silently reading a typo as "paused" would look like the switch ignored the click.
  const next = body.autoPosting
  if (next !== "on" && next !== "paused") {
    return NextResponse.json({ error: "autoPosting must be 'on' or 'paused'" }, { status: 400 })
  }

  const { data, error } = await guard.supabase.rpc("sa_set_auto_posting", { p_state: next })
  if (error) {
    console.error("[auto-posting] set failed:", error.message)
    return NextResponse.json({ error: "Could not update Auto Posting" }, { status: 500 })
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { auto_posting?: unknown; auto_posting_resumed_at?: unknown }
    | null
  // The RPC returns the stored row; report THAT, never the requested value — a write that landed
  // on zero rows must not be echoed back as success.
  if (!row) {
    console.error("[auto-posting] set returned no row")
    return NextResponse.json({ error: "Could not update Auto Posting" }, { status: 500 })
  }
  return NextResponse.json({
    autoPosting: normalizeAutoPosting(row.auto_posting),
    resumedAt: typeof row.auto_posting_resumed_at === "string" ? row.auto_posting_resumed_at : null,
  })
}
