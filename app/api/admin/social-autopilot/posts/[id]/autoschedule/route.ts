import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { nextOpenSlotISO } from "@/lib/social/generateRecurrence"

// POST /posts/[id]/autoschedule — Post Once AUTO-PLACEMENT. Social Beast picks the next OPEN approved
// slot (Morning/Afternoon/Evening, America/Chicago) respecting the daily goal + existing scheduled
// posts (manual posts always win), deterministically. Sets scheduled_at + status='scheduled' on the
// post. Platform-admin + RLS owner-scoped. NO Instagram publishing.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Confirm the post exists and is visible to this admin (RLS).
  const { data: post, error: readErr } = await supabase.from("social_posts").select("id, status").eq("id", id).maybeSingle()
  if (readErr) return NextResponse.json({ error: "schedule_failed" }, { status: 500 })
  if (!post) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const scheduledAt = await nextOpenSlotISO(supabase, userId)
  if (!scheduledAt) return NextResponse.json({ error: "no_slot" }, { status: 409 })

  const { error } = await supabase
    .from("social_posts")
    .update({ scheduled_at: scheduledAt, status: "scheduled", updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return NextResponse.json({ error: "schedule_failed" }, { status: 500 })
  return NextResponse.json({ scheduledAt })
}
