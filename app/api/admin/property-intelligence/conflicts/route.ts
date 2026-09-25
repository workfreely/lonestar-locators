import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"

export const runtime = "nodejs"

// Admin resolution of surfaced Property Intelligence conflicts. Every resolution is an
// explicit, audited admin decision (never a silent overwrite). Keep = no data change;
// Use Proposed / Edit = a manual write recorded with admin/manual provenance.
export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { data, error } = await supabaseAdmin
    .from("property_conflict_review")
    .select("id, place_id, field_name, existing_value, incoming_value, incoming_source_type, classification, disposition")
    .eq("disposition", "preserved_pending_review")
    .order("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Attach property name + existing provenance (source/checked_at) for context.
  const rows = data ?? []
  const placeIds = [...new Set(rows.map((r) => r.place_id).filter(Boolean))] as string[]
  const names: Record<string, string> = {}
  if (placeIds.length) {
    const { data: cat } = await supabaseAdmin.from("property_catalog").select("place_id, property_name").in("place_id", placeIds)
    for (const c of cat ?? []) names[c.place_id as string] = (c.property_name as string) ?? ""
  }
  return NextResponse.json({ conflicts: rows.map((r) => ({ ...r, property_name: names[r.place_id as string] ?? r.place_id })) })
}

export async function POST(req: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { userId } = guard
  let body: { id?: number; action?: string; value?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const { id, action } = body
  if (!id || !["keep_existing", "use_proposed", "edit_manually"].includes(action ?? "")) {
    return NextResponse.json({ error: "id + valid action required" }, { status: 400 })
  }
  const { data: row } = await supabaseAdmin.from("property_conflict_review").select("*").eq("id", id).maybeSingle()
  if (!row) return NextResponse.json({ error: "conflict not found" }, { status: 404 })
  const field = row.field_name as string
  const placeId = row.place_id as string
  const now = new Date().toISOString()

  const event = (newVal: string | null, reason: string) => supabaseAdmin.from("property_enrichment_events").insert({
    job_id: `admin_conflict_${userId}`, place_id: placeId, field_name: field, action: newVal === null ? "skipped" : "written",
    old_value: row.existing_value, new_value: newVal, source_type: "manual_verified",
    source_reference: `admin_resolution:${action}`, verification_status: "verified", reason, checked_at: now,
  })

  if (action === "keep_existing") {
    await event(null, "admin_keep_existing")
    await supabaseAdmin.from("property_conflict_review").update({ disposition: "resolved", resolved_value: row.existing_value, note: "admin: keep existing" }).eq("id", id)
    return NextResponse.json({ ok: true, resolved: "kept_existing" })
  }

  // use_proposed → incoming_value; edit_manually → provided value.
  let raw: unknown = action === "use_proposed" ? row.incoming_value : body.value
  if (raw == null || raw === "") return NextResponse.json({ error: "value required" }, { status: 400 })
  // Keyword fields are jsonb arrays; parse strings/CSV into an array.
  let toStore: unknown = raw
  if (field === "location_keywords" || field === "amenity_keywords") {
    if (typeof raw === "string") { try { toStore = JSON.parse(raw) } catch { toStore = raw.split(",").map((s) => s.trim()).filter(Boolean) } }
    if (!Array.isArray(toStore)) return NextResponse.json({ error: "keyword value must be an array" }, { status: 400 })
    toStore = (toStore as string[]).slice(0, 3)
  }
  const { error: upErr } = await supabaseAdmin.from("property_catalog").update({ [field]: toStore, intel_enriched_at: now }).eq("place_id", placeId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  await event(JSON.stringify(toStore), action === "use_proposed" ? "admin_use_proposed" : "admin_manual_edit")
  await supabaseAdmin.from("property_conflict_review").update({ disposition: "resolved", resolved_value: JSON.stringify(toStore), note: `admin: ${action}` }).eq("id", id)
  return NextResponse.json({ ok: true, resolved: action, value: toStore })
}
