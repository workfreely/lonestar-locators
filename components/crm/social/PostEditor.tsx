"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { POST_STATUS_LABEL, type PostStatus } from "@/lib/social/postStatus"
import { POST_TYPES_BY_PLATFORM, POST_TYPE_LABEL, previewAspectClass } from "@/lib/social/postTypes"

// Native Locator Beast post editor for a single draft/post (Instagram-first). Source video
// preview (the LARGE preview — the primary place to inspect the media) + internal post name
// + Instagram post type (Reel | Feed Post | Story) + caption + on-video text foundation +
// scheduled date/time, with Save Draft, Schedule, and Duplicate. Scheduling is INTERNAL
// persistence only — nothing is published externally. Internal Library property metadata is
// shown for context ONLY and is never auto-inserted into the public caption.

type Post = {
  id: string
  platform: string
  postType: string
  postName: string | null
  caption: string | null
  onVideoText: string | null
  status: PostStatus
  scheduledAt: string | null
  source: { displayName: string | null; propertyName: string | null; market: string | null; originalFilename: string | null; kind: string | null } | null
  previewUrl: string | null
}

function splitLocal(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: "", time: "" }
  const pad = (n: number) => String(n).padStart(2, "0")
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
function combineLocal(date: string, time: string): string | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}
// A YYYY-MM-DD prefill passed from the Calendar's "Create Post" on a specific date.
function prefillDateFromUrl(): string {
  if (typeof window === "undefined") return ""
  const v = new URLSearchParams(window.location.search).get("date") ?? ""
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ""
}

export default function PostEditor({ postId }: { postId: string }) {
  const router = useRouter()
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [postName, setPostName] = useState("")
  const [postType, setPostType] = useState("reel")
  const [caption, setCaption] = useState("")
  const [onVideoText, setOnVideoText] = useState("")
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
      setCaption(p.caption ?? "")
      setOnVideoText(p.onVideoText ?? "")
      const { date: d, time: t } = splitLocal(p.scheduledAt)
      // If not yet scheduled, honor a date prefill passed from the Calendar.
      setDate(d || (p.scheduledAt ? "" : prefillDateFromUrl()))
      setTime(t)
    } catch {
      setError("Couldn't load the post.")
    }
  }, [postId])
  useEffect(() => {
    void load()
  }, [load])

  const patch = useCallback(
    async (extra: Record<string, unknown>, successMsg: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postName, postType, caption, onVideoText, ...extra }),
        })
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          setError(j.error === "valid scheduledAt required" ? "Pick a date and time to schedule." : "Couldn't save.")
          return false
        }
        setNotice(successMsg)
        await load()
        return true
      } finally {
        setBusy(false)
      }
    },
    [postId, postName, postType, caption, onVideoText, load],
  )

  const saveDraft = () => patch({ scheduledAt: combineLocal(date, time) ?? "" }, "Draft saved.")
  const schedule = async () => {
    const iso = combineLocal(date, time)
    if (!iso) {
      setError("Pick a date and time to schedule.")
      return
    }
    const ok = await patch({ intent: "schedule", scheduledAt: iso }, "Scheduled.")
    if (ok) router.push("/admin/social-autopilot/queue")
  }
  const backToDraft = () => patch({ intent: "unschedule" }, "Moved back to Draft.")
  const duplicate = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}/duplicate`, { method: "POST" })
      if (!res.ok) {
        setError("Couldn't duplicate.")
        return
      }
      const json = (await res.json()) as { id?: string }
      if (json.id) router.push(`/admin/social-autopilot/posts/${encodeURIComponent(json.id)}`)
    } finally {
      setBusy(false)
    }
  }, [postId, router])

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

  const statusLabel = POST_STATUS_LABEL[post.status] ?? post.status
  const types = POST_TYPES_BY_PLATFORM[post.platform] ?? ["reel", "feed", "story"]
  const aspect = previewAspectClass(post.platform, postType)

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5 flex-wrap">
        <button type="button" className={btn} onClick={() => router.push("/admin/social-autopilot/queue")}>← Back to Queue</button>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[var(--crm-card)] text-[var(--crm-text-secondary)]">{statusLabel}</span>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-[var(--crm-border)] text-[var(--crm-text-secondary)]">Instagram · {POST_TYPE_LABEL[postType] ?? postType}</span>
        <button type="button" className={`${btn} ml-auto`} disabled={busy} onClick={() => void duplicate()}>Duplicate</button>
      </div>

      {(error || notice) && (
        <div className={`mb-3 rounded-lg border px-4 py-2.5 text-[13px] ${error ? "border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)]" : "border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"}`}>
          {error || notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-5">
        {/* LARGE source preview (primary media inspection) — framing follows the post type. */}
        <div>
          <div className={`relative ${aspect} rounded-2xl overflow-hidden border border-[var(--crm-border)] bg-black transition-all`}>
            {post.previewUrl ? (
              post.source?.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.previewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <video src={post.previewUrl} controls muted playsInline preload="metadata" className="w-full h-full object-cover" />
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[12px] text-[var(--crm-text-muted)]">No preview</div>
            )}
          </div>
          <div className="mt-1.5 text-[10.5px] text-[var(--crm-text-muted)]">{POST_TYPE_LABEL[postType] ?? postType} framing (preview foundation)</div>
          <div className="mt-2 text-[11.5px] text-[var(--crm-text-muted)]" title={post.source?.originalFilename ?? undefined}>
            <div className="font-semibold text-[var(--crm-text-secondary)] truncate">{post.source?.displayName ?? "Source video"}</div>
            {(post.source?.propertyName || post.source?.market) && (
              <div className="truncate">{[post.source?.propertyName, post.source?.market].filter(Boolean).join(" · ")}</div>
            )}
            <div className="mt-1 italic">Internal only — not added to the caption.</div>
          </div>
        </div>

        {/* Editor fields */}
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className={fieldLabel}>Internal post name</span>
            <input className={`${control} mt-1`} value={postName} onChange={(e) => setPostName(e.target.value)} placeholder="Private — for your organization only" />
          </label>

          <div className="block">
            <span className={fieldLabel}>Instagram post type</span>
            <div className="mt-1 inline-flex items-center gap-1 rounded-lg border border-[var(--crm-border)] p-0.5 bg-[var(--crm-panel)]">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPostType(t)}
                  className={
                    "text-[12.5px] font-semibold px-3 py-1.5 rounded-md transition-colors " +
                    (postType === t ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")
                  }
                >
                  {POST_TYPE_LABEL[t] ?? t}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className={fieldLabel}>Caption</span>
            <textarea className={`${control} mt-1 min-h-[120px]`} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Public caption. Nothing is added automatically." />
          </label>
          <label className="block">
            <span className={fieldLabel}>On-video text (foundation)</span>
            <input className={`${control} mt-1`} value={onVideoText} onChange={(e) => setOnVideoText(e.target.value)} placeholder="Text to burn onto the video later (not rendered yet)" />
            <span className="text-[10.5px] text-[var(--crm-text-muted)]">Stored now; the renderer arrives in a later checkpoint.</span>
          </label>
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
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => void saveDraft()}>{busy ? "Saving…" : "Save Draft"}</button>
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => void schedule()}>Schedule</button>
            {post.status === "scheduled" && (
              <button type="button" className={btn} disabled={busy} onClick={() => void backToDraft()}>Move back to Draft</button>
            )}
          </div>
          <p className="text-[11px] text-[var(--crm-text-muted)]">Scheduling saves the time and adds this post to the Queue and Calendar. It does not publish to Instagram.</p>
        </div>
      </div>
    </div>
  )
}
