"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"

/**
 * SOCIAL BEAST — Reel cover selection.
 *
 * Instagram picks the cover frame itself unless told otherwise, and that frame is the single most
 * visible part of a Reel. Two ways to decide it:
 *
 *   SELECT FRAME (primary)  — scrub the RENDERED video and take the current time as an offset.
 *                             No upload, nothing to keep in sync, and it cannot disagree with the
 *                             footage because it IS the footage.
 *   CUSTOM COVER (optional) — upload an image. Wins over a chosen frame when both exist.
 *
 * ── WHY THE RENDERED VIDEO, NOT THE SOURCE ──────────────────────────────────────────────────
 * thumb_offset indexes the file Instagram receives, which is the rendered derivative with the
 * overlay burned in. Scrubbing the source would show a frame without the overlay — the same
 * instant, but not the picture that becomes the cover. So the control requires a current render.
 *
 * Nothing here re-renders anything: a cover is metadata about which frame to SHOW.
 */

type Props = {
  postId: string
  /** Signed URL of the RENDERED mp4. Null when no current render exists. */
  renderedUrl: string | null
  /** True when the render is current (render_status === 'ready' and not edited since). */
  renderReady: boolean
  contentId: string
  initialOffsetMs: number | null
  initialCoverPath: string | null
  initialCoverUrl: string | null
  /** Set when the post was re-rendered after a frame was chosen. */
  coverMayHaveShifted?: boolean
  onSaved?: () => void
}

