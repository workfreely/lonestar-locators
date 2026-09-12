"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { POST_STATUS_LABEL, type PostStatus } from "@/lib/social/postStatus"
import { POST_TYPES_BY_PLATFORM, POST_TYPE_LABEL, previewAspectClass } from "@/lib/social/postTypes"
import { buildHashtags, normalizeHashtag } from "@/lib/social/hashtags"
import { overlayPreviewStyle } from "@/lib/social/overlaySpec"

// Social Autopilot Post Composer. Auto-prepared, fully-editable fields (overlay headline/
// subheadline, Instagram caption, hashtags, music) → server-side FFmpeg render → FAITHFUL
// FINAL PREVIEW that plays the real rendered derivative (overlay burned in + chosen audio) →
// READY TO PUBLISH. NO Instagram publish here. Source stays immutable; the derivative has its
// own storage identity.

type Post = {
  id: string
  platform: string
  postType: string
  postName: string | null
  caption: string | null
  overlayHeadline: string | null
  overlaySubheadline: string | null
  hashtags: string[]
  audioChoice: string
  renderStatus: string
  renderError: string | null
  status: PostStatus
  scheduledAt: string | null
  source: { displayName: string | null; propertyName: string | null; market: string | null; originalFilename: string | null; kind: string | null } | null
  previewUrl: string | null
  renderedPreviewUrl: string | null
}

const AUDIO_OPTIONS: { key: string; label: string; disabled?: boolean; note?: string }[] = [
  { key: "original", label: "Original Audio" },
  { key: "none", label: "No Music" },
  { key: "lb_track", label: "Locator Beast Music", disabled: true, note: "Coming soon" },
]

function splitLocal(iso: string | null) {
  if (!iso) return { date: "", time: "" }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: "", time: "" }
  const pad = (n: number) => String(n).padStart(2, "0")
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
const combineLocal = (date: string, time: string) => (date && time && !isNaN(new Date(`${date}T${time}`).getTime()) ? new Date(`${date}T${time}`).toISOString() : null)

