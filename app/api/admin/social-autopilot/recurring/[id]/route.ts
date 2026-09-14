import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { generateOccurrences, type RuleRow } from "@/lib/social/generateRecurrence"

// Social Beast — recurring rule control. PATCH handles TWO intents on an existing rule:
//  1) STATE change (state: active | paused | stopped). Paused/Stopped stop generation of NEW
//     occurrences; already-generated future instances are PRESERVED (never implicitly deleted) and
//     published history is always frozen.
//  2) EDIT the rule's settings (intervalDays, placementPref, duration). This reuses the SAME
//     recurrence backend: it updates the stored rule and re-runs generateOccurrences (idempotent —
//     only fills missing occurrences, never moves existing ones). Platform-admin + RLS owner-scoping.
const STATES = new Set(["active", "paused", "stopped"])
const PLACEMENTS = new Set(["any", "morning", "midday", "evening"])

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { body = {} }

  // ── State-only change ────────────────────────────────────────────────────────────────────────
  if ("state" in body && !("intervalDays" in body) && !("placementPref" in body) && !("duration" in body)) {
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

  // ── Edit rule settings (interval / placement / duration) ────────────────────────────────────
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("intervalDays" in body) {
    const n = Math.round(Number(body.intervalDays))
    if (!Number.isFinite(n) || n < 1 || n > 365) return NextResponse.json({ error: "invalid intervalDays" }, { status: 400 })
    patch.interval_days = n
  }
  if ("placementPref" in body) {
    patch.placement_pref = PLACEMENTS.has(String(body.placementPref)) ? String(body.placementPref) : "any"
  }
  if ("duration" in body && body.duration && typeof body.duration === "object") {
    const dur = body.duration as Record<string, unknown>
    const mode = String(dur.mode ?? "until_stopped")
    if (mode === "days") {
      const days = Number(dur.days)
      if (!Number.isFinite(days) || days < 1 || days > 365) return NextResponse.json({ error: "invalid duration days" }, { status: 400 })
      patch.end_mode = "after_days"
      patch.end_at = new Date(Date.now() + Math.round(days) * 86400000).toISOString()
    } else if (mode === "date") {
      const t = typeof dur.endDate === "string" ? new Date(dur.endDate) : null
      if (!t || isNaN(t.getTime()) || t.getTime() <= Date.now()) return NextResponse.json({ error: "invalid end date" }, { status: 400 })
      patch.end_mode = "on_date"
      patch.end_at = t.toISOString()
    } else {
      patch.end_mode = "until_stopped"
      patch.end_at = null
    }
  }

  const { data: rule, error } = await supabase
    .from("social_recurring_rules")
    .update(patch)
    .eq("id", id)
    .select("id, owner_user_id, source_content_id, platform, interval_days, end_mode, end_at, placement_pref, posts_per_day, state, post_type, audio_choice")
    .maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!rule) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Reflect the new settings forward (idempotent — never moves existing occurrences).
  const result = await generateOccurrences(supabase, rule as RuleRow)
  return NextResponse.json({ id: (rule as RuleRow).id, state: (rule as RuleRow).state, ...result })
}
