import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { buildSocialDisplayName } from "@/lib/social/displayName"
import { isPropertyType } from "@/lib/social/propertyTypes"
import { signMedia, mapWithConcurrency, SIGN_CONCURRENCY } from "@/lib/social/signedMedia"
import { loadAgentRoster, UNASSIGNED } from "@/lib/social/agentRoster"

// Social Autopilot Content Library API — platform-admin ONLY (requirePlatformAdmin
// gates every method). RLS on social_content + the social-media bucket is the second
// layer. Internal property metadata lives here and is NEVER auto-exposed publicly.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET → this admin's source videos + short-lived signed previews (newest first).
export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  const BASE_COLUMNS =
    "id, storage_path, thumb_storage_path, kind, original_filename, content_type, size_bytes, duration_s, display_name, name_customized, upload_batch_id, batch_seq, property_name, property_type, market, area_neighborhood, special, budget_range, price_label_mode, amenities, tags, notes, place_id, details, available_to_agents, created_at, updated_at"
  // The two ownership columns arrive with a prepared migration. PostgREST fails the WHOLE select
  // when one names a column that does not exist, so asking for them unconditionally would turn an
  // un-migrated deploy into an empty library. Tried, then dropped — and the response SAYS which it
  // got, so the UI shows the new controls only when they would actually save.
  const OWNERSHIP_COLUMNS = `${BASE_COLUMNS}, personal_agent_user_id, debut_for_agent_user_id`
  let ownershipReadable = true
  // Widened to a plain row map rather than letting each select infer its own shape: the two
  // selects differ by exactly the columns in question, so a shared variable cannot hold both
  // inferred types. Every field is read defensively below in any case.
  let rows: Record<string, unknown>[] = []
  const first = await supabase
    .from("social_content")
    .select(OWNERSHIP_COLUMNS)
    .order("created_at", { ascending: false })
  if (first.error) {
    ownershipReadable = false
    const fallback = await supabase
      .from("social_content")
      .select(BASE_COLUMNS)
      .order("created_at", { ascending: false })
    if (fallback.error) return NextResponse.json({ error: "list_failed" }, { status: 500 })
    rows = (fallback.data ?? []) as unknown as Record<string, unknown>[]
  } else {
    rows = (first.data ?? []) as unknown as Record<string, unknown>[]
  }

  // WHO A VIDEO MAY BE ASSIGNED TO. The same roster the Accounts page uses, so the picker cannot
  // offer a person the destinations do not know about — and so an assignment target is validated
  // against real connections rather than being any uuid the client sends.
  // THE ADMIN IS NOT ONE OF THE PEOPLE A VIDEO CAN BE ASSIGNED TO. His own accounts carry his user
  // id as their agent, so he arrived in this roster like anybody else and the picker offered
  // "Only me" AND "Jay Morris" — two options meaning one thing, with no way to tell which the
  // enforcement would honour. "Only me" is how the operator says himself, and it is the default,
  // so the named duplicate is removed rather than explained.
  const agents = ownershipReadable
    ? (await loadAgentRoster(supabase, null))
        .filter((a) => a.id !== UNASSIGNED && a.id !== userId && a.connectionIds.length > 0)
        .map((a) => ({ id: a.id, name: a.name, instagram: a.instagram, tiktok: a.tiktok }))
    : []

  // BOUNDED, not Promise.all over the whole library. With a thumbnail per row this was 2 signings
  // x every row fired at once — 284 for a 142-clip library, on every load. The ceiling bounds that
  // burst; signMedia's re-use then makes a repeat load cost almost no signing at all.
  const items = await mapWithConcurrency(rows, SIGN_CONCURRENCY, async (r: Record<string, unknown>) => {
      const path = typeof r.storage_path === "string" ? r.storage_path : null
      const previewUrl = (await signMedia(supabase, path, userId)).url
      // The INTERNAL library preview — a small JPEG beside the source, never a social cover and
      // never published. Signed separately so the grid can paint without the video URL at all;
      // null when a row has no thumbnail yet, which the grid falls back from.
      const thumbPath = typeof r.thumb_storage_path === "string" ? r.thumb_storage_path : null
      const thumbUrl = (await signMedia(supabase, thumbPath, userId)).url
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
        // THE STORED LENGTH. Null on everything uploaded before this was captured — the grid
        // shows no badge for those until the backfill runs, which is the honest state.
        durationSeconds: r.duration_s === null || r.duration_s === undefined ? null : Number(r.duration_s),
        propertyName: r.property_name,
        propertyType: r.property_type,
        areaNeighborhood: r.area_neighborhood,
        tags: Array.isArray(r.tags) ? r.tags : [],
        market: r.market,
        special: r.special,
        budgetRange: r.budget_range,
        amenities: r.amenities,
        notes: r.notes,
        placeId: r.place_id,
        // THE PRIVACY CHECKBOX, as the UI states it. Inverted once, here, so the client never
        // reasons about availability — it only knows whether this video is the operator's own.
        personal: r.available_to_agents !== true,
        // WHOSE personal video, when it is assigned to one person. Null means what it has always
        // meant for a Personal row: the operator's own. Absent entirely when the column is not
        // readable yet, which the response reports separately rather than implying here.
        personalAgentUserId: (r.personal_agent_user_id as string | null) ?? null,
        // Designated as the FIRST video that must publish on that person's accounts.
        debutForAgentUserId: (r.debut_for_agent_user_id as string | null) ?? null,
        createdAt: r.created_at,
        previewUrl,
        thumbUrl,
        // SA-only prepared public-post overrides live in details.preparedPost (jsonb).
        preparedPost:
          r.details && typeof r.details === "object" && !Array.isArray(r.details)
            ? ((r.details as Record<string, unknown>).preparedPost ?? null)
            : null,
      }
  })
  return NextResponse.json({
    items,
    // Stated, not inferred. A client that cannot tell whether ownership is readable would show a
    // picker whose saves fail, which is worse than not showing it.
    ownershipReadable,
    agents,
  })
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
  const areaNeighborhood = typeof body.areaNeighborhood === "string" && body.areaNeighborhood.trim() ? body.areaNeighborhood.trim().slice(0, 200) : null
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
      // THE VIDEO'S LENGTH, measured by the browser from the file it is about to upload. Free at
      // that moment and nowhere else: nothing server-side decodes these, and asking the grid for
      // it later means fetching every clip's metadata. A browser that cannot read it sends null,
      // which is exactly what every row held before.
      duration_s: typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds) && body.durationSeconds > 0
        ? body.durationSeconds
        : null,
      upload_batch_id: uploadBatchId,
      batch_seq: batchSeq,
      display_name: displayName,
      name_customized: false,
      property_name: propertyName,
      property_type: propertyType,
      area_neighborhood: areaNeighborhood,
      tags: tags,
      market: market,
      special: str(body.special),
      budget_range: str(body.budgetRange),
      // Captured at INTAKE so the Post Editor does not have to re-state it. Same narrowing the
      // editor's PATCH uses: anything unrecognised is 'starting_at'.
      price_label_mode: body.priceLabelMode === "exact_unit" ? "exact_unit" : "starting_at",
      amenities: str(body.amenities),
      // Default overlay mode for this source ('generate' unless flagged 'existing' at upload). New
      // posts inherit it; the Post Editor can override per post.
      overlay_mode: body.overlayMode === "existing" ? "existing" : "generate",
      // PERSONAL — UNCHECKED BY DEFAULT, written explicitly because the column's own default is
      // the opposite. A library is overwhelmingly property tours; the handful that feature the
      // operator are the exception, and an exception is what a checkbox is for. Arriving checked
      // meant every upload had to be un-marked by hand, which is how 266 videos came to look
      // deliberately Personal when nobody had chosen that for any of them.
      //
      // The COLUMN default stays false on purpose. Only this route — the Social Beast upload the
      // operator drives — opts a new row into agent eligibility. Any other insert path (a future
      // worker, an import, a direct statement) still lands restricted, so the unreviewed case
      // fails closed. Eligibility is not exposure: agent access is a separate switch, and while
      // it is off this value shows nothing to anyone.
      available_to_agents: true,
      notes: str(body.notes, 5000),
      place_id: str(body.placeId, 512),
    })
    .select("id")
    .single()
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 })

  return NextResponse.json({ id: (data as { id: string }).id })
}
