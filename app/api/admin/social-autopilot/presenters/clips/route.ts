import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { isOwnedPresenterKey } from "@/lib/social/presenterUpload"
import {
  presenterClipKey, resolvePresenterClip, type PresenterClipRow, type PresenterClipStatus,
} from "@/lib/social/presenterClipCache"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SELECT = "id, presenter_id, voice_clip_id, audio_storage_path, clip_storage_path, status, attempt_count, max_attempts, error_message"

/** Database row → the shape the pure matcher expects. */
function toRow(r: Record<string, unknown>): PresenterClipRow {
  return {
    id: r.id as string,
    presenterId: (r.presenter_id as string | null) ?? null,
    voiceClipId: (r.voice_clip_id as string | null) ?? null,
    audioStoragePath: (r.audio_storage_path as string) ?? "",
    clipStoragePath: (r.clip_storage_path as string | null) ?? null,
    status: (r.status as PresenterClipStatus) ?? "queued",
    attemptCount: (r.attempt_count as number | undefined) ?? 0,
    maxAttempts: (r.max_attempts as number | undefined) ?? 3,
    errorMessage: (r.error_message as string | null) ?? null,
  }
}

/**
 * Resolve the presenter's own clip and the selected recording's storage path, both server-side.
 *
 * The client sends IDS ONLY. It never sends a storage key, for the same reason the posts route
 * resolves narration from a Voice Clip id: a client-supplied path is a client-chosen input to the
 * renderer. Both lookups run on the CALLER'S RLS client, so another account's presenter or voice
 * clip simply does not resolve.
 */
async function resolveInputs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  presenterId: string,
  voiceClipId: string | null,
) {
  const { data: pres } = await supabase
    .from("social_presenters")
    .select("id, clip_storage_path, heygen_avatar_id, enabled")
    .eq("id", presenterId)
    .maybeSingle()
  if (!pres) return { error: "presenter_not_found" as const }

  let audioPath: string | null = null
  let audioDuration: number | null = null
  if (voiceClipId) {
    const { data: clip } = await supabase
      .from("social_voice_clips")
      .select("id, storage_path, duration_seconds")
      .eq("id", voiceClipId)
      .maybeSingle()
    if (!clip) return { error: "voice_clip_not_found" as const }
    audioPath = (clip.storage_path as string | null) ?? null
    const d = clip.duration_seconds
    audioDuration = typeof d === "number" ? d : d != null ? Number(d) : null
    if (!audioPath) return { error: "voice_clip_has_no_file" as const }
  }

  return {
    presenter: pres as { id: string; clip_storage_path: string | null; heygen_avatar_id: string | null; enabled: boolean },
    audioPath,
    audioDuration,
  }
}

