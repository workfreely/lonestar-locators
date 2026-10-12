export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { thumbStoragePath } from "@/lib/social/libraryThumb"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST → record that this source's INTERNAL library thumbnail exists.
//
// It takes NO path. The path is derived here from the authenticated admin's own id and the row
// id in the URL, so this endpoint cannot be used to point thumb_storage_path at a source video,
// at someone else's object, or at an Instagram/TikTok cover. It also refuses unless the object is
// actually in storage, so the column never claims a thumbnail that isn't there.
//
// It writes exactly one column on exactly one row, and touches nothing else: not the original
// video, not social_posts, not cover_storage_path, not publishing state.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 })

  const path = thumbStoragePath(userId, id)

  // Confirm the object is really there before recording it. Storage list is scoped to the
  // row's own folder, so this cannot enumerate anything else.
  const { data: listed, error: listErr } = await supabase.storage
    .from("social-media")
    .list(`${userId}/${id}`, { search: "thumb.jpg", limit: 1 })
  if (listErr) return NextResponse.json({ error: "storage_unavailable" }, { status: 502 })
  if (!listed?.some((o) => o.name === "thumb.jpg")) {
    return NextResponse.json({ error: "thumbnail_not_found" }, { status: 404 })
  }

  // RLS scopes this to the admin's own rows; owner_user_id is matched explicitly as well so a
  // row belonging to someone else cannot be updated even if a policy is loosened later.
  const { data, error } = await supabase
    .from("social_content")
    .update({ thumb_storage_path: path })
    .eq("id", id)
    .eq("owner_user_id", userId)
    .select("id")
    .maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  return NextResponse.json({ ok: true })
}
