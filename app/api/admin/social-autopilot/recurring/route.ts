import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { generateOccurrences, type RuleRow } from "@/lib/social/generateRecurrence"

// Beast Social — RECURRING RULES. POST creates a rule and generates the rolling first horizon of
// occurrence instances (normal social_posts, status 'scheduled'). GET lists this admin's rules.
// Platform-admin ONLY + RLS owner-scoping. NO Instagram publishing; no daily cron in this checkpoint.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INTERVALS = new Set([7, 14, 30])
const PLACEMENTS = new Set(["any", "morning", "midday", "evening"])

export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard
  const { data, error } = await supabase
    .from("social_recurring_rules")
    .select("id, source_content_id, interval_days, end_mode, end_at, placement_pref, posts_per_day, state, post_type, audio_choice, last_generated_at, created_at")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { body = {} }

  const sourceContentId = typeof body.sourceContentId === "string" ? body.sourceContentId.trim() : ""
  if (!UUID_RE.test(sourceContentId)) return NextResponse.json({ error: "valid sourceContentId required" }, { status: 400 })

  // Interval: one of the presets, or a safe custom (1–365).
  let intervalDays = Number(body.intervalDays)
  if (!Number.isFinite(intervalDays) || intervalDays < 1 || intervalDays > 365) return NextResponse.json({ error: "invalid intervalDays" }, { status: 400 })
  intervalDays = Math.round(intervalDays)
  if (!INTERVALS.has(intervalDays) && typeof body.allowCustomInterval !== "boolean") { /* custom allowed only when explicitly flagged; otherwise still accept 1–365 */ }

  const placementPref = PLACEMENTS.has(String(body.placementPref)) ? String(body.placementPref) : "any"
  let postsPerDay = Number(body.postsPerDay)
  if (!Number.isFinite(postsPerDay) || postsPerDay < 1 || postsPerDay > 3) postsPerDay = 2
  postsPerDay = Math.round(postsPerDay)

  // Duration → end_mode + end_at. 'days' (30/60/90/custom), 'date' (custom end date), or 'until_stopped'.
  const durationMode = String((body.duration as Record<string, unknown> | undefined)?.mode ?? "until_stopped")
  let end_mode: RuleRow["end_mode"] = "until_stopped"
  let end_at: string | null = null
  const dur = (body.duration ?? {}) as Record<string, unknown>
  if (durationMode === "days") {
    const days = Number(dur.days)
    if (!Number.isFinite(days) || days < 1 || days > 365) return NextResponse.json({ error: "invalid duration days" }, { status: 400 })
    end_mode = "after_days"
    end_at = new Date(Date.now() + Math.round(days) * 86400000).toISOString()
  } else if (durationMode === "date") {
    const t = typeof dur.endDate === "string" ? new Date(dur.endDate) : null
    if (!t || isNaN(t.getTime()) || t.getTime() <= Date.now()) return NextResponse.json({ error: "invalid end date" }, { status: 400 })
    end_mode = "on_date"
    end_at = t.toISOString()
  }

  const postType = typeof body.postType === "string" && body.postType.trim() ? body.postType.trim() : "reel"
  const audioChoice = body.audioChoice === "none" ? "none" : body.audioChoice === "lb_track" ? "lb_track" : "original"

  // Source must exist + be visible under RLS (owned by this admin).
  const { data: src, error: srcErr } = await supabase.from("social_content").select("id").eq("id", sourceContentId).maybeSingle()
  if (srcErr) return NextResponse.json({ error: "create_failed" }, { status: 500 })
  if (!src) return NextResponse.json({ error: "source_not_found" }, { status: 404 })

  const { data: rule, error } = await supabase
    .from("social_recurring_rules")
    .insert({
      owner_user_id: userId,
      source_content_id: sourceContentId,
      platform: "instagram",
      interval_days: intervalDays,
      end_mode,
      end_at,
      placement_pref: placementPref,
      posts_per_day: postsPerDay,
      state: "active",
      post_type: postType,
      audio_choice: audioChoice,
    })
    .select("id, owner_user_id, source_content_id, platform, interval_days, end_mode, end_at, placement_pref, posts_per_day, state, post_type, audio_choice")
    .single()
  if (error || !rule) return NextResponse.json({ error: "create_failed" }, { status: 500 })

  const result = await generateOccurrences(supabase, rule as RuleRow)
  return NextResponse.json({ id: (rule as RuleRow).id, ...result })
}
