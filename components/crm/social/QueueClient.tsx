"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { SiInstagram, SiTiktok, SiYoutube } from "react-icons/si"
import type { IconType } from "react-icons"
import { POST_STATUS_LABEL, type PostStatus } from "@/lib/social/postStatus"

// Social Autopilot → Queue (REAL post model). Shows this admin's posts that have not yet
// published, with compact status filters. Clicking a row opens the post editor. No sample
// data, no external publishing. Empty until posts are created from the Library.

type QueuePost = {
  id: string
  status: PostStatus
  platform: string
  postName: string | null
  scheduledAt: string | null
  source: { displayName: string | null; propertyName: string | null; market: string | null; originalFilename: string | null } | null
  previewUrl: string | null
  recurring?: boolean
}

// No generic "Needs Attention" filter — specific failure states (Render Failed, Publish Failed,
// Connection Issue) will be added when those workflows exist.
const FILTERS = ["All", "Drafts", "Ready", "Scheduled"] as const
type Filter = (typeof FILTERS)[number]
const FILTER_STATUS: Partial<Record<Filter, PostStatus>> = {
  Drafts: "draft",
  Ready: "ready",
  Scheduled: "scheduled",
}

const STATUS_STYLE: Record<PostStatus, string> = {
  draft: "text-[var(--crm-text-muted)] bg-[var(--crm-card)]",
  rendering: "text-amber-700 bg-amber-500/12 dark:text-amber-400",
  ready: "text-sky-700 bg-sky-500/12 dark:text-sky-400",
  scheduled: "text-emerald-700 bg-emerald-500/12 dark:text-emerald-400",
  publishing: "text-violet-700 bg-violet-500/12 dark:text-violet-400",
  needs_attention: "text-red-700 bg-red-500/12 dark:text-red-400",
  published: "text-[var(--crm-text-muted)] bg-[var(--crm-card)]",
}

// Platform label + icon, from the post's ACTUAL persisted platform (no hardcoded "Instagram").
const PLATFORM_META: Record<string, { label: string; Icon: IconType }> = {
  instagram: { label: "Instagram", Icon: SiInstagram },
  tiktok: { label: "TikTok", Icon: SiTiktok },
  youtube: { label: "YouTube", Icon: SiYoutube },
}
const platformMeta = (p: string | null | undefined) =>
  PLATFORM_META[(p ?? "").toLowerCase()] ?? { label: p ? p.charAt(0).toUpperCase() + p.slice(1) : "Instagram", Icon: SiInstagram }

const fmtWhen = (iso: string | null) => {
  if (!iso) return "Not scheduled"
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "Not scheduled" : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

export default function QueueClient() {
  const router = useRouter()
  const [posts, setPosts] = useState<QueuePost[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("All")
  const [cancelingId, setCancelingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/social-autopilot/posts?scope=queue", { headers: { Accept: "application/json" } })
      if (!res.ok) {
        setError(res.status === 403 ? "Not authorized." : "Couldn't load the queue.")
        setPosts([])
        return
      }
      const json = (await res.json()) as { items?: QueuePost[] }
      setPosts(Array.isArray(json.items) ? json.items : [])
    } catch {
      setError("Couldn't load the queue.")
      setPosts([])
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  // Cancel a scheduled occurrence → the EXISTING canonical unschedule (PATCH intent:"unschedule"):
  // scheduled_at = null, status = draft. Preserves the creative/source/caption/overlay/render;
  // deletes nothing and publishes nothing. Refreshes the Queue so it shows as no longer scheduled.
  const cancelScheduled = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (cancelingId) return
    setCancelingId(id)
    try {
      const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "unschedule" }),
      })
      if (res.ok) await load()
      else setError("Couldn't cancel the schedule. Please try again.")
    } catch {
      setError("Couldn't cancel the schedule. Please try again.")
    } finally {
      setCancelingId(null)
    }
  }, [cancelingId, load])

  const visible = useMemo(() => {
    const list = posts ?? []
    const want = FILTER_STATUS[filter]
    return want ? list.filter((p) => p.status === want) : list
  }, [posts, filter])

  const chip = (active: boolean) =>
    "text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors " +
    (active
      ? "border-[var(--crm-text-primary)] text-[var(--crm-text-primary)] bg-[var(--crm-card)]"
      : "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={chip(filter === f)} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[13px] text-[var(--crm-text-secondary)]">{error}</div>
      )}

      {posts === null ? (
        <div className="text-[13px] text-[var(--crm-text-secondary)] py-10 text-center">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center text-[13px] text-[var(--crm-text-secondary)]">
          {posts.length === 0 ? "No posts yet. Create a post from a Library video to start a draft." : "No posts match this filter."}
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-hidden divide-y divide-[var(--crm-border)]">
          {visible.map((p) => {
            const pm = platformMeta(p.platform)
            const openEditor = () => router.push(`/admin/social-autopilot/posts/${encodeURIComponent(p.id)}?from=queue`)
            return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={openEditor}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditor() } }}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--crm-card)] transition-colors cursor-pointer"
            >
              <div className="w-10 h-[71px] flex-none rounded-md overflow-hidden bg-black">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <video src={p.previewUrl} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="text-[13px] font-bold text-[var(--crm-text-primary)] truncate">{p.postName || p.source?.displayName || "Untitled post"}</div>
                  {p.recurring && <span className="flex-none text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-[var(--crm-card)] text-[var(--crm-text-secondary)] border border-[var(--crm-border)]">Recurring</span>}
                </div>
                <div className="text-[11.5px] text-[var(--crm-text-secondary)] truncate flex items-center gap-1">
                  <pm.Icon className="flex-none" size={12} aria-hidden />
                  <span>{pm.label}{p.source?.market ? ` · ${p.source.market}` : ""}</span>
                </div>
                <div className="text-[11px] text-[var(--crm-text-muted)] mt-0.5">{fmtWhen(p.scheduledAt)}</div>
              </div>
              {/* Scheduled rows: Cancel | Scheduled. Cancel invokes the canonical unschedule; the
                  green "Scheduled" status pill is unchanged. Other statuses keep just the pill. */}
              <div className="flex-none flex items-center gap-2">
                {p.status === "scheduled" && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => void cancelScheduled(p.id, e)}
                      disabled={cancelingId === p.id}
                      className="text-[11.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] disabled:opacity-50"
                    >
                      {cancelingId === p.id ? "Cancelling…" : "Cancel"}
                    </button>
                    <span className="text-[var(--crm-text-muted)]" aria-hidden>|</span>
                  </>
                )}
                <span className={"text-[11.5px] font-semibold px-2.5 py-1 rounded-full " + (STATUS_STYLE[p.status] ?? "text-[var(--crm-text-muted)] bg-[var(--crm-card)]")}>
                  {POST_STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
