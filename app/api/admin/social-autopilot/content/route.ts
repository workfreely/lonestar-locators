import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { buildSocialDisplayName } from "@/lib/social/displayName"
import { isPropertyType } from "@/lib/social/propertyTypes"

// Social Autopilot Content Library API — platform-admin ONLY (requirePlatformAdmin
// gates every method). RLS on social_content + the social-media bucket is the second
// layer. Internal property metadata lives here and is NEVER auto-exposed publicly.
const SIGNED_URL_TTL = 60 * 30 // 30-min preview links
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET → this admin's source videos + short-lived signed previews (newest first).
export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { data, error } = await supabase
    .from("social_content")
    .select(
      "id, storage_path, kind, original_filename, content_type, size_bytes, duration_s, display_name, name_customized, upload_batch_id, batch_seq, property_name, property_type, market, special, budget_range, amenities, tags, notes, place_id, details, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 500 })

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
        displayName: r.display_name,
        nameCustomized: r.name_customized === true,
        uploadBatchId: r.upload_batch_id,
        batchSeq: r.batch_seq,
        originalFilename: r.original_filename,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        propertyName: r.property_name,
        propertyType: r.property_type,
        tags: Array.isArray(r.tags) ? r.tags : [],
        market: r.market,
        special: r.special,
        budgetRange: r.budget_range,
        amenities: r.amenities,
        notes: r.notes,
        placeId: r.place_id,
        createdAt: r.created_at,
        previewUrl,
      }
    }),
  )
  return NextResponse.json({ items })
}

// POST → record ONE source video AFTER a direct browser→storage upload. The row id is
// the client-supplied contentId, so the IMMUTABLE storage path {owner}/{contentId}/
// source.<ext> is stable — renaming/metadata never moves the object, and identical
// original filenames never collide (path keys on the id, not the name). owner_user_id
// comes from the SESSION, never the body. Batch metadata (market/property/…) is applied
// per-file by the caller so every file in a batch inherits it while staying its own row.
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

  const contentId = typeof body.contentId === "string" ? body.contentId.trim() : ""
  if (!UUID_RE.test(contentId)) return NextResponse.json({ error: "valid contentId required" }, { status: 400 })

  const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : ""
  if (!storagePath || !storagePath.startsWith(`${userId}/${contentId}/`)) {
    return NextResponse.json({ error: "invalid storage path" }, { status: 400 })
  }

  const str = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

  const propertyName = str(body.propertyName)
  const propertyType = isPropertyType(typeof body.propertyType === "string" ? body.propertyType : "") ? (body.propertyType as string) : null
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 60)).slice(0, 40) : null
  const market = str(body.market)
  const originalFilename = str(body.originalFilename, 500)
  const uploadBatchId = typeof body.uploadBatchId === "string" && UUID_RE.test(body.uploadBatchId) ? body.uploadBatchId : null
  const batchSeq = Number.isInteger(body.batchSeq) && (body.batchSeq as number) > 0 ? (body.batchSeq as number) : 1

  // Initial display name (system-generated; name_customized=false so later Market/
  // Property edits can refine it until the user renames manually).
  const displayName = buildSocialDisplayName({
    propertyName,
    market,
    dateISO: new Date().toISOString(),
    seq: batchSeq,
    fallbackFilename: originalFilename,
  })

  const { data, error } = await supabase
    .from("social_content")
    .insert({
      id: contentId,
      owner_user_id: userId,
      storage_path: storagePath,
      kind: body.kind === "image" ? "image" : "clip",
      original_filename: originalFilename,
      content_type: str(body.contentType, 200),
      size_bytes: typeof body.sizeBytes === "number" ? body.sizeBytes : null,
      upload_batch_id: uploadBatchId,
      batch_seq: batchSeq,
      display_name: displayName,
      name_customized: false,
      property_name: propertyName,
      property_type: propertyType,
      tags: tags,
      market: market,
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
