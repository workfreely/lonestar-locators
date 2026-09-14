"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { POST_STATUS_LABEL, type PostStatus } from "@/lib/social/postStatus"
import { POST_TYPE_LABEL, previewAspectClass } from "@/lib/social/postTypes"
import { buildHashtags, normalizeHashtag } from "@/lib/social/hashtags"
import { buildCaption, specialDisplay, buildTemplateHeadline, buildTemplateDetail, OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_LABEL, DEFAULT_OVERLAY_TEMPLATE, type OverlayTemplate, isGeneratedHeadline, isGeneratedCaption, isGeneratedHashtags, type SourceMeta } from "@/lib/social/composePost"
import SpecialSelect from "@/components/crm/social/SpecialSelect"
import { computeOverlayLayout } from "@/lib/social/overlaySpec"
import PreviewOverlay from "@/components/crm/social/PreviewOverlay"
import AmenitySelect from "@/components/crm/social/AmenitySelect"
import { parseAmenities, serializeAmenities } from "@/lib/social/amenities"
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
  socialSpecial: string | null
  overlayHeadline: string | null
  overlaySubheadline: string | null
  overlayMode: string
  overlayTemplate?: string | null
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
// Compact date for the Repeat summary ("Sep 28").
function fmtDateShort(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
// Friendly placement summary (slot key 'midday' shows as "Afternoons").
const PLACEMENT_SUMMARY: Record<string, string> = { any: "Social Beast chooses the time", morning: "Mornings", midday: "Afternoons", evening: "Evenings" }

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
  const [overlayMode, setOverlayMode] = useState<"generate" | "existing">("generate")
  const [overlayTemplate, setOverlayTemplate] = useState<OverlayTemplate>(DEFAULT_OVERLAY_TEMPLATE)
  const [caption, setCaption] = useState("")
  const [hashtags, setHashtags] = useState<string[]>([])
  // Manual-override flags: an AUTO-GENERATED field stays synced with metadata; once the user edits
  // it directly it is a manual override and is preserved. (Overlay Detail has no manual mode — it
  // is always derived from the template + metadata.)
  const [headlineDirty, setHeadlineDirty] = useState(false)
  const [captionDirty, setCaptionDirty] = useState(false)
  const [hashtagsDirty, setHashtagsDirty] = useState(false)
  const [tagInput, setTagInput] = useState("")
  const [audioChoice, setAudioChoice] = useState("original")
  const [scheduleVal, setScheduleVal] = useState("") // local "YYYY-MM-DDTHH:mm"
  const [scheduling, setScheduling] = useState(false) // RIGHT column shows the Schedule workspace
  // Posting: Post Once (manual date/time) vs Repeat (recurring rule) — exposed inline in the editor.
  const [postingMode, setPostingMode] = useState<"once" | "repeat">("once")
  const [repeatEvery, setRepeatEvery] = useState(14) // 14 | 30 | 60 (approved)
  const [durationMode, setDurationMode] = useState<"days" | "date" | "until_stopped">("until_stopped")
  const [durationDays, setDurationDays] = useState(30) // 30 | 60 | 90
  const [repeatEndDate, setRepeatEndDate] = useState("")
  const [placement, setPlacement] = useState<"any" | "morning" | "midday" | "evening">("any")
  type Rule = { id: string; state: string; intervalDays: number; placementPref: string; endMode: string; endAt: string | null }
  const [rule, setRule] = useState<Rule | null>(null) // existing Repeat rule for this source
  const [ruleNextAt, setRuleNextAt] = useState<string | null>(null) // next scheduled occurrence date
  const [editingRule, setEditingRule] = useState(false) // "Edit Repeat" reopens the settings form
  const [ruleMenuOpen, setRuleMenuOpen] = useState(false) // ⋯ overflow (contains Stop Repeat)
  const [publishing, setPublishing] = useState(false) // Publish (hand-off to Social Beast scheduling) in progress
  const [lightbox, setLightbox] = useState<string | null>(null) // enlarged 9:16 video preview (src or null)

  // social_content (source) public-safe fields — edited here, written back to the source row.
  const [sourceContentId, setSourceContentId] = useState<string | null>(null)
  const [propertyName, setPropertyName] = useState("")
  const [propertyType, setPropertyType] = useState("")
  const [market, setMarket] = useState("")
  const [placeId, setPlaceId] = useState("")
  const [special, setSpecial] = useState("") // RAW Current Special (source metadata; preserved)
  const [socialSpecial, setSocialSpecial] = useState("") // per-post explicit Social Special
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
      setOverlayMode(p.overlayMode === "existing" ? "existing" : "generate")
      const tpl = (OVERLAY_TEMPLATES as readonly string[]).includes(p.overlayTemplate ?? "") ? (p.overlayTemplate as OverlayTemplate) : DEFAULT_OVERLAY_TEMPLATE
      setOverlayTemplate(tpl)
      setAudioChoice(p.audioChoice || "original")
      setScheduleVal(isoToLocalInput(p.scheduledAt))
      setSourceContentId(p.sourceContentId ?? null)
      setPropertyName(p.source?.propertyName ?? "")
      setPropertyType(p.source?.propertyType ?? "")
      setMarket(p.source?.market ?? "")
      setPlaceId(p.source?.placeId ?? "")
      setSpecial(p.source?.special ?? "")
      setSocialSpecial(p.socialSpecial ?? "")
      setPriceRange(p.source?.budgetRange ?? "")
      setAmenities(p.source?.amenities ?? "")

      // Generated-vs-manual detection on load. A stored value that matches a generated form for
      // SOME market/type is AUTO-GENERATED → re-synced to the CURRENT metadata (repairs anything
      // left stale by a prior metadata change). A value matching no generated form is a MANUAL
      // override → kept as-is and flagged dirty. Overlay Detail is always derived (never manual).
      const meta: SourceMeta = {
        market: p.source?.market ?? null,
        propertyType: p.source?.propertyType ?? null,
        special: p.source?.special ?? null,
        socialSpecial: p.socialSpecial ?? null,
        budgetRange: p.source?.budgetRange ?? null,
        amenities: p.source?.amenities ?? null,
      }
      const seed = p.sourceContentId ?? undefined
      const storedHead = p.overlayHeadline ?? ""
      const genHead = buildTemplateHeadline(tpl, meta)
      // Manual if a non-empty stored headline matches neither the current template's output nor any
      // supported market/type Hero form; otherwise it is generated → re-sync to the template.
      const hDirty = !!storedHead && storedHead !== genHead && !isGeneratedHeadline(storedHead)
      setHeadlineDirty(hDirty)
      setHeadline(hDirty ? storedHead : genHead)
      const storedCap = p.caption ?? ""
      const cDirty = !isGeneratedCaption(storedCap, meta, seed)
      setCaptionDirty(cDirty)
      setCaption(cDirty ? storedCap : buildCaption(meta, seed))
      const storedTags = Array.isArray(p.hashtags) ? p.hashtags : []
      const tDirty = !isGeneratedHashtags(storedTags, meta)
      setHashtagsDirty(tDirty)
      setHashtags(tDirty ? storedTags : buildHashtags(meta.market, MAX_HASHTAGS, meta.propertyType))

      // Detect an existing (active/paused) Repeat rule for this post's SOURCE so the editor can show
      // Pause/Resume/Stop instead of the setup form. Stopped rules are treated as none.
      try {
        const rr = await fetch("/api/admin/social-autopilot/recurring", { headers: { Accept: "application/json" } })
        if (rr.ok) {
          const jr = (await rr.json()) as { items?: { id: string; source_content_id: string; state: string; interval_days: number; placement_pref: string; end_mode: string; end_at: string | null }[] }
          const found = (jr.items ?? []).find((x) => x.source_content_id === p.sourceContentId && x.state !== "stopped")
          setRule(found ? { id: found.id, state: found.state, intervalDays: found.interval_days, placementPref: found.placement_pref, endMode: found.end_mode, endAt: found.end_at } : null)
          setPostingMode(found ? "repeat" : "once")
          setEditingRule(false)
          if (found) void refreshNextPost(found.id)
        }
      } catch { /* leave defaults on failure */ }
    } catch {
      setError("Couldn't load the post.")
    }
  }, [postId])
  useEffect(() => {
    void load()
  }, [load])

  // Close the enlarged video preview on Escape (backdrop click + X handled inline).
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lightbox])

  const fieldsBody = useCallback(
    () => ({
      postName, postType, caption, socialSpecial: socialSpecial || null,
      overlayHeadline: headline,
      overlaySubheadline: overlayMode === "generate" ? buildTemplateDetail(overlayTemplate, { market, propertyType, special: special || null, socialSpecial: socialSpecial || null, budgetRange: priceRange || null, amenities: amenities || null }) : "",
      overlayMode, overlayTemplate, hashtags, audioChoice,
    }),
    [postName, postType, caption, socialSpecial, headline, overlayMode, overlayTemplate, market, propertyType, special, priceRange, amenities, hashtags, audioChoice],
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

  // Post Once AUTO-PLACEMENT: persist edits, then let Social Beast pick the next open approved slot.
  const autoSchedule = async () => {
    setBusy(true); setError(null); setNotice(null)
    try {
      const okSource = await patchSource()
      if (okSource) await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fieldsBody()) })
      const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}/autoschedule`, { method: "POST" })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error === "no_slot" ? "Social Beast couldn't find an open posting slot in the next few weeks. Free up a slot in the Calendar and try again." : "Couldn't schedule.")
        return
      }
      const j = (await res.json()) as { scheduledAt: string }
      setNotice(`Scheduled — ${fmtSchedule(isoToLocalInput(j.scheduledAt))}`)
      await load()
    } catch {
      setError("Couldn't schedule.")
    } finally {
      setBusy(false)
    }
  }

  // Repeat: create a recurring RULE from this post's source and auto-place the first rolling horizon
  // of occurrences into available posting windows (manual posts always keep priority). Each
  // occurrence is its own scheduled social_posts row visible in Queue + Calendar. No publishing.
  // Reuses the EXISTING recurrence backend (POST /recurring). Builds the config from the inline form.
  const durationBody = () => (durationMode === "days" ? { mode: "days", days: durationDays } : durationMode === "date" ? { mode: "date", endDate: repeatEndDate } : { mode: "until_stopped" })

  // Load the next upcoming occurrence date for a rule (for the "Next post" summary line).
  const refreshNextPost = async (ruleId: string) => {
    try {
      const res = await fetch("/api/admin/social-autopilot/posts?scope=scheduled", { headers: { Accept: "application/json" } })
      if (!res.ok) return
      const j = (await res.json()) as { items?: { scheduledAt: string | null; recurringRuleId?: string | null }[] }
      const now = Date.now()
      const next = (j.items ?? [])
        .filter((x) => x.recurringRuleId === ruleId && x.scheduledAt && new Date(x.scheduledAt).getTime() > now)
        .map((x) => x.scheduledAt as string)
        .sort()[0]
      setRuleNextAt(next ?? null)
    } catch { /* ignore */ }
  }

  // Start Repeat (create the rule). After success the section collapses to the active summary.
  const startRepeat = async () => {
    if (!sourceContentId) { setError("This post has no source video to repeat."); return }
    setBusy(true); setError(null); setNotice(null)
    try {
      await patchSource() // persist latest metadata so generated occurrences use it
      const res = await fetch("/api/admin/social-autopilot/recurring", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceContentId, intervalDays: repeatEvery, placementPref: placement, duration: durationBody() }),
      })
      if (!res.ok) { setError("Couldn't start Repeat."); return }
      const j = (await res.json()) as { id: string; created: number; horizonDays: number }
      setRule({ id: j.id, state: "active", intervalDays: repeatEvery, placementPref: placement, endMode: durationMode === "until_stopped" ? "until_stopped" : durationMode === "date" ? "on_date" : "after_days", endAt: null })
      setEditingRule(false)
      setNotice(`Recurring started — ${j.created} post${j.created === 1 ? "" : "s"} scheduled. See the Calendar.`)
      void refreshNextPost(j.id)
    } catch {
      setError("Couldn't start Repeat.")
    } finally {
      setBusy(false)
    }
  }

  // Save edits to an existing rule (Edit Repeat) via PATCH /recurring/[id] — same backend.
  const saveRuleEdit = async () => {
    if (!rule) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/admin/social-autopilot/recurring/${encodeURIComponent(rule.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalDays: repeatEvery, placementPref: placement, duration: durationBody() }),
      })
      if (!res.ok) { setError("Couldn't update Repeat."); return }
      setRule({ ...rule, intervalDays: repeatEvery, placementPref: placement })
      setEditingRule(false)
      setNotice("Recurring updated.")
      void refreshNextPost(rule.id)
    } catch {
      setError("Couldn't update Repeat.")
    } finally {
      setBusy(false)
    }
  }

  // Open the settings form pre-filled from the current rule.
  const openEditRepeat = () => {
    if (!rule) return
    setRepeatEvery(rule.intervalDays)
    setPlacement((["any", "morning", "midday", "evening"].includes(rule.placementPref) ? rule.placementPref : "any") as "any" | "morning" | "midday" | "evening")
    setDurationMode(rule.endMode === "after_days" ? "days" : rule.endMode === "on_date" ? "date" : "until_stopped")
    setRuleMenuOpen(false)
    setEditingRule(true)
  }

  // Pause / Resume / Stop (existing PATCH /recurring/[id]). None delete scheduled occurrences or
  // published history. Stop requires a confirmation and returns the section to Post Once | Repeat.
  const setRuleState = async (state: "active" | "paused" | "stopped") => {
    if (!rule) return
    if (state === "stopped" && !window.confirm("Stop this recurring schedule? No new posts will be created. Already-scheduled and published posts are kept.")) return
    setRuleMenuOpen(false)
    setBusy(true); setError(null); setNotice(null)
    try {
      const res = await fetch(`/api/admin/social-autopilot/recurring/${encodeURIComponent(rule.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state }),
      })
      if (!res.ok) { setError("Couldn't update the Repeat schedule."); return }
      if (state === "stopped") { setRule(null); setRuleNextAt(null); setEditingRule(false); setPostingMode("once"); setNotice("Recurring stopped. Already-scheduled posts are kept — nothing was deleted.") }
      else { setRule({ ...rule, state }); setNotice(state === "paused" ? "Recurring paused — no new posts will be created." : "Recurring resumed.") }
    } catch {
      setError("Couldn't update the Repeat schedule.")
    } finally {
      setBusy(false)
    }
  }

  // Clone: persist current edits, then duplicate into a NEW draft (same source, new id, no publish/
  // recurrence identity) and open it. The original is untouched.
  const clonePost = async () => {
    setBusy(true); setError(null); setNotice(null)
    try {
      const okSource = await patchSource()
      if (okSource) {
        await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fieldsBody()),
        })
      }
      const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}/duplicate`, { method: "POST" })
      if (!res.ok) { setError("Couldn't clone the post."); return }
      const j = (await res.json()) as { id: string }
      router.push(`/admin/social-autopilot/posts/${j.id}?from=${from ?? "library"}`)
    } catch {
      setError("Couldn't clone the post.")
    } finally {
      setBusy(false)
    }
  }

  // Publish — the ONE primary action. This does NOT publish to Instagram. "Publish" means: hand
  // this post to Social Beast for automatic placement. Actual Instagram publishing (/media,
  // /media_publish) happens later at the scheduled slot, only once the publishing worker is
  // approved/enabled — NEVER from this button.
  //   • Post Once  → schedule ONE occurrence into the next open approved slot (autoSchedule).
  //   • Recurring  → activate the recurring rule + auto-populate open slots (startRepeat); when the
  //                  Edit form is open it saves the edits to the existing rule instead.
  const publish = async () => {
    if (busy || publishing) return
    setPublishing(true)
    try {
      if (editingRule && rule) { await saveRuleEdit(); return }
      if (postingMode === "repeat") {
        if (rule) { setError(null); setNotice("This post is already recurring."); return }
        await startRepeat(); return
      }
      await autoSchedule() // Post Once → next open slot
    } finally {
      setPublishing(false)
    }
  }
  // NOTE: FFmpeg render infrastructure (the /render route + renderVideo) and post-duplicate
  // (/duplicate route) are intentionally KEPT. They are no longer surfaced as manual editor
  // buttons — rendering will run internally as part of Publish/Schedule, and post variations may
  // be exposed from the Library later.

  const addTag = (raw: string) => {
    const t = normalizeHashtag(raw)
    if (!t) return
    setHashtags((prev) => (prev.length >= MAX_HASHTAGS || prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]))
    setHashtagsDirty(true) // manual edit
    setTagInput("")
  }
  const removeTag = (idx: number) => { setHashtags((prev) => prev.filter((_, i) => i !== idx)); setHashtagsDirty(true) }
  // Suggest from the approved bank, capped at the Instagram limit — this RE-SYNCS hashtags to the
  // current market/type, so it clears the manual-override flag.
  const suggestTags = () => { setHashtags(buildHashtags(market || post?.source?.market, MAX_HASHTAGS, propertyType || post?.source?.propertyType).slice(0, MAX_HASHTAGS)); setHashtagsDirty(false) }

  // ── Synchronization engine ─────────────────────────────────────────────────────────────────
  // The overlay headline, the Instagram caption, and the hashtags are AUTO-GENERATED from metadata;
  // the Overlay DETAIL is always derived from the template + metadata. When any metadata field
  // changes we re-resolve every NON-manual generated value from the CURRENT metadata (the overlay
  // and the caption are independent systems consuming the same metadata; hashtags follow the market;
  // the caption keeps its deterministic hook and only re-resolves its variables). A field the user
  // has manually overridden (dirty) is left untouched.
  const metaOf = (over: Partial<SourceMeta> = {}): SourceMeta => ({
    market, propertyType, special: special || null, socialSpecial: socialSpecial || null, budgetRange: priceRange || null, amenities: amenities || null, ...over,
  })
  const syncGenerated = (meta: SourceMeta, tpl: OverlayTemplate = overlayTemplate) => {
    if (!headlineDirty) setHeadline(buildTemplateHeadline(tpl, meta))
    if (!captionDirty) setCaption(buildCaption(meta, sourceContentId ?? undefined))
    if (!hashtagsDirty) setHashtags(buildHashtags(meta.market, MAX_HASHTAGS, meta.propertyType))
    // Overlay Detail is derived from the template + metadata — no state to set here.
  }
  // Change the overlay template: regenerate the (non-manual) headline from the new template.
  const changeTemplate = (tpl: OverlayTemplate) => { setOverlayTemplate(tpl); if (!headlineDirty) setHeadline(buildTemplateHeadline(tpl, metaOf())) }
  // Overlay DETAIL — derived from the selected template + metadata (never manual).
  const overlayDetail = overlayMode === "generate" ? buildTemplateDetail(overlayTemplate, metaOf()) : ""

  const control = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const fieldLabel = "text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]"
  const btn = "text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  // The three footer actions share ONE physical size (height/padding/radius/font/line-height/min
  // footprint) via actionBase; only color/hierarchy differs. Every variant carries a border (visible
  // on Save Draft, transparent on the others) so heights match exactly.
  const actionBase = "text-[12.5px] leading-5 font-semibold px-4 py-2.5 rounded-lg border min-w-[120px] text-center transition-colors disabled:opacity-50"
  // Save Draft: filled SECONDARY surface (not primary) so it carries the same visual weight and the
  // same physical footprint (height/padding/min-width) as the filled Schedule/Publish buttons.
  const actionSecondary = `${actionBase} border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-inset)]` // Save Draft (secondary/dark)
  const actionLight = `${actionBase} border-transparent bg-[var(--crm-text-primary)] text-[var(--crm-panel)]` // Schedule (light)
  const actionGreen = `${actionBase} border-transparent bg-emerald-600 text-white` // Publish (green primary — schedules via Social Beast, no IG publish)

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
  const previewSrc = rendered ? post.renderedPreviewUrl : post.previewUrl // source for the enlarge modal
  // The chosen template's layout drives the preview (Hero / Center Hook / Center Hook + Detail),
  // shared with the FFmpeg render. 'existing' mode draws no overlay.
  const overlayLayout = overlayMode === "existing" ? null : computeOverlayLayout(overlayTemplate, headline, overlayDetail)

  return (
    <div>
      <div className="mb-3 flex items-center gap-2.5 flex-wrap">
        <button type="button" className={btn} onClick={() => router.push(back.path)}>{back.label}</button>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[var(--crm-card)] text-[var(--crm-text-secondary)]">{POST_STATUS_LABEL[post.status] ?? post.status}</span>
        {/* Instagram post type (Reel/Story) stays in the status area. Audio moved beneath the
            video preview (left column). */}
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--crm-border)] pl-2.5 pr-1 py-0.5">
          <span className="text-[11px] font-semibold text-[var(--crm-text-secondary)]">Instagram</span>
          <div className="inline-flex items-center gap-0.5">
            {types.map((t) => (
              <button key={t} type="button" onClick={() => setPostType(t)} className={"text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors " + (postType === t ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")}>
                {POST_TYPE_LABEL[t] ?? t}
              </button>
            ))}
          </div>
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
              <video src={post.renderedPreviewUrl!} controls controlsList="nofullscreen" disablePictureInPicture playsInline preload="metadata" className="w-full h-full object-cover" />
            ) : post.previewUrl ? (
              <>
                <video src={post.previewUrl} controls controlsList="nofullscreen" disablePictureInPicture muted playsInline preload="metadata" className="w-full h-full object-cover" />
                {/* Pre-render APPROXIMATION overlay (CSS) — SHARED with the enlarged lightbox so
                    both previews render the exact same overlay. Replaced by the burned-in render. */}
                <PreviewOverlay layout={overlayLayout} />
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[12px] text-[var(--crm-text-muted)]">No preview</div>
            )}
            {/* Enlarge control — opens a 9:16 contain lightbox (replaces native fullscreen, which
                zoomed/cropped the vertical video). Native fullscreen is disabled via controlsList. */}
            {previewSrc && (
              <button
                type="button"
                aria-label="Enlarge video"
                onClick={() => setLightbox(previewSrc)}
                className="absolute top-2 right-2 z-10 rounded-lg bg-black/55 hover:bg-black/75 text-white p-1.5 backdrop-blur-sm transition-colors"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              </button>
            )}
          </div>

          {/* The left column contains only the video preview. Rendering happens internally as part
              of Publish/Schedule — no manual Prepare step. */}
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
              <select className={`${control} mt-1`} value={propertyType} onChange={(e) => { const v = e.target.value; setPropertyType(v); syncGenerated(metaOf({ propertyType: v })) }}>
                <option value="">No type</option>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={fieldLabel}>Market</span>
              <select className={`${control} mt-1`} value={market} onChange={(e) => { const v = e.target.value; setMarket(v); syncGenerated(metaOf({ market: v })) }}>
                <option value="">No market</option>
                {[...SOCIAL_MARKETS, ...(market && !SOCIAL_MARKETS.includes(market) ? [market] : [])].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>

          {/* Row 2 — ONE horizontal row: Amenities (widest — chips stay one line) | Special (compact)
              | Starting At (most compact). The layout caps at max-w-[1200px]; at the MacBook Air
              target the fields column is ~880px, so 68% gives Amenities ~598px, fitting the 3 longest
              canonical chips (~563px) on one line. min-w-0 lets the narrow columns hold short values
              without forcing the amenities chips to wrap. */}
          <div className="grid grid-cols-1 sm:grid-cols-[68fr_19fr_13fr] gap-3">
            <div className="block min-w-0">
              <span className={fieldLabel}>Amenities / Features <span className="normal-case text-[var(--crm-text-muted)]">· choose up to 3</span></span>
              <AmenitySelect
                value={parseAmenities(amenities)}
                onChange={(next) => { const s = serializeAmenities(next); setAmenities(s); syncGenerated(metaOf({ amenities: s || null })) }}
              />
            </div>
            <div className="block min-w-0">
              <span className={fieldLabel}>Special</span>
              <SpecialSelect
                value={socialSpecial}
                fallbackHint={specialDisplay(special) || undefined}
                onChange={(v) => { setSocialSpecial(v); syncGenerated(metaOf({ socialSpecial: v || null })) }}
              />
            </div>
            {/* Starting At — the user enters ONLY the lowest monthly rent (no $, "Starting at", or
                /mo). The renderer/caption add "Starting at $…/mo". Stored in the same budget_range
                column (no migration). Entering a value derives the overlay subheadline live. */}
            <label className="block min-w-0">
              <span className={fieldLabel}>Starting At</span>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--crm-text-muted)]">$</span>
                <input
                  inputMode="numeric"
                  className="w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] py-1.5 pl-6 pr-11"
                  value={priceRange}
                  onChange={(e) => { const v = e.target.value; setPriceRange(v); syncGenerated(metaOf({ budgetRange: v || null })) }}
                  placeholder="1495"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-[var(--crm-text-muted)]">/mo</span>
              </div>
            </label>
          </div>

          {/* Text Overlay mode — directly above the overlay controls. 'Generate' shows the Template 1
              controls + generated preview/render; 'Already has text' hides them and leaves the
              uploaded video (with its own burned-in text) untouched. */}
          <div className="flex items-center gap-3">
            <span className={fieldLabel}>Text Overlay</span>
            <div className="inline-flex rounded-lg border border-[var(--crm-border)] p-0.5">
              {([["generate", "Generate with Social Beast"], ["existing", "Already has text"]] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setOverlayMode(val)}
                  aria-pressed={overlayMode === val}
                  className={"text-[12px] font-semibold px-2.5 py-1 rounded-md transition-colors " + (overlayMode === val ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {overlayMode === "generate" && (
            /* Overlay Template — per-post choice of the 5 overlay layouts. Changing it regenerates
               the (non-manual) headline + derived detail from the template. */
            <label className="block">
              <span className={fieldLabel}>Overlay Template</span>
              <select className={`${control} mt-1 cursor-pointer`} value={overlayTemplate} onChange={(e) => changeTemplate(e.target.value as OverlayTemplate)}>
                {OVERLAY_TEMPLATES.map((t, i) => <option key={t} value={t}>{i + 1}. {OVERLAY_TEMPLATE_LABEL[t]}</option>)}
              </select>
            </label>
          )}

          {overlayMode === "generate" ? (
            /* Overlay Headline (generated from the template, editable = manual override) | Overlay
               Detail (DERIVED from the template + metadata — read-only). */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className={fieldLabel}>Overlay Headline</span>
                <input className={`${control} mt-1`} value={headline} onChange={(e) => { setHeadline(e.target.value); setHeadlineDirty(true) }} placeholder="Burned into the video" />
              </label>
              <label className="block">
                <span className={fieldLabel}>Overlay Detail <span className="normal-case text-[var(--crm-text-muted)]">· auto from template</span></span>
                <input readOnly className={`${control} mt-1 text-[var(--crm-text-muted)]`} value={overlayDetail} placeholder="—" />
              </label>
            </div>
          ) : (
            <div className="text-[11.5px] text-[var(--crm-text-muted)] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2">
              Social Beast will keep the existing text in this video and won&apos;t add another overlay.
            </div>
          )}

          {/* Row 4: Caption (left) | Hashtags → Audio → Schedule → actions (right). Caption gets a
              taller DEFAULT so its bottom lands near the bottom of the right-column stack / preview
              — set via rows (initial height), NOT a large min-height, so it stays resizable DOWN to
              the 76px floor. resize-y keeps resizing vertical only (never breaks the column width). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              {/* Wrap the label in the SAME flex header row as Hashtags (right column) so the two
                  labels share identical vertical placement — the Caption label was a bare span and
                  sat a hair lower/higher than the Hashtags label inside its flex row. */}
              <div className="flex items-center justify-between">
                <span className={fieldLabel}>Instagram Caption</span>
              </div>
              <textarea className={`${control} mt-1 min-h-[76px] resize-y`} rows={14} value={caption} onChange={(e) => { setCaption(e.target.value); setCaptionDirty(true) }} placeholder="Public caption" />
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
                    <button type="button" aria-label={`Remove ${t}`} className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => removeTag(i)}>×</button>
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

              {/* Audio sits under Hashtags in the right column — same select styling/behavior as
                  before, width matching the right-column field (not the page). */}
              <label className="block mt-3">
                <span className={fieldLabel}>Audio</span>
                <select
                  aria-label="Audio"
                  value={audioChoice}
                  onChange={(e) => e.target.value !== "lb_track" && setAudioChoice(e.target.value)}
                  className={`${control} mt-1 cursor-pointer`}
                >
                  {AUDIO_OPTIONS.map((a) => (
                    <option key={a.key} value={a.key} disabled={a.disabled}>{a.label}{a.note ? ` — ${a.note}` : ""}</option>
                  ))}
                </select>
              </label>

              {/* Posting — Post Once (manual date/time) or Repeat (recurring), exposed INLINE (no need
                  to open the calendar first). Repeat reuses the existing recurrence backend. */}
              <div className="block mt-3">
                <span className={`${fieldLabel} block mb-2`}>Posting</span>

                {rule && !editingRule ? (
                  /* ── Active / Paused: collapsed summary (no toggle, no verbose copy) ── */
                  <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] p-3 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--crm-text-secondary)]">{rule.state === "paused" ? "Recurring Paused" : "Recurring"}</span>
                      <div className="relative">
                        <button type="button" aria-label="More Repeat options" className="text-[15px] leading-none text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] px-1.5" onClick={() => setRuleMenuOpen((o) => !o)}>⋯</button>
                        {ruleMenuOpen && (
                          <div className="absolute right-0 mt-1 z-20 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] shadow-lg py-1 min-w-[130px]">
                            <button type="button" className="block w-full text-left text-[12.5px] px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-[var(--crm-card)]" disabled={busy} onClick={() => void setRuleState("stopped")}>Stop Recurring</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-[13px] text-[var(--crm-text-primary)]">Every {rule.intervalDays} days · {PLACEMENT_SUMMARY[rule.placementPref] ?? PLACEMENT_SUMMARY.any}</div>
                    {ruleNextAt && <div className="text-[11.5px] text-[var(--crm-text-muted)]">Next post: {fmtDateShort(ruleNextAt)}</div>}
                    <div className="mt-1 flex items-center gap-2">
                      <button type="button" className={btn} disabled={busy} onClick={openEditRepeat}>Edit</button>
                      {rule.state === "paused"
                        ? <button type="button" className={btn} disabled={busy} onClick={() => void setRuleState("active")}>Resume</button>
                        : <button type="button" className={btn} disabled={busy} onClick={() => void setRuleState("paused")}>Pause</button>}
                    </div>
                  </div>
                ) : (
                  <>
                    {!editingRule && (
                      <div className="inline-flex rounded-lg border border-[var(--crm-border)] p-0.5">
                        {([["once", "Post Once"], ["repeat", "Recurring"]] as const).map(([val, label]) => (
                          <button key={val} type="button" onClick={() => setPostingMode(val)} aria-pressed={postingMode === val}
                            className={"text-[12px] font-semibold px-3 py-1 rounded-md transition-colors " + (postingMode === val ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")}>
                            {label}
                          </button>
                        ))}
                      </div>
                    )}

                    {editingRule || postingMode === "repeat" ? (
                      /* Recurring settings — ONE compact horizontal row on desktop (Repeat Post |
                         Duration | Posting time), stacking only on narrow screens. NO activation
                         button — the green Publish (below) activates recurrence. */
                      <div className="mt-2 flex flex-col gap-2">
                        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)] gap-2.5">
                          <label className="block min-w-0">
                            <span className="text-[11px] text-[var(--crm-text-muted)]">Repeat Post</span>
                            <select className={`${control} mt-1 cursor-pointer`} value={repeatEvery} onChange={(e) => setRepeatEvery(Number(e.target.value))}>
                              <option value={14}>Every 14 days</option><option value={30}>Every 30 days</option><option value={60}>Every 60 days</option>
                            </select>
                          </label>
                          <label className="block min-w-0">
                            <span className="text-[11px] text-[var(--crm-text-muted)]">Duration</span>
                            <select className={`${control} mt-1 cursor-pointer`}
                              value={durationMode === "days" ? `d${durationDays}` : durationMode === "date" ? "date" : "until"}
                              onChange={(e) => { const v = e.target.value; if (v === "date") setDurationMode("date"); else if (v === "until") setDurationMode("until_stopped"); else { setDurationMode("days"); setDurationDays(Number(v.slice(1))) } }}>
                              <option value="d30">30 days</option><option value="d60">60 days</option><option value="d90">90 days</option><option value="date">Custom end date</option><option value="until">Until stopped</option>
                            </select>
                          </label>
                          <label className="block min-w-0">
                            <span className="text-[11px] text-[var(--crm-text-muted)]">Posting time</span>
                            <select className={`${control} mt-1 cursor-pointer`} value={placement} onChange={(e) => setPlacement(e.target.value as "any" | "morning" | "midday" | "evening")}>
                              <option value="any">Social Beast chooses</option><option value="morning">Morning</option><option value="midday">Afternoon</option><option value="evening">Evening</option>
                            </select>
                          </label>
                        </div>
                        {durationMode === "date" && <input type="date" className={`${control} sm:max-w-[220px]`} value={repeatEndDate} onChange={(e) => setRepeatEndDate(e.target.value)} />}
                        <span className="text-[10.5px] text-[var(--crm-text-muted)]">Social Beast chooses the next open Morning, Afternoon, or Evening slot.</span>
                        {editingRule && (
                          <div className="flex items-center gap-2">
                            <button type="button" className={actionLight} disabled={busy || (durationMode === "date" && !repeatEndDate)} onClick={() => void saveRuleEdit()}>{busy ? "Saving…" : "Save Changes"}</button>
                            <button type="button" className={btn} disabled={busy} onClick={() => setEditingRule(false)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    ) : scheduleVal ? (
                      /* SCHEDULED — Social Beast picked the slot. Read-only; any later override happens
                         from the Calendar/Queue, not here. */
                      <div className="mt-2 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] p-3 flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--crm-text-secondary)]">Scheduled</span>
                        <div className="text-[13px] text-[var(--crm-text-primary)]">{fmtSchedule(scheduleVal)}</div>
                        <span className="text-[11.5px] text-[var(--crm-text-muted)]">Social Beast selected the next open slot.</span>
                      </div>
                    ) : (
                      /* Post Once, not yet placed — informational only. Publish hands it to Social
                         Beast, which picks the next open slot. No date/time picker. */
                      <div className="mt-2 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2.5">
                        <span className="text-[11.5px] text-[var(--crm-text-muted)]">Social Beast will add this to the next open posting slot.</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Action row: Create Variation + Save Draft (secondary, equal weight), Publish
                  (primary green — hands the post to Social Beast for automatic placement; NO
                  Instagram publish). "Move back to Draft" sits left-aligned when scheduled. */}
              <div className="mt-3 flex items-center justify-end gap-2 flex-wrap">
                {post.status === "scheduled" && <button type="button" className={`${btn} mr-auto`} disabled={busy || publishing} onClick={() => void backToDraft()}>Move back to Draft</button>}
                <button type="button" className={actionSecondary} disabled={busy || publishing} onClick={() => void clonePost()}>Create Variation</button>
                <button type="button" className={actionSecondary} disabled={busy || publishing} onClick={() => void saveDraft()}>{busy ? "Saving…" : "Save Draft"}</button>
                <button type="button" className={actionGreen} disabled={busy || publishing} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish"}</button>
              </div>
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Enlarged 9:16 video preview (lightbox). Native fullscreen is disabled on the inline
          players; this shows the vertical video at its true aspect (object-contain, never cropped/
          zoomed), sized to ~88vh (width derived 9:16), centered over a blurred dark backdrop.
          Closes via X, Escape, or backdrop click. `fixed` overlay → no page layout shift. */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8 bg-black/70 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative overflow-hidden rounded-xl" style={{ height: "88vh", aspectRatio: "9 / 16", maxWidth: "calc(100vw - 2rem)" }} onClick={(e) => e.stopPropagation()}>
            <video src={lightbox} controls autoPlay playsInline controlsList="nofullscreen" disablePictureInPicture className="w-full h-full object-contain rounded-xl bg-black" />
            {/* Same SHARED overlay as the inline preview — only for the pre-render approximation
                (when the rendered derivative isn't showing; the render already has it burned in). */}
            {!rendered && <PreviewOverlay layout={overlayLayout} />}
            <button
              type="button"
              aria-label="Close preview"
              onClick={() => setLightbox(null)}
              className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white text-black shadow-lg flex items-center justify-center hover:bg-white/90"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
