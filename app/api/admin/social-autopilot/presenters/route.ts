import { NextResponse, type NextRequest } from "next/server"
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import ffmpegPath from "ffmpeg-static"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { assertDisposablePath } from "@/lib/social/storagePaths"
import {
  PRESENTER_UPLOAD, checkPresenterFormat, checkPresenterSize, checkTransparency,
  decoderArgsFor, isOwnedPresenterKey, labelFromFilename,
} from "@/lib/social/presenterUpload"

// ffmpeg is spawned to prove transparency, so this cannot run on the edge.
export const runtime = "nodejs"

/**
 * GET /api/admin/social-autopilot/presenters
 *
 * The AI Presenters this agent may use: their OWN, plus the shared samples.
 *
 * ── OWNERSHIP IS ENFORCED BY THE DATABASE, NOT BY THIS QUERY ────────────────────────────────
 * The select below has no owner filter, and that is deliberate. It runs on the CALLER'S RLS
 * client, and the policy on social_presenters is `is_platform_admin() AND (is_sample OR
 * owner_user_id = auth.uid())`. So another agent's presenter is not merely hidden by a WHERE
 * clause this route could forget — it does not exist as far as this connection is concerned.
 * Filtering here as well would read as the protection and invite someone to "optimise" the policy
 * away later.
 *
 * NO CREDENTIAL IS RETURNED OR STORED. heygen_avatar_id is an identifier, useless without the
 * server-side account key, which lives in an environment variable and never in a row. The column
 * list below is explicit so a future column cannot be exposed by a `select *`.
 */
export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { data, error } = await supabase
    .from("social_presenters")
    .select("id, label, is_sample, enabled, default_intro_seconds, clip_storage_path, voice_kind")
    .eq("enabled", true)
    // Samples last: an agent's own presenter is the one they almost always want.
    .order("is_sample", { ascending: true })
    .order("label", { ascending: true })

  if (error) return NextResponse.json({ error: "presenters_unavailable" }, { status: 500 })

  return NextResponse.json({ presenters: (data ?? []).map(shape) })
}

/** One presenter in the shape the editor's control consumes. Shared by GET and POST so a newly
 *  uploaded avatar is indistinguishable from one that was already there. */
function shape(p: unknown) {
  const r = p as Record<string, unknown>
  return {
    id: r.id as string,
    label: r.label as string,
    isSample: r.is_sample === true,
    defaultIntroSeconds: typeof r.default_intro_seconds === "string" ? Number(r.default_intro_seconds) : (r.default_intro_seconds as number),
    // Whether a usable clip exists at all — the editor greys out a presenter that has none
    // rather than letting an operator select something that cannot render.
    hasClip: !!r.clip_storage_path,
    voiceKind: (r.voice_kind as string) ?? "upload",
  }
}