export default function PostEditor({ postId }: { postId: string }) {
  const router = useRouter()
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rendering, setRendering] = useState(false)

  const [postName, setPostName] = useState("")
  const [postType, setPostType] = useState("reel")
  const [headline, setHeadline] = useState("")
  const [subheadline, setSubheadline] = useState("")
  const [caption, setCaption] = useState("")
  const [hashtags, setHashtags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [audioChoice, setAudioChoice] = useState("original")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}`, { headers: { Accept: "application/json" } })
      if (!res.ok) {
        setError(res.status === 404 ? "Post not found." : res.status === 403 ? "Not authorized." : "Couldn't load the post.")
        return
      }
      const p = (await res.json()) as Post
      setPost(p)
      setPostName(p.postName ?? "")
      setPostType(p.postType || "reel")
      setHeadline(p.overlayHeadline ?? "")
      setSubheadline(p.overlaySubheadline ?? "")
      setCaption(p.caption ?? "")
      setHashtags(Array.isArray(p.hashtags) ? p.hashtags : [])
      setAudioChoice(p.audioChoice || "original")
      const { date: d, time: t } = splitLocal(p.scheduledAt)
      setDate(d)
      setTime(t)
    } catch {
      setError("Couldn't load the post.")
    }
  }, [postId])
  useEffect(() => {
    void load()
  }, [load])

  const fieldsBody = useCallback(
    () => ({ postName, postType, caption, overlayHeadline: headline, overlaySubheadline: subheadline, hashtags, audioChoice }),
    [postName, postType, caption, headline, subheadline, hashtags, audioChoice],
  )

  const patch = useCallback(
    async (extra: Record<string, unknown>, successMsg: string | null) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fieldsBody(), ...extra }),
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          setError(j.error === "valid scheduledAt required" ? "Pick a date and time to schedule." : "Couldn't save.")
          return false
        }
        if (successMsg) setNotice(successMsg)
        return true
      } finally {
        setBusy(false)
      }
    },
    [postId, fieldsBody],
  )

  const saveDraft = async () => {
    if (await patch({ scheduledAt: combineLocal(date, time) ?? "" }, "Draft saved.")) await load()
  }
  const schedule = async () => {
    const iso = combineLocal(date, time)
    if (!iso) return setError("Pick a date and time to schedule.")
    if (await patch({ intent: "schedule", scheduledAt: iso }, "Scheduled.")) router.push("/admin/social-autopilot/queue")
  }
  const backToDraft = async () => {
    if (await patch({ intent: "unschedule" }, "Moved back to Draft.")) await load()
  }
  const duplicate = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}/duplicate`, { method: "POST" })
      if (!res.ok) return setError("Couldn't duplicate.")
      const j = (await res.json()) as { id?: string }
      if (j.id) router.push(`/admin/social-autopilot/posts/${encodeURIComponent(j.id)}`)
    } finally {
      setBusy(false)
    }
  }, [postId, router])

  // Render: persist current fields, then run the server FFmpeg render (synchronous), then
  // reload so the faithful final preview plays the rendered derivative.
  const render = useCallback(async () => {
    setRendering(true)
    setError(null)
    setNotice(null)
    try {
      const saved = await patch({ scheduledAt: combineLocal(date, time) ?? "" }, null)
      if (!saved) return
      const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}/render`, { method: "POST" })
      if (!res.ok) {
        setError("Render failed. Check the video and try again.")
        await load()
        return
      }
      setNotice("Rendered. Review the final preview below.")
      await load()
    } catch {
      setError("Render failed.")
      await load()
    } finally {
      setRendering(false)
    }
  }, [postId, patch, date, time, load])

  const addTag = (raw: string) => {
    const t = normalizeHashtag(raw)
    if (!t) return
    setHashtags((prev) => (prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]))
    setTagInput("")
  }
  const suggestTags = () => setHashtags(buildHashtags(post?.source?.market, 8))

  const control = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const fieldLabel = "text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]"
  const btn = "text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const primaryBtn = "text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"

  if (error && !post) {
    return (
      <div>
        <button type="button" className={btn} onClick={() => router.push("/admin/social-autopilot/queue")}>← Back to Queue</button>
        <div className="mt-3 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center text-[13px] text-[var(--crm-text-secondary)]">{error}</div>
      </div>
    )
  }
  if (!post) return <div className="text-[13px] text-[var(--crm-text-secondary)] py-10 text-center">Loading…</div>

  const types = POST_TYPES_BY_PLATFORM[post.platform] ?? ["reel", "feed", "story"]
  const aspect = previewAspectClass(post.platform, postType)
  const rendered = post.renderStatus === "ready" && !!post.renderedPreviewUrl
  const ov = overlayPreviewStyle()

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5 flex-wrap">
        <button type="button" className={btn} onClick={() => router.push("/admin/social-autopilot/queue")}>← Back to Queue</button>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[var(--crm-card)] text-[var(--crm-text-secondary)]">{POST_STATUS_LABEL[post.status] ?? post.status}</span>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-[var(--crm-border)] text-[var(--crm-text-secondary)]">Instagram · {POST_TYPE_LABEL[postType] ?? postType}</span>
        {rendered && <span className="text-[11.5px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">READY TO PUBLISH</span>}
        <button type="button" className={`${btn} ml-auto`} disabled={busy || rendering} onClick={() => void duplicate()}>Duplicate</button>
      </div>

      {(error || notice) && (
        <div className={`mb-3 rounded-lg border px-4 py-2.5 text-[13px] ${error ? "border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)]" : "border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"}`}>
          {error || notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-5">
        {/* Preview column */}
        <div>
          <div className={`relative ${aspect} rounded-2xl overflow-hidden border border-[var(--crm-border)] bg-black`}>
            {rendered ? (
              // FAITHFUL FINAL PREVIEW — the real rendered derivative (overlay burned in + audio).
              <video src={post.renderedPreviewUrl!} controls playsInline preload="metadata" className="w-full h-full object-cover" />
            ) : post.previewUrl ? (
              <>
                <video src={post.previewUrl} controls muted playsInline preload="metadata" className="w-full h-full object-cover" />
                {/* Pre-render APPROXIMATION overlay (CSS) — replaced by the burned-in render. */}
                {(headline || subheadline) && (
                  <div className="pointer-events-none absolute inset-0" aria-hidden>
                    {headline && (
                      <div style={{ position: "absolute", top: `${ov.headlineTopPct}%`, left: `${ov.sideMarginPct}%`, right: `${ov.sideMarginPct}%`, textAlign: "center", color: "white", fontWeight: 800, lineHeight: 1.05, fontSize: `${ov.headlineFontPct}vh`, textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>
                        {headline.toUpperCase()}
                      </div>
                    )}
                    {subheadline && (
                      <div style={{ position: "absolute", top: `${ov.subTopPct}%`, left: `${ov.sideMarginPct}%`, right: `${ov.sideMarginPct}%`, textAlign: "center", color: "white", fontWeight: 700, fontSize: `${ov.subFontPct}vh`, textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>
                        {subheadline}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[12px] text-[var(--crm-text-muted)]">No preview</div>
            )}
          </div>
          <div className="mt-1.5 text-[10.5px] text-[var(--crm-text-muted)]">
            {rendered ? "Final rendered video — overlay burned in, audio applied." : "Approximation. Render to see the exact final video."}
          </div>

          <button type="button" className={`${primaryBtn} mt-2 w-full`} disabled={rendering || busy} onClick={() => void render()}>
            {rendering ? "Rendering…" : rendered ? "Re-render" : "Render final video"}
          </button>
          {post.renderStatus === "error" && post.renderError && <div className="mt-1 text-[11px] text-red-500">Last render error: {post.renderError}</div>}

          {/* Publish is the NEXT checkpoint — visible target, intentionally disabled here. */}
          <button type="button" className="mt-2 w-full text-[12.5px] font-semibold px-3.5 py-2 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-muted)] opacity-70 cursor-not-allowed" disabled title="Publishing is enabled in the next checkpoint">
            Publish Now
          </button>
        </div>

        {/* Fields column */}
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className={fieldLabel}>Internal post name</span>
            <input className={`${control} mt-1`} value={postName} onChange={(e) => setPostName(e.target.value)} placeholder="Private — not published" />
          </label>

          <div className="block">
            <span className={fieldLabel}>Instagram post type</span>
            <div className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[var(--crm-border)] p-0.5 bg-[var(--crm-panel)]">
              {types.map((t) => (
                <button key={t} type="button" onClick={() => setPostType(t)} className={"text-[12.5px] font-semibold px-3 py-1.5 rounded-md transition-colors " + (postType === t ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")}>
                  {POST_TYPE_LABEL[t] ?? t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={fieldLabel}>Overlay headline</span>
              <input className={`${control} mt-1`} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Burned into the video" />
            </label>
            <label className="block">
              <span className={fieldLabel}>Overlay subheadline</span>
              <input className={`${control} mt-1`} value={subheadline} onChange={(e) => setSubheadline(e.target.value)} placeholder="Optional" />
            </label>
          </div>

          <div className="block">
            <span className={fieldLabel}>Music / audio</span>
            <div className="mt-1 flex items-center gap-1 flex-wrap">
              {AUDIO_OPTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  disabled={a.disabled}
                  onClick={() => !a.disabled && setAudioChoice(a.key)}
                  title={a.note}
                  className={"text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border transition-colors " + (audioChoice === a.key ? "border-[var(--crm-text-primary)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]" : "border-[var(--crm-border)] text-[var(--crm-text-secondary)]") + (a.disabled ? " opacity-60 cursor-not-allowed" : "")}
                >
                  {a.label}{a.note ? ` · ${a.note}` : ""}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className={fieldLabel}>Instagram caption</span>
            <textarea className={`${control} mt-1 min-h-[120px]`} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Public caption" />
          </label>

          <div className="block">
            <div className="flex items-center justify-between">
              <span className={fieldLabel}>Hashtags <span className="text-[var(--crm-text-muted)] normal-case">({hashtags.length})</span></span>
              <button type="button" className="text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]" onClick={suggestTags}>Suggest from market</button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] p-2 min-h-[40px]">
              {hashtags.map((t, i) => (
                <span key={`${t}-${i}`} className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[var(--crm-panel)] border border-[var(--crm-border)] text-[var(--crm-text-primary)]">
                  {t}
                  <button type="button" aria-label={`Remove ${t}`} className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => setHashtags((prev) => prev.filter((_, idx) => idx !== i))}>×</button>
                </span>
              ))}
              <input
                className="flex-1 min-w-[120px] bg-transparent text-[12.5px] text-[var(--crm-text-primary)] outline-none"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); addTag(tagInput) } }}
                onBlur={() => tagInput.trim() && addTag(tagInput)}
                placeholder="Add hashtag…"
              />
            </div>
            <span className="text-[10.5px] text-[var(--crm-text-muted)]">Added to the caption when published (kept separate here).</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={fieldLabel}>Scheduled date</span>
              <input type="date" className={`${control} mt-1`} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block">
              <span className={fieldLabel}>Scheduled time</span>
              <input type="time" className={`${control} mt-1`} value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <button type="button" className={primaryBtn} disabled={busy || rendering} onClick={() => void saveDraft()}>{busy ? "Saving…" : "Save Draft"}</button>
            <button type="button" className={primaryBtn} disabled={busy || rendering} onClick={() => void schedule()}>Schedule</button>
            {post.status === "scheduled" && <button type="button" className={btn} disabled={busy} onClick={() => void backToDraft()}>Move back to Draft</button>}
          </div>
          <p className="text-[11px] text-[var(--crm-text-muted)]">Render produces the final 9:16 video with the overlay burned in and your audio choice. Nothing is published to Instagram in this checkpoint.</p>
        </div>
      </div>
    </div>
  )
}
