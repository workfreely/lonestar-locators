import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// Social Beast Voice Clips library API — platform-admin only. Reusable Hook/CTA
// voiceovers stored in the private `social-media` bucket. Clips hold file basics only
// (no property metadata). RLS on social_voice_clips (owner = auth.uid()) is the second layer.
export const runtime = "nodejs"
const SIGNED_URL_TTL = 60 * 30
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET → this admin's voice clips (newest first) + short-lived signed preview URLs.
export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard
  const { data, error } = await supabase
    .from("social_voice_clips")
    .select("id, clip_type, name, storage_path, duration_seconds, created_at")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 500 })
  const clips = await Promise.all(
    (data ?? []).map(async (r: Record<string, unknown>) => {
      let previewUrl: string | null = null
      const path = typeof r.storage_path === "string" ? r.storage_path : null
      if (path) {
        const { data: signed } = await supabase.storage.from("social-media").createSignedUrl(path, SIGNED_URL_TTL)
        previewUrl = signed?.signedUrl ?? null
      }
      return { id: r.id, clipType: r.clip_type, name: r.name, durationSeconds: r.duration_seconds, previewUrl, createdAt: r.created_at }
    }),
  )
  return NextResponse.json({ clips })
}

// POST → record a clip AFTER the browser uploaded the file to the social-media bucket.
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard
  let body: { clipType?: string; name?: string; storagePath?: string; durationSeconds?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }) }
  const clipType = body.clipType === "hook" || body.clipType === "cta" ? body.clipType : null
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : ""
  if (!clipType) return NextResponse.json({ error: "clipType must be hook or cta" }, { status: 400 })
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
  if (!storagePath.startsWith(`${userId}/`)) return NextResponse.json({ error: "invalid storage path" }, { status: 400 })
  const durationSeconds = typeof body.durationSeconds === "number" && isFinite(body.durationSeconds) ? Math.max(0, body.durationSeconds) : null
  const { data, error } = await supabase
    .from("social_voice_clips")
    .insert({ clip_type: clipType, name, storage_path: storagePath, duration_seconds: durationSeconds })
    .select("id, clip_type, name, duration_seconds, created_at")
    .single()
  if (error) return NextResponse.json({ error: "create_failed" }, { status: 500 })
  return NextResponse.json({ clip: { id: data.id, clipType: data.clip_type, name: data.name, durationSeconds: data.duration_seconds, createdAt: data.created_at } })
}

// DELETE ?id=<uuid> → remove a clip (row + best-effort storage object).
export async function DELETE(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard
  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "valid id required" }, { status: 400 })
  const { data: row } = await supabase.from("social_voice_clips").select("storage_path").eq("id", id).maybeSingle()
  const { error } = await supabase.from("social_voice_clips").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 })
  if (row?.storage_path) await supabase.storage.from("social-media").remove([row.storage_path as string])
  return NextResponse.json({ ok: true })
}
