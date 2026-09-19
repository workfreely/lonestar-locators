export const runtime = "nodejs"

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildPublishPreview } from "@/lib/social/dryRun"

// POST /posts/[id]/dry-run — SAFE DRY RUN (no publish).
//
// Returns the EXACT final Instagram caption/hashtags payload + a signed URL to the FINAL rendered
// MP4 — everything production would send — running every composition step UP TO but NEVER INCLUDING
// the external publish. This route imports ONLY buildPublishPreview; it does NOT import
// createReelContainer / publishReelContainer / media_publish (lib/social/instagram), so there is no
// callable path from here to any external Instagram publishing operation (fail-closed). It performs
// no mutation and never touches the destination access token.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const r = await buildPublishPreview({ supabase, supabaseAdmin, postId: id })
  if (!r.ok) return NextResponse.json({ error: r.error, reason: r.reason }, { status: r.status })
  return NextResponse.json({ dryRun: true, published: false, ...r.preview })
}
