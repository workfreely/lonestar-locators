import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// Beast Social — recurring rule state control. PATCH sets Active / Paused / Stopped.
//  - Paused / Stopped stop generation of NEW occurrences.
//  - Already-generated future (unpublished) instances are PRESERVED (never implicitly deleted);
//    published history is always left frozen. Platform-admin ONLY + RLS owner-scoping.
const STATES = new Set(["active", "paused", "stopped"])

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { body = {} }
  const state = String(body.state)
  if (!STATES.has(state)) return NextResponse.json({ error: "invalid state" }, { status: 400 })

  const { data, error } = await supabase
    .from("social_recurring_rules")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, state")
    .maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json(data)
}
