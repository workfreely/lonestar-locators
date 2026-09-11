"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { POST_STATUS_LABEL, type PostStatus } from "@/lib/social/postStatus"

// Native Locator Beast post editor for a single draft/post (Instagram-first). Source video
// preview + internal post name + caption + on-video text foundation + scheduled date/time,
// with Save Draft and Schedule. Scheduling is INTERNAL persistence only — nothing is ever
// published externally. Internal Library property metadata is shown for context ONLY and is
// never auto-inserted into the public caption.

type Post = {
  id: string
  platform: string
  postName: string | null
  caption: string | null
  onVideoText: string | null
  status: PostStatus
  scheduledAt: string | null
  source: { displayName: string | null; propertyName: string | null; market: string | null; originalFilename: string | null; kind: string | null } | null
  previewUrl: string | null
}

// Split an ISO instant into local <input type=date> / <input type=time> values.
function splitLocal(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" }
  const d = new Date(iso)
  if (isNaN(d.getTime())) return { date: "", time: "" }
  const pad = (n: number) => String(n).padStart(2, "0")
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}
// Combine local date+time into an ISO instant (or null when incomplete).
function combineLocal(date: string, time: string): string | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export default function PostEditor({ postId }: { postId: string }) {
  const router = useRouter()
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [postName, setPostName] = useState("")
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
      setCaption(p.caption ?? "")
      setOnVideoText(p.onVideoText ?? "")
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

  const patch = useCallback(
    async (extra: Record<string, unknown>, successMsg: string) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postName, caption, onVideoText, ...extra }),
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
    [postId, postName, caption, onVideoText, load],
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

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5 flex-wrap">
        <button type="button" className={btn} onClick={() => router.push("/admin/social-autopilot/queue")}>← Back to Queue</button>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[var(--crm-card)] text-[var(--crm-text-secondary)]">{statusLabel}</span>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-[var(--crm-border)] text-[var(--crm-text-secondary)]">Instagram</span>
      </div>

      {(error || notice) && (
        <div className={`mb-3 rounded-lg border px-4 py-2.5 text-[13px] ${error ? "border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)]" : "border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"}`}>
          {error || notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5">
        {/* Source preview (read-only) + private context */}
        <div>
          <div className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-[var(--crm-border)] bg-black">
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
          {/* Internal metadata — CONTEXT ONLY, never auto-added to the public caption. */}
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
