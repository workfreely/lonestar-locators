export const runtime = "nodejs"
export const maxDuration = 300 // FFmpeg render window (Vercel Fluid / Pro)

import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { renderPostToStorage } from "@/lib/social/renderPost"

// Interactive single-post render. A THIN WRAPPER over renderPostToStorage, which is the one render
// implementation — the queue worker calls exactly the same function, so an interactive render and a
// bulk render can never produce different output.
//
// The render itself, the overlay, the templates and the post-state transitions all moved verbatim
// into that module; nothing about them changed here.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const result = await renderPostToStorage({ supabase, id, userId })
  if (result.ok) return NextResponse.json({ status: "ready", renderVersion: result.renderVersion })

  const httpStatus = result.code === "not_found" ? 404
    : result.code === "missing_source" ? 400
    : 500
  return NextResponse.json({ status: "error", error: result.code === "render_failed" ? "render_failed" : result.code }, { status: httpStatus })
}
