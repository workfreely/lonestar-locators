"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { POST_STATUS_LABEL, type PostStatus } from "@/lib/social/postStatus"
import { POST_TYPE_LABEL, previewAspectClass } from "@/lib/social/postTypes"
import { buildHashtags, normalizeHashtag } from "@/lib/social/hashtags"
import { overlayPreviewStyle, wrapHeadline } from "@/lib/social/overlaySpec"
import { SOCIAL_MARKETS } from "@/lib/social/markets"
import { PROPERTY_TYPES } from "@/lib/social/propertyTypes"
import { detectMarket } from "@/lib/social/filenameInference"
import PropertySearchField from "@/components/crm/social/PropertySearchField"
import ScheduleWorkspace from "@/components/crm/social/ScheduleWorkspace"

// Social Autopilot — the ONE user-facing editor. Composes a social_posts variation (post type,
// overlay, caption, hashtags, audio, schedule) AND edits the useful public-safe SOURCE facts
// (social_content: property + place_id, type, market, and — under More Details — special/price/
// amenities), so there is no separate source-metadata form. The two tables stay separate
// internally; the operator sees one screen. Preview stays on the LEFT (the right-side workspace
// is Beast Companion). Overlay text + audio drive the FFmpeg render; caption/hashtags are the IG
// caption (assembled at publish). NO Instagram publish here.

type Source = {
  displayName: string | null
  propertyName: string | null
  propertyType: string | null
  placeId: string | null
  market: string | null
  special: string | null
  budgetRange: string | null
  amenities: string | null
  originalFilename: string | null
  kind: string | null
}
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
  sourceContentId: string | null
  source: Source | null
  previewUrl: string | null
  renderedPreviewUrl: string | null
}

const MAX_HASHTAGS = 7 // Instagram limit enforced in the editor (approved bank/logic unchanged)

const AUDIO_OPTIONS: { key: string; label: string; disabled?: boolean; note?: string }[] = [
  { key: "original", label: "Original Audio" },
  { key: "none", label: "No Music" },
  { key: "lb_track", label: "Locator Beast Music", disabled: true, note: "Coming soon" },
]

// Where the editor returns to, based on where the user entered from.
const BACK: Record<string, { path: string; label: string }> = {
  library: { path: "/admin/social-autopilot", label: "← Back to Library" },
  queue: { path: "/admin/social-autopilot/queue", label: "← Back to Queue" },
  calendar: { path: "/admin/social-autopilot/calendar", label: "← Back to Calendar" },
}

const pad2 = (n: number) => String(n).padStart(2, "0")
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
const scheduleToIso = (v: string): string | null => (v && !isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null)
function fmtSchedule(v: string): string {
  if (!v) return ""
  const d = new Date(v)
  if (isNaN(d.getTime())) return ""
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
}

