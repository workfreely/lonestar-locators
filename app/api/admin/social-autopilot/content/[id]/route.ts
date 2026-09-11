import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// PATCH /api/admin/social-autopilot/content/:id → edit internal property metadata.
// DELETE → remove the source video (storage object + row). Platform-admin ONLY; RLS
// additionally scopes to the owner, so a non-admin (or another admin) matches no row.
const EDITABLE = ["propertyName", "market", "special", "budgetRange", "amenities", "notes", "placeId"] as const
const COLUMN: Record<(typeof EDITABLE)[number], string> = {
  propertyName: "property_name",
  market: "market",
  special: "special",
  budgetRange: "budget_range",
  amenities: "amenities",
  notes: "notes",
  placeId: "place_id",
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of EDITABLE) {
    if (k in body) {
      const v = body[k]
      patch[COLUMN[k]] = typeof v === "string" && v.trim() ? v.trim().slice(0, 5000) : null
    }
  }

  const { data, error } = await supabase
    .from("social_content")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 }) // wrong owner / missing

  return NextResponse.json({ id: (data as { id: string }).id })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Resolve the row (RLS scopes to the owner) to get the storage path before deleting.
  const { data: row, error: readErr } = await supabase
    .from("social_content")
    .select("id, storage_path")
    .eq("id", id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: "delete_failed" }, { status: 500 })
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const path = (row as { storage_path?: string }).storage_path
  if (path) {
    const { error: rmErr } = await supabase.storage.from("social-media").remove([path])
    if (rmErr) console.error("[social-autopilot] storage remove failed:", rmErr.message)
  }

  const { error: delErr } = await supabase.from("social_content").delete().eq("id", id)
  if (delErr) return NextResponse.json({ error: "delete_failed" }, { status: 500 })

  return NextResponse.json({ ok: true })
}
