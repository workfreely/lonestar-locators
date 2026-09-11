import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { buildSocialDisplayName } from "@/lib/social/displayName"

// POST /api/admin/social-autopilot/content/bulk — apply ONE metadata change (Market
// and/or Property) to many source videos at once. Platform-admin ONLY; RLS additionally
// scopes every row to the owner, so ids that aren't the caller's simply don't come back
// and are reported as failed (never silently "succeeded").
//
// GUARANTEES (per SA1.1 spec):
//  - ONLY market / property_name are writable here. owner_user_id, storage_path and
//    original_filename can NEVER be touched — bulk reorganization is metadata only, the
//    underlying private object is never moved/renamed.
//  - display_name is regenerated ONLY for rows where name_customized=false; a user's
//    manually-customized name is preserved untouched.
//  - The response reports ACCURATE per-row outcome — it never claims "15 updated" when
//    only 12 rows actually updated.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 500

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  // Unique, valid ids only.
  const rawIds = Array.isArray(body.ids) ? body.ids : []
  const ids = Array.from(new Set(rawIds.filter((v): v is string => typeof v === "string" && UUID_RE.test(v))))
  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 })
  if (ids.length > MAX_IDS) return NextResponse.json({ error: "too_many_ids" }, { status: 400 })

  // Which allowed fields is this call changing? A key present but blank clears it.
  const changingMarket = "market" in body
  const changingProperty = "propertyName" in body
  if (!changingMarket && !changingProperty) return NextResponse.json({ error: "no editable fields" }, { status: 400 })

  const str = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)
  const newMarket = changingMarket ? str(body.market) : undefined
  const newProperty = changingProperty ? str(body.propertyName) : undefined

  // Fetch the caller's own target rows (RLS scopes to owner). Rows not returned = not
  // owned / not found → reported failed below.
  const { data: rows, error: readErr } = await supabase
    .from("social_content")
    .select("id, created_at, batch_seq, name_customized, property_name, market, original_filename")
    .in("id", ids)
  if (readErr) return NextResponse.json({ error: "bulk_failed" }, { status: 500 })

  const found = (rows ?? []) as Record<string, unknown>[]
  const foundIds = new Set(found.map((r) => String(r.id)))
  const updated: string[] = []
  const failed: string[] = ids.filter((id) => !foundIds.has(id))

  const nowISO = new Date().toISOString()
  for (const row of found) {
    const id = String(row.id)
    const patch: Record<string, unknown> = { updated_at: nowISO }
    if (changingMarket) patch.market = newMarket
    if (changingProperty) patch.property_name = newProperty

    // Regenerate the system name only when the user hasn't customized it.
    if (row.name_customized !== true) {
      patch.display_name = buildSocialDisplayName({
        propertyName: changingProperty ? newProperty : (row.property_name as string | null),
        market: changingMarket ? newMarket : (row.market as string | null),
        dateISO: typeof row.created_at === "string" ? row.created_at : nowISO,
        seq: typeof row.batch_seq === "number" ? row.batch_seq : 1,
        fallbackFilename: typeof row.original_filename === "string" ? row.original_filename : null,
      })
    }

    const { data: upd, error: updErr } = await supabase.from("social_content").update(patch).eq("id", id).select("id").maybeSingle()
    if (updErr || !upd) failed.push(id)
    else updated.push(id)
  }

  return NextResponse.json({
    requested: ids.length,
    updated: updated.length,
    failed: failed.length,
    updatedIds: updated,
    failedIds: failed,
  })
}