/**
 * GET /api/admin/social-autopilot/presenters/clips?presenterId=…&voiceClipId=…
 *
 * "Do we already have an avatar clip lip-synced to this recording?"
 *
 * Returns the resolution the editor displays AND the storage path a post should carry, so the
 * answer the operator reads and the answer the renderer gets come from one computation. The
 * voiceClipId is optional: without it this reports the unchanged pre-cache behaviour rather than
 * erroring, which is what lets the control call it on every change without special-casing.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const q = new URL(req.url).searchParams
  const presenterId = (q.get("presenterId") ?? "").trim()
  const voiceClipIdRaw = (q.get("voiceClipId") ?? "").trim()
  if (!UUID_RE.test(presenterId)) return NextResponse.json({ error: "valid presenterId required" }, { status: 400 })
  if (voiceClipIdRaw && !UUID_RE.test(voiceClipIdRaw)) return NextResponse.json({ error: "invalid voiceClipId" }, { status: 400 })
  const voiceClipId = voiceClipIdRaw || null

  const resolved = await resolveInputs(supabase, presenterId, voiceClipId)
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 404 })

  // Scoped to this presenter. RLS additionally scopes to this owner, so there is no owner
  // predicate here for the same reason the presenters listing has none.
  const { data: rows, error } = await supabase
    .from("social_presenter_clips")
    .select(SELECT)
    .eq("presenter_id", presenterId)
  if (error) return NextResponse.json({ error: "lookup_failed" }, { status: 500 })

  const resolution = resolvePresenterClip({
    presenterClipStoragePath: resolved.presenter.clip_storage_path,
    selectedAudioStoragePath: resolved.audioPath,
    rows: (rows ?? []).map((r) => toRow(r as Record<string, unknown>)),
  })

  return NextResponse.json({
    state: resolution.state,
    lipSyncVerified: resolution.lipSyncVerified,
    clipId: resolution.clipId,
    // The path is returned so the editor can show WHICH clip would be used, and so a test can
    // assert the editor and the post agree. It is not an input to anything — the posts route
    // re-resolves server-side rather than trusting a path from the browser.
    clipStoragePath: resolution.clipStoragePath,
  })
}

/**
 * POST /api/admin/social-autopilot/presenters/clips
 *
 * ASSOCIATE an avatar clip the operator already uploaded with the exact recording it was
 * lip-synced to. This is what POPULATES the cache in Phase 2a — there is no generation here and
 * no HeyGen call anywhere in this file.
 *
 * ── WHY AN EXPLICIT ASSOCIATION STEP AND NOT AN INFERENCE ───────────────────────────────────
 * Nothing about an uploaded WebM states which audio it was synced to. Guessing — by upload time,
 * by filename similarity, by "the most recent hook" — would produce exactly the failure this
 * whole feature exists to prevent, and would produce it invisibly. So the operator states it, once
 * per clip, and the cache records it as a fact rather than a heuristic.
 *
 * Body: { presenterId, voiceClipId, clipStoragePath }
 */
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  let body: { presenterId?: unknown; voiceClipId?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }) }

  const presenterId = typeof body.presenterId === "string" ? body.presenterId.trim() : ""
  const voiceClipId = typeof body.voiceClipId === "string" ? body.voiceClipId.trim() : ""
  if (!UUID_RE.test(presenterId)) return NextResponse.json({ error: "valid presenterId required" }, { status: 400 })
  if (!UUID_RE.test(voiceClipId)) return NextResponse.json({ error: "valid voiceClipId required" }, { status: 400 })

  const resolved = await resolveInputs(supabase, presenterId, voiceClipId)
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 404 })
  if (!resolved.audioPath) return NextResponse.json({ error: "voice_clip_has_no_file" }, { status: 400 })

  // ── THE CLIP IS THE PRESENTER'S OWN, READ SERVER-SIDE ─────────────────────────────────────
  // NOT a path from the request. The operator's statement is "this presenter's current clip was
  // synced to this hook", so the only clip that can be associated is the one the presenter row
  // already points at — there is no way to spell a different object, mine or anyone else's. This
  // is the same reason narration resolves from a Voice Clip id rather than a supplied key, and it
  // is why the presenters listing deliberately exposes `hasClip` instead of the path.
  const clipStoragePath = (resolved.presenter.clip_storage_path ?? "").trim()
  if (!clipStoragePath) {
    return NextResponse.json({ error: "presenter_has_no_clip", detail: "Upload an avatar clip for this presenter first." }, { status: 409 })
  }
  // Belt and braces: the stored path must still be this owner's own object under presenters/. A
  // row predating the upload feature, or one edited directly, cannot smuggle in another key.
  if (!isOwnedPresenterKey(clipStoragePath, userId)) {
    return NextResponse.json({ error: "invalid_clip_path", detail: "This presenter's clip is not one of your own uploads, so it cannot be matched to a recording." }, { status: 409 })
  }

  // Confirm the file is really there before recording a match that claims it is.
  const { data: signed } = await supabase.storage.from("social-media").createSignedUrl(clipStoragePath, 60)
  if (!signed?.signedUrl) return NextResponse.json({ error: "clip_not_found", detail: "That avatar clip is not in storage." }, { status: 404 })

  const idempotencyKey = presenterClipKey({
    presenterId,
    audioStoragePath: resolved.audioPath,
    heygenAvatarId: resolved.presenter.heygen_avatar_id,
  })

  const { data: inserted, error: insErr } = await supabase
    .from("social_presenter_clips")
    .insert({
      owner_user_id: userId,
      presenter_id: presenterId,
      voice_clip_id: voiceClipId,
      audio_storage_path: resolved.audioPath,
      audio_duration_s: resolved.audioDuration,
      heygen_avatar_id: resolved.presenter.heygen_avatar_id,
      clip_storage_path: clipStoragePath,
      status: "ready",
      finished_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
    })
    .select(SELECT)
    .single()

  if (insErr) {
    // 23505 = the partial unique index refused: this (presenter, recording) pair already has a
    // live row. That is the duplicate guard working, so return the EXISTING row rather than an
    // error — a double-click should land on the same association, not fail.
    if ((insErr as { code?: string }).code === "23505") {
      const { data: existing } = await supabase
        .from("social_presenter_clips")
        .select(SELECT)
        .eq("presenter_id", presenterId)
        .eq("audio_storage_path", resolved.audioPath)
        .in("status", ["queued", "generating", "ready"])
        .maybeSingle()
      if (existing) return NextResponse.json({ clip: toRow(existing as Record<string, unknown>), alreadyExisted: true })
    }
    return NextResponse.json({ error: "associate_failed" }, { status: 500 })
  }

  return NextResponse.json({ clip: toRow(inserted as Record<string, unknown>), alreadyExisted: false })
}