export default function PostEditor({ postId, from }: { postId: string; from?: string | null }) {
  const router = useRouter()
  const back = BACK[from ?? ""] ?? BACK.library // absent/invalid origin defaults to Library
  const [post, setPost] = useState<Post | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // social_posts (public post) fields
  const [postName, setPostName] = useState("") // INTERNAL — kept, not shown as a field
  const [postType, setPostType] = useState("reel")
  const [headline, setHeadline] = useState("")
  const [subheadline, setSubheadline] = useState("")
  const [caption, setCaption] = useState("")
  const [hashtags, setHashtags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState("")
  const [audioChoice, setAudioChoice] = useState("original")
  const [scheduleVal, setScheduleVal] = useState("") // local "YYYY-MM-DDTHH:mm"
  const [scheduling, setScheduling] = useState(false) // RIGHT column shows the Schedule workspace

  // social_content (source) public-safe fields — edited here, written back to the source row.
  const [sourceContentId, setSourceContentId] = useState<string | null>(null)
  const [propertyName, setPropertyName] = useState("")
  const [propertyType, setPropertyType] = useState("")
  const [market, setMarket] = useState("")
  const [placeId, setPlaceId] = useState("")
  const [special, setSpecial] = useState("")
  const [priceRange, setPriceRange] = useState("")
  const [amenities, setAmenities] = useState("")

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
      setScheduleVal(isoToLocalInput(p.scheduledAt))
      setSourceContentId(p.sourceContentId ?? null)
      setPropertyName(p.source?.propertyName ?? "")
      setPropertyType(p.source?.propertyType ?? "")
      setMarket(p.source?.market ?? "")
      setPlaceId(p.source?.placeId ?? "")
      setSpecial(p.source?.special ?? "")
      setPriceRange(p.source?.budgetRange ?? "")
      setAmenities(p.source?.amenities ?? "")
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

  // Persist the public-safe SOURCE facts to social_content (reuses the canonical content PATCH,
  // which also keeps place_id + auto-display-name behavior). Internal fields are never touched.
  const patchSource = useCallback(async (): Promise<boolean> => {
    if (!sourceContentId) return true
    const res = await fetch(`/api/admin/social-autopilot/content/${encodeURIComponent(sourceContentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyName, propertyType, market, placeId, special, budgetRange: priceRange, amenities }),
    })
    return res.ok
  }, [sourceContentId, propertyName, propertyType, market, placeId, special, priceRange, amenities])

  const patch = useCallback(
    async (extra: Record<string, unknown>, successMsg: string | null) => {
      setBusy(true)
      setError(null)
      setNotice(null)
      try {
        const okSource = await patchSource()
        if (!okSource) { setError("Couldn't save."); return false }
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
    [postId, fieldsBody, patchSource],
  )

  const saveDraft = async () => {
    if (await patch({ scheduledAt: scheduleToIso(scheduleVal) ?? "" }, "Draft saved.")) await load()
  }
  // Confirm scheduling from the Schedule workspace with an explicit local "YYYY-MM-DDTHH:mm".
  // No render is triggered here — scheduling only writes scheduled_at (background render later).
  const scheduleAt = async (localValue: string) => {
    const iso = scheduleToIso(localValue)
    if (!iso) return setError("Set a date and time to schedule.")
    if (await patch({ intent: "schedule", scheduledAt: iso }, "Scheduled.")) router.push(back.path)
  }
  const backToDraft = async () => {
    if (await patch({ intent: "unschedule" }, "Moved back to Draft.")) await load()
  }
  // NOTE: FFmpeg render infrastructure (the /render route + renderVideo) and post-duplicate
  // (/duplicate route) are intentionally KEPT. They are no longer surfaced as manual editor
  // buttons — rendering will run internally as part of Publish/Schedule, and post variations may
  // be exposed from the Library later.

  const addTag = (raw: string) => {
    const t = normalizeHashtag(raw)
    if (!t) return
    setHashtags((prev) => (prev.length >= MAX_HASHTAGS || prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]))
    setTagInput("")
  }
  // Suggest from the approved bank, capped at the Instagram limit (unchanged generation logic).
  const suggestTags = () => setHashtags(buildHashtags(market || post?.source?.market, MAX_HASHTAGS, propertyType || post?.source?.propertyType).slice(0, MAX_HASHTAGS))

  const control = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const fieldLabel = "text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]"
  const btn = "text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const primaryBtn = "text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"

  if (error && !post) {
    return (
      <div>
        <button type="button" className={btn} onClick={() => router.push(back.path)}>{back.label}</button>
        <div className="mt-3 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center text-[13px] text-[var(--crm-text-secondary)]">{error}</div>
      </div>
    )
  }
  if (!post) return <div className="text-[13px] text-[var(--crm-text-secondary)] py-10 text-center">Loading…</div>

  // This workflow is VIDEO-only: offer Reel + Story. Feed Post stays valid in the API/data for
  // legacy records but is intentionally not offered here.
  const types = ["reel", "story"]
  const aspect = previewAspectClass(post.platform, postType)
  const rendered = post.renderStatus === "ready" && !!post.renderedPreviewUrl
  const headLines = wrapHeadline(headline) // shared with the render, so the sub never collides
  const ov = overlayPreviewStyle(headLines.length || 1)

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5 flex-wrap">
        <button type="button" className={btn} onClick={() => router.push(back.path)}>{back.label}</button>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[var(--crm-card)] text-[var(--crm-text-secondary)]">{POST_STATUS_LABEL[post.status] ?? post.status}</span>
        {/* Compact post settings — Instagram type (Reel/Story) + Audio — in the status area. */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--crm-border)] pl-2.5 pr-1 py-0.5">
          <span className="text-[11px] font-semibold text-[var(--crm-text-secondary)]">Instagram</span>
          <div className="inline-flex items-center gap-0.5">
            {types.map((t) => (
              <button key={t} type="button" onClick={() => setPostType(t)} className={"text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors " + (postType === t ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")}>
                {POST_TYPE_LABEL[t] ?? t}
              </button>
            ))}
          </div>
          <span className="w-px h-4 bg-[var(--crm-border)]" aria-hidden />
          <select
            aria-label="Audio"
            value={audioChoice}
            onChange={(e) => e.target.value !== "lb_track" && setAudioChoice(e.target.value)}
            className="text-[11px] font-semibold bg-transparent text-[var(--crm-text-secondary)] outline-none cursor-pointer pr-0.5"
          >
            {AUDIO_OPTIONS.map((a) => (
              <option key={a.key} value={a.key} disabled={a.disabled}>{a.label}{a.note ? ` — ${a.note}` : ""}</option>
            ))}
          </select>
        </div>
      </div>

      {(error || notice) && (
        <div className={`mb-3 rounded-lg border px-4 py-2.5 text-[13px] ${error ? "border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)]" : "border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"}`}>
          {error || notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-5">
        {/* Preview column — LEFT (right side is the Beast Companion workspace). */}
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
                  // containerType:size makes cqh resolve to THIS box's height, so the font sizes
                  // scale on the same basis as the top-%% positions (both box-relative). Using vh
                  // here made the headline larger than the layout assumed and it overlapped the sub.
                  <div className="pointer-events-none absolute inset-0" aria-hidden style={{ containerType: "size" }}>
                    {headline && (
                      <div style={{ position: "absolute", top: `${ov.headlineTopPct}%`, left: `${ov.sideMarginPct}%`, right: `${ov.sideMarginPct}%`, textAlign: "center", color: "white", fontWeight: 800, lineHeight: 1.05, fontSize: `${ov.headlineFontPct}cqh`, textShadow: "0 2px 8px rgba(0,0,0,.6)", whiteSpace: "pre-line" }}>
                        {headLines.join("\n").toUpperCase()}
                      </div>
                    )}
                    {subheadline && (
                      <div style={{ position: "absolute", top: `${ov.subTopPct}%`, left: `${ov.sideMarginPct}%`, right: `${ov.sideMarginPct}%`, textAlign: "center", color: "white", fontWeight: 700, fontSize: `${ov.subFontPct}cqh`, textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>
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
          {/* The left column ends with the preview. Rendering happens internally as part of
              Publish/Schedule — there is no manual Prepare step in the UI. A faithful final
              preview still shows automatically once a derivative exists. */}
        </div>

        {/* Fields column — compact paired rows. Swaps to the Schedule workspace on demand; the
            editor field values live in component state, so they survive the swap (Cancel returns
            with everything intact). */}
        <div className="flex flex-col gap-3">
          {scheduling ? (
            <ScheduleWorkspace
              initialValue={scheduleVal}
              currentPostId={post.id}
              busy={busy}
              onCancel={() => setScheduling(false)}
              onSchedule={(v) => { setScheduleVal(v); void scheduleAt(v) }}
            />
          ) : (
          <>
          {/* Row 1: Property (widest) | Type | Market */}
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-3">
            <label className="block">
              <span className={fieldLabel}>Property / Building Name</span>
              <PropertySearchField
                value={propertyName}
                matched={!!placeId}
                inputClassName={`${control} mt-1`}
                placeholder="Search existing property or type…"
                onChange={(v) => { setPropertyName(v); setPlaceId("") }}
                onMatch={(m) => { setPropertyName(m.name); setPlaceId(m.placeId); setMarket((mk) => mk || detectMarket(m.address ?? "") || "") }}
                onClearMatch={() => setPlaceId("")}
              />
            </label>
            <label className="block">
              <span className={fieldLabel}>Property Type</span>
              <select className={`${control} mt-1`} value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                <option value="">No type</option>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={fieldLabel}>Market</span>
              <select className={`${control} mt-1`} value={market} onChange={(e) => setMarket(e.target.value)}>
                <option value="">No market</option>
                {[...SOCIAL_MARKETS, ...(market && !SOCIAL_MARKETS.includes(market) ? [market] : [])].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          {/* Row 2: Current Special (wide) | Amenities / Features (wide) | Price Range (narrow) */}
          <div className="grid grid-cols-1 sm:grid-cols-[3fr_3fr_2fr] gap-3">
            <label className="block">
              <span className={fieldLabel}>Current Special</span>
              <input className={`${control} mt-1`} value={special} onChange={(e) => setSpecial(e.target.value)} />
            </label>
            <label className="block">
              <span className={fieldLabel}>Amenities / Features</span>
              <input className={`${control} mt-1`} value={amenities} onChange={(e) => setAmenities(e.target.value)} />
            </label>
            <label className="block">
              <span className={fieldLabel}>Price Range</span>
              <input className={`${control} mt-1`} value={priceRange} onChange={(e) => setPriceRange(e.target.value)} />
            </label>
          </div>

          {/* Row 3: Overlay Headline | Subheadline */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={fieldLabel}>Overlay Headline</span>
              <input className={`${control} mt-1`} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Burned into the video" />
            </label>
            <label className="block">
              <span className={fieldLabel}>Overlay Subheadline</span>
              <input className={`${control} mt-1`} value={subheadline} onChange={(e) => setSubheadline(e.target.value)} placeholder="Optional" />
            </label>
          </div>

          {/* Row 4: Caption | Hashtags (≈50/50) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={fieldLabel}>Instagram Caption</span>
              <textarea className={`${control} mt-1 min-h-[76px]`} rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Public caption" />
            </label>
            <div className="block">
              <div className="flex items-center justify-between">
                <span className={fieldLabel}>Hashtags <span className={"normal-case " + (hashtags.length > MAX_HASHTAGS ? "text-amber-600 dark:text-amber-400" : "text-[var(--crm-text-muted)]")}>{hashtags.length > MAX_HASHTAGS ? `(${hashtags.length} · max ${MAX_HASHTAGS})` : `(${hashtags.length}/${MAX_HASHTAGS})`}</span></span>
                <button type="button" className="text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]" onClick={suggestTags}>Suggest from market</button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] p-2 min-h-[76px] content-start">
                {hashtags.map((t, i) => (
                  <span key={`${t}-${i}`} className="inline-flex items-center gap-1 h-fit text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[var(--crm-panel)] border border-[var(--crm-border)] text-[var(--crm-text-primary)]">
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => setHashtags((prev) => prev.filter((_, idx) => idx !== i))}>×</button>
                  </span>
                ))}
                {hashtags.length < MAX_HASHTAGS && (
                  <input
                    className="flex-1 min-w-[110px] bg-transparent text-[12.5px] text-[var(--crm-text-primary)] outline-none"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) { e.preventDefault(); addTag(tagInput) } }}
                    onBlur={() => tagInput.trim() && addTag(tagInput)}
                    placeholder="Add hashtag…"
                  />
                )}
              </div>
              <span className="text-[10.5px] text-[var(--crm-text-muted)]">{hashtags.length > MAX_HASHTAGS ? `Over the ${MAX_HASHTAGS}-tag Instagram limit — remove ${hashtags.length - MAX_HASHTAGS} before publishing.` : hashtags.length === MAX_HASHTAGS ? `Instagram limit of ${MAX_HASHTAGS} reached — remove one to add another.` : "Added to the caption when published (kept separate here)."}</span>
            </div>
          </div>

          {/* Row 5: Schedule — opens the calendar-based Schedule workspace (no inline picker). */}
          <div className="block">
            <span className={fieldLabel}>Schedule</span>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setScheduling(true)}
                className={`${control} text-left flex items-center justify-between`}
              >
                <span className={scheduleVal ? "text-[var(--crm-text-primary)]" : "text-[var(--crm-text-muted)]"}>
                  {scheduleVal ? fmtSchedule(scheduleVal) : "Pick a date & time"}
                </span>
                <span className="text-[var(--crm-text-muted)] ml-2">▾</span>
              </button>
              {scheduleVal && (
                <button type="button" className="text-[11.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]" onClick={() => setScheduleVal("")}>
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* One static action row beneath Schedule, aligned lower-right: Save Draft (secondary),
              Schedule (primary), Publish Now (strongest final action). Rendering runs internally
              as part of Publish/Schedule — no manual prepare step. Publish stays disabled until a
              production-safe Instagram publish pipeline exists (no fake publishing). */}
          <div className="mt-1 flex items-center justify-end gap-2 flex-wrap">
            {post.status === "scheduled" && <button type="button" className={`${btn} mr-auto`} disabled={busy} onClick={() => void backToDraft()}>Move back to Draft</button>}
            <button type="button" className={btn} disabled={busy} onClick={() => void saveDraft()}>{busy ? "Saving…" : "Save Draft"}</button>
            <button type="button" className={primaryBtn} disabled={busy} onClick={() => setScheduling(true)}>Schedule</button>
            <button
              type="button"
              disabled
              title="Live Instagram publishing isn't enabled yet"
              className="text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white opacity-60 cursor-not-allowed"
            >
              Publish Now
            </button>
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
