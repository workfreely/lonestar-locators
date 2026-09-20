"use client"

import { useCallback, useEffect, useState } from "react"
import { SiTiktok } from "react-icons/si"

// Minimal TikTok Direct Post confirmation (Sandbox MVP). Opens for a READY Social Beast post,
// loads Creator Info + the exact caption/video via ONE server dry-run call, lets the admin confirm
// privacy/interaction options populated ONLY from Creator Info, and — on explicit "Post to TikTok"
// — fires the real Direct Post. Tokens never touch the client. Reuses CRM tokens/styles; not an
// editor. While the app is unaudited, TikTok only accepts SELF_ONLY (private) — respected here.

type Capabilities = {
  privacyLevelOptions: string[]
  commentDisabled: boolean
  duetDisabled: boolean
  stitchDisabled: boolean
  maxVideoPostDurationSec: number
}
type DryRun = {
  ready: boolean
  transferMethod: string
  creator: { username: string; nickname: string; avatarUrl: string }
  capabilities: Capabilities
  unaudited: boolean
  title: string
  titleLength: number
  videoSize: number
}

const PRIVACY_LABEL: Record<string, string> = {
  SELF_ONLY: "Private (only me)",
  PUBLIC_TO_EVERYONE: "Public",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
}

const PUBLISH = "/api/integrations/tiktok/publish"
const STATUS = "/api/integrations/tiktok/publish/status"
// Existing SAFE render-only action: produces the 9:16 derivative (render_status→ready),
// leaves the post's lifecycle status unchanged, and does NOT publish to Instagram.
const RENDER = (postId: string) => `/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}/render`

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export default function TikTokPostConfirm({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DryRun | null>(null)

  const [privacy, setPrivacy] = useState<string>("SELF_ONLY")
  const [allowComment, setAllowComment] = useState(true)
  const [allowDuet, setAllowDuet] = useState(true)
  const [allowStitch, setAllowStitch] = useState(true)

  const [posting, setPosting] = useState(false)
  const [result, setResult] = useState<{ publishId: string; status: string; failReason: string | null } | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [needsRender, setNeedsRender] = useState(false) // post has no current render → offer Render now
  const [rendering, setRendering] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null); setData(null); setResult(null); setNeedsRender(false)
    try {
      // Single dry-run: resolves token + Creator Info + caption + video size WITHOUT posting.
      const res = await fetch(PUBLISH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, mode: "dry_run", privacyLevel: "SELF_ONLY" }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ready) {
        // A post with no current render isn't an error — offer the safe render-only action.
        if (json?.error === "not_ready") { setNeedsRender(true); return }
        setError(json?.error === "not_connected" ? "TikTok isn't connected." : "Couldn't prepare the TikTok post.")
        return
      }
      const d = json as DryRun
      setData(d)
      // Initialize selectors from Creator Info: default SELF_ONLY (only value allowed while
      // unaudited); interaction toggles default ON unless the creator disabled them.
      setPrivacy(d.capabilities.privacyLevelOptions.includes("SELF_ONLY") ? "SELF_ONLY" : d.capabilities.privacyLevelOptions[0] ?? "SELF_ONLY")
      setAllowComment(!d.capabilities.commentDisabled)
      setAllowDuet(!d.capabilities.duetDisabled)
      setAllowStitch(!d.capabilities.stitchDisabled)
    } catch {
      setError("Couldn't reach TikTok.")
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => { if (open) void load() }, [open, load])

  // Render the draft's current derivative via the existing safe render route (no Instagram
  // publish; status stays a draft), then reload the dry-run so the video shows as ready.
  const doRender = async () => {
    setRendering(true); setError(null)
    try {
      const res = await fetch(RENDER(postId), { method: "POST" })
      if (!res.ok) { setError("Couldn't render this post. Please try again."); return }
      setNeedsRender(false)
      await load()
    } catch {
      setError("Couldn't render this post.")
    } finally {
      setRendering(false)
    }
  }

  const doPost = async () => {
    if (!data) return
    if (!confirm("Post this video to TikTok now? (Sandbox — private/SELF_ONLY)")) return
    setPosting(true); setError(null)
    try {
      const res = await fetch(PUBLISH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId, mode: "post", privacyLevel: privacy,
          disableComment: !allowComment, disableDuet: !allowDuet, disableStitch: !allowStitch,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.publishId) {
        setError(json?.detail ? `TikTok rejected the post: ${json.detail}` : "TikTok post failed.")
        return
      }
      setResult({ publishId: json.publishId, status: json.status, failReason: json.failReason ?? null })
    } catch {
      setError("Couldn't reach TikTok.")
    } finally {
      setPosting(false)
    }
  }

  const checkStatus = async () => {
    if (!result) return
    setStatusBusy(true)
    try {
      const res = await fetch(STATUS, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publishId: result.publishId }) })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.status) setResult({ ...result, status: json.status, failReason: json.failReason ?? null })
    } finally {
      setStatusBusy(false)
    }
  }

  if (!open) return null

  const btn = "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const btnPrimary = "text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
  const unaudited = !!data?.unaudited

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <SiTiktok size={16} className="text-[var(--crm-text-primary)]" aria-hidden />
          <h2 className="text-[14px] font-bold text-[var(--crm-text-primary)]">Post to TikTok</h2>
          <button type="button" aria-label="Close" className="ml-auto text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={onClose}>×</button>
        </div>

        {loading && <div className="mt-4 text-[12.5px] text-[var(--crm-text-muted)]">{rendering ? "Rendering video…" : "Loading TikTok account…"}</div>}
        {error && <div className="mt-3 text-[12.5px] text-amber-600 dark:text-amber-400">{error}</div>}

        {/* No current render → offer the safe render-only action (does NOT post to Instagram). */}
        {needsRender && !data && !loading && (
          <div className="mt-4 space-y-3">
            <div className="text-[12.5px] text-[var(--crm-text-secondary)]">This post hasn&apos;t been rendered yet. Render its video now to prepare the TikTok post — this only creates the video and does <span className="font-semibold">not</span> post to Instagram.</div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" className={btn} disabled={rendering} onClick={onClose}>Cancel</button>
              <button type="button" className={btnPrimary} disabled={rendering} onClick={() => void doRender()}>{rendering ? "Rendering…" : "Render video"}</button>
            </div>
          </div>
        )}

        {data && !result && (
          <div className="mt-3 space-y-3">
            {/* Account */}
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.creator.avatarUrl} alt="" width={32} height={32} className="rounded-full object-cover flex-none" style={{ width: 32, height: 32 }} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-[var(--crm-text-primary)] truncate">{data.creator.nickname}</div>
                <div className="text-[11.5px] text-[var(--crm-text-muted)] truncate">@{data.creator.username}</div>
              </div>
            </div>

            {/* Caption (existing Social Beast caption, read-only) */}
            <div>
              <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">Caption</span>
              <textarea readOnly value={data.title} rows={4} className="mt-1 w-full text-[12.5px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-2 resize-none" />
              <div className="text-[10.5px] text-[var(--crm-text-muted)] mt-0.5">{data.titleLength}/2200</div>
            </div>

            {/* Privacy — options come ONLY from Creator Info */}
            <div>
              <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">Privacy</span>
              <div className="mt-1 flex flex-col gap-1">
                {data.capabilities.privacyLevelOptions.map((opt) => {
                  const blocked = unaudited && opt !== "SELF_ONLY"
                  return (
                    <label key={opt} className={`flex items-center gap-2 text-[12.5px] ${blocked ? "opacity-45" : "text-[var(--crm-text-primary)]"}`}>
                      <input type="radio" name="tt-privacy" value={opt} checked={privacy === opt} disabled={blocked} onChange={() => setPrivacy(opt)} />
                      {PRIVACY_LABEL[opt] ?? opt}
                      {blocked && <span className="text-[10.5px] text-[var(--crm-text-muted)]">(Sandbox: private only)</span>}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Interactions — only when the creator permits them */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">Interactions</span>
              {data.capabilities.commentDisabled ? (
                <span className="text-[11.5px] text-[var(--crm-text-muted)]">Comments off (creator setting)</span>
              ) : (
                <label className="flex items-center gap-2 text-[12.5px] text-[var(--crm-text-primary)]"><input type="checkbox" checked={allowComment} onChange={(e) => setAllowComment(e.target.checked)} /> Allow comments</label>
              )}
              {data.capabilities.duetDisabled ? (
                <span className="text-[11.5px] text-[var(--crm-text-muted)]">Duet off (creator setting)</span>
              ) : (
                <label className="flex items-center gap-2 text-[12.5px] text-[var(--crm-text-primary)]"><input type="checkbox" checked={allowDuet} onChange={(e) => setAllowDuet(e.target.checked)} /> Allow Duet</label>
              )}
              {data.capabilities.stitchDisabled ? (
                <span className="text-[11.5px] text-[var(--crm-text-muted)]">Stitch off (creator setting)</span>
              ) : (
                <label className="flex items-center gap-2 text-[12.5px] text-[var(--crm-text-primary)]"><input type="checkbox" checked={allowStitch} onChange={(e) => setAllowStitch(e.target.checked)} /> Allow Stitch</label>
              )}
            </div>

            <div className="text-[11px] text-[var(--crm-text-muted)]">Video ready · {fmtBytes(data.videoSize)} · {data.transferMethod}</div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" className={btn} onClick={onClose}>Cancel</button>
              <button type="button" className={btnPrimary} disabled={posting} onClick={() => void doPost()}>{posting ? "Posting…" : "Post to TikTok"}</button>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            <div className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Direct Post submitted</div>
            <div className="text-[12.5px] text-[var(--crm-text-secondary)]">Status: <span className="font-semibold">{result.status}</span>{result.failReason ? ` · ${result.failReason}` : ""}</div>
            <div className="text-[11px] text-[var(--crm-text-muted)] font-mono break-all">publish_id: {result.publishId}</div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" className={btn} disabled={statusBusy} onClick={() => void checkStatus()}>{statusBusy ? "Checking…" : "Check status"}</button>
              <button type="button" className={btnPrimary} onClick={onClose}>Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