const fmtTime = (ms: number) => {
  const s = ms / 1000
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((ms % 1000) / 100))}`
}

export default function ReelCoverControl(p: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [durationMs, setDurationMs] = useState(0)
  const [offsetMs, setOffsetMs] = useState<number | null>(p.initialOffsetMs)
  const [coverPath, setCoverPath] = useState<string | null>(p.initialCoverPath)
  const [coverUrl, setCoverUrl] = useState<string | null>(p.initialCoverUrl)
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null)
  const [aspectWarning, setAspectWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Custom cover WINS — the same precedence the publish path applies, mirrored here so the editor
  // shows what will actually be sent rather than what was most recently clicked.
  const effective: "custom" | "offset" | "none" = coverPath ? "custom" : offsetMs != null ? "offset" : "none"

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await fetch(`/api/admin/social-autopilot/posts/${p.postId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      p.onSaved?.()
    } catch {
      setError("Couldn’t save the cover.")
    } finally {
      setBusy(false)
    }
  }, [p])

  /** Draw the current video frame to the canvas for the preview thumbnail. */
  const captureFrame = useCallback(() => {
    const v = videoRef.current, c = canvasRef.current
    if (!v || !c || !v.videoWidth) return
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height)
    try { setFrameDataUrl(c.toDataURL("image/jpeg", 0.8)) } catch { /* tainted canvas — preview only */ }
  }, [])

  // Restore a previously chosen frame so reopening the editor shows the real selection.
  useEffect(() => {
    const v = videoRef.current
    if (!v || p.initialOffsetMs == null) return
    const onMeta = () => { v.currentTime = Math.min(p.initialOffsetMs! / 1000, v.duration || 0) }
    v.addEventListener("loadedmetadata", onMeta, { once: true })
    return () => v.removeEventListener("loadedmetadata", onMeta)
  }, [p.initialOffsetMs])

  const onScrub = (ms: number) => {
    setOffsetMs(ms)
    const v = videoRef.current
    if (v) v.currentTime = ms / 1000
  }

  const uploadCover = async (file: File) => {
    setBusy(true); setError(null); setAspectWarning(null)
    try {
      // 9:16 is the Reels cover shape. A different ratio is WARNED about, never rejected —
      // Instagram will crop it, and that may well be what the locator wants.
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => reject(new Error("not an image"))
        img.src = URL.createObjectURL(file)
      })
      const ratio = dims.w / dims.h
      if (Math.abs(ratio - 9 / 16) > 0.02) {
        setAspectWarning(`This image is ${dims.w}×${dims.h} (${ratio.toFixed(2)}:1). Reels covers are 9:16 — Instagram will crop it.`)
      }

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")
      // The storage policy requires the first path segment to be auth.uid(); read it rather than
      // trusting a prop, so an upload can never land outside the caller's own folder.
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error("not signed in")
      const path = `${ownerId}/${p.contentId}/covers/${p.postId}-${Date.now()}.${ext}`
      const up = await supabase.storage.from("social-media").upload(path, file, { contentType: file.type || "image/jpeg", upsert: true })
      if (up.error) throw new Error(up.error.message)

      const signed = await supabase.storage.from("social-media").createSignedUrl(path, 60 * 30)
      setCoverPath(path)
      setCoverUrl(signed.data?.signedUrl ?? null)
      await patch({ coverStoragePath: path })
    } catch {
      setError("Couldn’t upload that cover.")
    } finally {
      setBusy(false)
    }
  }

  const label = "text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]"

  return (
    <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className={label}>Reel Cover</div>
        <div className="text-[11px] text-[var(--crm-text-muted)]">
          {effective === "custom" ? "Custom cover" : effective === "offset" ? `Frame at ${fmtTime(offsetMs!)}` : "Instagram picks"}
        </div>
      </div>

      {/* The re-render hint. Advisory only — it never blocks publishing, because a shifted cover is
          a judgement call the locator makes, not an error we can detect. */}
      {p.coverMayHaveShifted && offsetMs != null && (
        <div className="text-[11.5px] text-amber-300">
          Cover may have changed after re-render — review before publishing.
        </div>
      )}

      {!p.renderReady ? (
        <div className="text-[11.5px] text-[var(--crm-text-muted)]">
          Render the video first — the cover frame is taken from the rendered Reel, so it matches
          what Instagram receives.
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {/* SELECT FRAME — primary */}
          <div className="flex-1 min-w-[220px]">
            <video
              ref={videoRef}
              src={p.renderedUrl ?? undefined}
              preload="metadata"
              muted
              playsInline
              crossOrigin="anonymous"
              className="w-full max-w-[150px] rounded-lg border border-[var(--crm-border)]"
              onLoadedMetadata={(e) => setDurationMs(Math.floor(e.currentTarget.duration * 1000))}
              onSeeked={captureFrame}
            />
            <input
              type="range"
              min={0}
              max={Math.max(0, durationMs)}
              step={100}
              value={offsetMs ?? 0}
              onChange={(e) => onScrub(Number(e.target.value))}
              className="w-full mt-2 cursor-pointer"
              aria-label="Cover frame position"
            />
            <div className="flex items-center gap-2 mt-1">
              <button type="button" disabled={busy || durationMs === 0}
                onClick={() => patch({ coverThumbOffsetMs: offsetMs ?? 0, coverStoragePath: null }).then(() => { setCoverPath(null); setCoverUrl(null) })}
                className="crm-cta px-3 py-1.5 rounded-lg text-[11.5px] font-semibold disabled:opacity-50">
                Use this frame
              </button>
              {offsetMs != null && (
                <button type="button" disabled={busy}
                  onClick={() => patch({ coverThumbOffsetMs: null }).then(() => setOffsetMs(null))}
                  className="text-[11.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] disabled:opacity-50">
                  Clear frame
                </button>
              )}
            </div>
          </div>

          {/* CUSTOM COVER — secondary */}
          <div className="flex-1 min-w-[180px]">
            <div className={label}>Custom cover (optional)</div>
            {(coverUrl || frameDataUrl) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPath ? coverUrl! : frameDataUrl!} alt="Cover preview"
                className="mt-1 w-full max-w-[110px] rounded-lg border border-[var(--crm-border)]" />
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f) }} />
            <div className="flex items-center gap-2 mt-1.5">
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] disabled:opacity-50">
                Upload image
              </button>
              {coverPath && (
                <button type="button" disabled={busy}
                  onClick={() => patch({ coverStoragePath: null }).then(() => { setCoverPath(null); setCoverUrl(null) })}
                  className="text-[11.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] disabled:opacity-50">
                  Remove
                </button>
              )}
            </div>
            <div className="text-[10.5px] text-[var(--crm-text-muted)] mt-1">Recommended 9:16.</div>
            {coverPath && <div className="text-[10.5px] text-[var(--crm-text-muted)] mt-0.5">A custom cover overrides the selected frame.</div>}
          </div>
        </div>
      )}

      {aspectWarning && <div className="text-[11.5px] text-amber-300">{aspectWarning}</div>}
      {error && <div className="text-[11.5px] text-[#c0264b]">{error}</div>}
      {saved && <div className="text-[11.5px] text-emerald-500">Cover saved.</div>}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
