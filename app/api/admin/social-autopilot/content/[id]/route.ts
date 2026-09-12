import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { buildSocialDisplayName } from "@/lib/social/displayName"

// PATCH /api/admin/social-autopilot/content/:id → edit internal metadata / display name.
// DELETE → remove the source video (storage object + row). Platform-admin ONLY; RLS
// additionally scopes to the owner, so another user's row matches nothing.
//
// Naming rule: a manual `displayName` edit sets name_customized=true and is never auto-
// overwritten. Editing property/market while NOT customized auto-refines display_name to
// "Property - Market - YYYY-MM-DD - NN" (date from created_at, NN from batch_seq).
// PROTECTED fields (owner_user_id, storage_path, original_filename) are never mutated here.
const EDITABLE = ["propertyName", "propertyType", "market", "special", "budgetRange", "amenities", "notes", "placeId"] as const
const COLUMN: Record<(typeof EDITABLE)[number], string> = {
  propertyName: "property_name",
  propertyType: "property_type",
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

  const { data: current, error: readErr } = await supabase
    .from("social_content")
    .select("id, created_at, batch_seq, name_customized, property_name, market, original_filename")
    .eq("id", id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const cur = current as Record<string, unknown>

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("tags" in body && Array.isArray(body.tags)) {
    patch.tags = (body.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 60)).slice(0, 40)
  }
  for (const k of EDITABLE) {
    if (k in body) patch[COLUMN[k]] = typeof body[k] === "string" && (body[k] as string).trim() ? (body[k] as string).trim().slice(0, 5000) : null
  }

  const displayNameEdited = typeof body.displayName === "string"
  if (displayNameEdited) {
    patch.display_name = (body.displayName as string).trim().slice(0, 300) || null
    patch.name_customized = true
  } else if (cur.name_customized !== true && ("propertyName" in body || "market" in body)) {
    patch.display_name = buildSocialDisplayName({
      propertyName: "propertyName" in body ? (patch.property_name as string | null) : (cur.property_name as string | null),
      market: "market" in body ? (patch.market as string | null) : (cur.market as string | null),
      dateISO: typeof cur.created_at === "string" ? cur.created_at : new Date().toISOString(),
      seq: typeof cur.batch_seq === "number" ? cur.batch_seq : 1,
      fallbackFilename: typeof cur.original_filename === "string" ? cur.original_filename : null,
    })
  }

  const { data, error } = await supabase
    .from("social_content")
    .update(patch)
    .eq("id", id)
    .select("id, display_name, name_customized")
    .maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const out = data as { id: string; display_name: string | null; name_customized: boolean }
  return NextResponse.json({ id: out.id, displayName: out.display_name, nameCustomized: out.name_customized })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data: row, error: readErr } = await supabase.from("social_content").select("id, storage_path").eq("id", id).maybeSingle()
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
