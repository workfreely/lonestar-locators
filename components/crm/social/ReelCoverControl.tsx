"use client"

import { useCallback, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"

/**
 * SOCIAL BEAST — Reel cover selection, as a compact strip under the EXISTING preview.
 *
 * This deliberately renders NO video of its own. The editor already shows the Reel on the left,
 * and that player is the rendered derivative whenever render_status='ready' — the exact file
 * Instagram receives, and therefore the exact thing a thumb_offset indexes. A second player was
 * duplicate pixels and a duplicate scrubber for a position the user had already chosen.
 *
 * So the parent passes `getCurrentMs`, which reads the live preview's currentTime at click time.
 * Scrub or pause the real preview, then press the button.
 *
 * Backend behaviour is unchanged: same columns, same precedence (a custom cover wins), same
 * re-render stamp. Nothing here re-renders anything — a cover says which frame to SHOW.
 */

type Props = {
  postId: string
  contentId: string
  /** Reads the CURRENT playback position of the editor's existing preview, in ms. */
  getCurrentMs: () => number | null
  /** True when the preview is showing a current rendered derivative. */
  renderReady: boolean
  offsetMs: number | null
  coverPath: string | null
  coverUrl: string | null
  /** The chosen frame refers to a different render than the current one. */
  mayHaveShifted?: boolean
  onSaved?: () => void
}

const fmt = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${Math.floor((ms % 1000) / 100)}`

export default function ReelCoverControl(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const patch = useCallback(async (body: Record<string, unknown>, okMsg?: string) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const res = await fetch(`/api/admin/social-autopilot/posts/${p.postId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(String(res.status))
      if (okMsg) { setMsg(okMsg); setTimeout(() => setMsg(null), 2200) }
      p.onSaved?.()
    } catch {
      setErr("Couldn’t save the cover.")
    } finally {
      setBusy(false)
    }
  }, [p])

  const useCurrentFrame = () => {
    const ms = p.getCurrentMs()
    if (ms == null) { setErr("Play or scrub the preview first."); return }
    void patch({ coverThumbOffsetMs: Math.max(0, Math.round(ms)), coverStoragePath: null })
  }

  const upload = async (file: File) => {
    setBusy(true); setErr(null); setWarn(null)
    try {
      // 9:16 is the Reels cover shape. A different ratio WARNS and still uploads — Instagram crops
      // it, and that may be exactly what was intended.
      const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
        const img = new Image()
        img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => rej(new Error("not an image"))
        img.src = URL.createObjectURL(file)
      })
      const ratio = dims.w / dims.h
      if (Math.abs(ratio - 9 / 16) > 0.02) {
        setWarn(`${dims.w}×${dims.h} isn’t 9:16 — Instagram will crop it.`)
      }
      // The storage policy keys on auth.uid(), so read it rather than trusting a prop.
      const { data: auth } = await supabase.auth.getUser()
      const ownerId = auth.user?.id
      if (!ownerId) throw new Error("not signed in")
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")
      const path = `${ownerId}/${p.contentId}/covers/${p.postId}-${Date.now()}.${ext}`
      const up = await supabase.storage.from("social-media").upload(path, file, { contentType: file.type || "image/jpeg", upsert: true })
      if (up.error) throw new Error(up.error.message)
      await patch({ coverStoragePath: path }, "Custom cover saved.")
    } catch {
      setErr("Couldn’t upload that cover.")
    } finally {
      setBusy(false)
    }
  }

  const link = "text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] disabled:opacity-50"
  // Custom cover WINS — mirrors the publish-time precedence so the editor states what will be sent.
  const custom = !!p.coverPath

  return (
    <div className="mt-2 flex flex-col gap-1">
      {!p.renderReady ? (
        <div className="text-[11px] text-[var(--crm-text-muted)]">Render video to choose a cover frame.</div>
      ) : custom ? (
        // A custom cover overrides the frame, so offering the frame action here would mislead.
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.coverUrl && <img src={p.coverUrl} alt="" className="w-7 h-12 object-cover rounded border border-[var(--crm-border)] flex-none" />}
          <span className="text-[11px] text-[var(--crm-text-primary)] truncate">✓ Custom cover</span>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={link}>Replace</button>
          <span className="text-[var(--crm-text-muted)]">·</span>
          <button type="button" disabled={busy} onClick={() => void patch({ coverStoragePath: null })} className={link}>Remove</button>
        </div>
      ) : p.offsetMs != null ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-[var(--crm-text-primary)]">✓ Reel cover: {fmt(p.offsetMs)}</span>
          <button type="button" disabled={busy} onClick={useCurrentFrame} className={link}
            title="Scrub the preview to another frame, then click again">Change</button>
          <span className="text-[var(--crm-text-muted)]">·</span>
          <button type="button" disabled={busy} onClick={() => void patch({ coverThumbOffsetMs: null })} className={link}>Clear</button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={useCurrentFrame}
          className="self-start text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] disabled:opacity-50">
          Use current frame as Reel cover
        </button>
      )}

      {/* Custom cover is secondary: one link, no permanent panel. */}
      {p.renderReady && !custom && (
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={`${link} self-start`}>
          Upload custom cover
        </button>
      )}

      {p.mayHaveShifted && p.offsetMs != null && !custom && (
        <div className="text-[11px] text-amber-300">Cover may have changed after re-render — review before publishing.</div>
      )}
      {warn && <div className="text-[11px] text-amber-300">{warn}</div>}
      {err && <div className="text-[11px] text-[#c0264b]">{err}</div>}
      {msg && <div className="text-[11px] text-emerald-500">{msg}</div>}

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = "" }} />
    </div>
  )
}
