import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// Social Autopilot Content Library — platform-admin ONLY (requirePlatformAdmin gates
// every method). RLS on social_content + the social-media bucket is the second layer.
// Internal property metadata lives here and is NEVER auto-exposed publicly.

const SIGNED_URL_TTL = 60 * 30 // 30 min preview links

// GET /api/admin/social-autopilot/content → this admin's source videos + signed previews.
export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { data, error } = await supabase
    .from("social_content")
    .select(
      "id, storage_path, kind, original_filename, content_type, size_bytes, duration_s, property_name, market, special, budget_range, amenities, notes, place_id, details, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 500 })

  // Short-lived signed preview URL per item (private bucket — never a public URL).
  // Generated with the RLS-scoped admin client, so a non-admin session can't mint them.
  const items = await Promise.all(
    (data ?? []).map(async (r: Record<string, unknown>) => {
      let previewUrl: string | null = null
      const path = typeof r.storage_path === "string" ? r.storage_path : null
      if (path) {
        const { data: signed } = await supabase.storage.from("social-media").createSignedUrl(path, SIGNED_URL_TTL)
        previewUrl = signed?.signedUrl ?? null
      }
      return {
        id: r.id,
        kind: r.kind,
        originalFilename: r.original_filename,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        durationS: r.duration_s,
        propertyName: r.property_name,
        market: r.market,
        special: r.special,
        budgetRange: r.budget_range,
        amenities: r.amenities,
        notes: r.notes,
        placeId: r.place_id,
        details: r.details ?? {},
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        previewUrl,
      }
    }),
  )
  return NextResponse.json({ items })
}

// POST /api/admin/social-autopilot/content → record a source video AFTER a direct
// browser→storage upload. owner_user_id comes from the SESSION, never the body.
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : ""
  if (!storagePath) return NextResponse.json({ error: "storagePath required" }, { status: 400 })
  // The uploaded object must live under the caller's own folder (defense in depth;
  // the storage RLS policy already enforces this, but reject early + clearly).
  if (!storagePath.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "invalid storage path" }, { status: 400 })
  }

  const str = (v: unknown, max = 2000) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null

  const { data, error } = await supabase
    .from("social_content")
    .insert({
      owner_user_id: userId,
      storage_path: storagePath,
      kind: body.kind === "image" ? "image" : "clip",
      original_filename: str(body.originalFilename, 500),
      content_type: str(body.contentType, 200),
      size_bytes: typeof body.sizeBytes === "number" ? body.sizeBytes : null,
      property_name: str(body.propertyName),
      market: str(body.market),
      special: str(body.special),
      budget_range: str(body.budgetRange),
      amenities: str(body.amenities),
      notes: str(body.notes, 5000),
      place_id: str(body.placeId, 512),
    })
    .select("id")
    .single()
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 })

  return NextResponse.json({ id: (data as { id: string }).id })
}