/**
 * POST /api/admin/social-autopilot/presenters
 *
 * Registers an avatar clip the browser has ALREADY uploaded to `{owner}/presenters/{uuid}.{ext}`,
 * after proving the renderer can actually use it.
 *
 * ── WHY THE FILE DOES NOT COME THROUGH THIS REQUEST ─────────────────────────────────────────
 * Same two-step the Voice Clips library uses: the browser puts the object in the bucket with its
 * own authenticated client, then posts the key here. A multipart upload through the function would
 * put the clip inside the serverless request body, which is capped well below the size of a real
 * avatar clip — so the straightforward-looking version is the one that breaks on a large file.
 * The key is still never trusted: isOwnedPresenterKey re-derives what this caller is allowed to
 * register, so a client that posts someone else's path, or a path outside presenters/, is refused.
 *
 * ── WHY TRANSPARENCY IS PROVEN HERE AND NOT ASSUMED FROM THE EXTENSION ──────────────────────
 * A WebM is not necessarily a TRANSPARENT WebM. One exported without alpha passes every filename
 * check and then composites as a solid rectangle that fades to black — a wrong render rather than
 * an error. So the stored object is downloaded and probed with the SAME decoder the renderer uses
 * (see presenterUpload: the native vp9 decoder silently drops alpha, which is why the flag
 * matters), and the pixel format has to carry an alpha channel.
 *
 * ── NOTHING IS LEFT BEHIND ──────────────────────────────────────────────────────────────────
 * Every failure after the object exists removes it, including a failed insert. Removal goes
 * through assertDisposablePath, which throws rather than filters: if a key from this path ever
 * named an original master the cleanup fails loudly instead of destroying it. presenters/ keys are
 * uuid-named and can never match `source.*`, so that guard should never fire — which is exactly
 * when a guard is worth having.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  let body: { storagePath?: unknown; label?: unknown; filename?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }) }

  const storagePath = typeof body.storagePath === "string" ? body.storagePath.trim() : ""
  if (!storagePath) return NextResponse.json({ error: "storagePath required" }, { status: 400 })
  // THE OWNERSHIP GATE. Checked before anything is read, so an unauthorised key never reaches
  // storage, a probe, or the cleanup path (where it would be a key we had no business touching).
  if (!isOwnedPresenterKey(storagePath, userId)) {
    return NextResponse.json({ error: "invalid_storage_path", detail: `The clip must be uploaded to your own ${PRESENTER_UPLOAD.storagePrefix}/ folder with a supported extension.` }, { status: 400 })
  }
  // The original filename is used for the label and for the decoder choice; the stored key's own
  // extension is what actually decides the decoder, and both are validated.
  const filename = typeof body.filename === "string" && body.filename.trim() ? body.filename.trim() : storagePath
  const fmt = checkPresenterFormat(storagePath)
  if (!fmt.ok) return NextResponse.json({ error: "unsupported_format", detail: fmt.detail }, { status: 400 })

  const label = (typeof body.label === "string" && body.label.trim())
    ? body.label.trim().slice(0, 120)
    : labelFromFilename(filename)

  // Remove the just-uploaded object. Best effort by design: a failure to clean up must not turn
  // into a second error that hides the first one the operator actually needs to read.
  const discard = async () => {
    try { await supabase.storage.from("social-media").remove([assertDisposablePath(storagePath)]) } catch { /* reported via the original error */ }
  }

  // SIZE FIRST, from storage metadata — so an oversized object is rejected without downloading it.
  const dir = storagePath.slice(0, storagePath.lastIndexOf("/"))
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1)
  const { data: listed } = await supabase.storage.from("social-media").list(dir, { search: name, limit: 1 })
  const entry = (listed ?? []).find((o) => o.name === name)
  if (!entry) return NextResponse.json({ error: "clip_not_found", detail: "The uploaded clip could not be found in storage." }, { status: 404 })
  const sizeErr = checkPresenterSize(Number((entry.metadata as { size?: number } | null)?.size ?? 0))
  if (sizeErr) { await discard(); return NextResponse.json({ error: "file_too_large", detail: sizeErr }, { status: 400 }) }

  if (!ffmpegPath) return NextResponse.json({ error: "renderer_unavailable", detail: "Transparency cannot be verified in this runtime." }, { status: 503 })

  // ── PROVE TRANSPARENCY ────────────────────────────────────────────────────────────────────
  let work: string | null = null
  try {
    const { data: signed, error: signErr } = await supabase.storage.from("social-media").createSignedUrl(storagePath, 120)
    if (signErr || !signed?.signedUrl) { await discard(); return NextResponse.json({ error: "clip_unreadable", detail: "The uploaded clip could not be read back for verification." }, { status: 400 }) }
    const res = await fetch(signed.signedUrl)
    if (!res.ok) { await discard(); return NextResponse.json({ error: "clip_unreadable", detail: `The uploaded clip could not be downloaded for verification (${res.status}).` }, { status: 400 }) }
    const bytes = Buffer.from(await res.arrayBuffer())
    // Re-check the real byte length: storage metadata is reported by the uploader, this is measured.
    const measuredErr = checkPresenterSize(bytes.byteLength)
    if (measuredErr) { await discard(); return NextResponse.json({ error: "file_too_large", detail: measuredErr }, { status: 400 }) }

    work = await fs.mkdtemp(path.join(os.tmpdir(), "presenter-check-"))
    const local = path.join(work, `clip.${fmt.ext}`)
    await fs.writeFile(local, bytes)

    const stderr = await new Promise<string>((resolve) => {
      execFile(
        ffmpegPath as unknown as string,
        ["-hide_banner", ...decoderArgsFor(local), "-i", local],
        { maxBuffer: 1024 * 1024 * 8 },
        (_err, _stdout, errOut) => resolve(String(errOut ?? "")),
      )
    })
    const verdict = checkTransparency(stderr)
    if (!verdict.ok) {
      await discard()
      return NextResponse.json({ error: verdict.reason, detail: verdict.detail }, { status: 400 })
    }

    // ── REGISTER IT ─────────────────────────────────────────────────────────────────────────
    // owner_user_id is set explicitly: the RLS insert policy requires `owner_user_id = auth.uid()`
    // AND `NOT is_sample`, so this is the only shape of row this caller can create — an agent
    // cannot promote their avatar into everyone's shared library.
    const { data: inserted, error: insErr } = await supabase
      .from("social_presenters")
      .insert({ owner_user_id: userId, is_sample: false, label, clip_storage_path: storagePath, voice_kind: "upload" })
      .select("id, label, is_sample, enabled, default_intro_seconds, clip_storage_path, voice_kind")
      .single()
    if (insErr || !inserted) {
      // REQUIREMENT: no orphaned object. The clip is removed so a retry starts clean rather than
      // leaving an unreferenced file in the bucket forever.
      await discard()
      return NextResponse.json({ error: "create_failed", detail: "The avatar was uploaded but could not be saved. The file has been removed; please try again." }, { status: 500 })
    }
    return NextResponse.json({ presenter: shape(inserted), pixFmt: verdict.pixFmt })
  } catch {
    await discard()
    return NextResponse.json({ error: "verify_failed", detail: "The avatar could not be verified. The file has been removed; please try again." }, { status: 500 })
  } finally {
    if (work) await fs.rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
