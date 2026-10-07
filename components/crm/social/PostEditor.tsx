"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { POST_STATUS_LABEL, type PostStatus } from "@/lib/social/postStatus"
import { previewAspectClass } from "@/lib/social/postTypes"
import { SiInstagram, SiTiktok, SiYoutube } from "react-icons/si"
import type { IconType } from "react-icons"
import { buildHashtags, normalizeHashtag, hashtagLimitFor, MAX_HASHTAGS } from "@/lib/social/hashtags"
import { PRICE_LABEL_MODES, priceLabelMode as narrowPriceLabelMode, type PriceLabelMode, buildCaption, specialDisplay, buildTemplateHeadline, buildTemplateDetail, OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_LABEL, DEFAULT_OVERLAY_TEMPLATE, type OverlayTemplate, isGeneratedHeadline, isGeneratedCaption, isGeneratedHashtags, isOverlayPreviewStale, type OverlayPreviewBaseline, type SourceMeta } from "@/lib/social/composePost"
import SpecialSelect from "@/components/crm/social/SpecialSelect"
import { computeOverlayLayout } from "@/lib/social/overlaySpec"
import ReelCoverControl from "@/components/crm/social/ReelCoverControl"
import SafeAreaOverlay from "@/components/crm/social/SafeAreaOverlay"
import PreviewOverlay from "@/components/crm/social/PreviewOverlay"
import SourceQualityBadge from "@/components/crm/social/SourceQualityBadge"
import VideoLightbox from "@/components/crm/social/VideoLightbox"
import PropertyResearch from "@/components/crm/social/PropertyResearch"
import TikTokPostConfirm from "@/components/crm/social/TikTokPostConfirm"
import AmenitySelect from "@/components/crm/social/AmenitySelect"
import VoiceClipsControl from "@/components/crm/social/VoiceClipsControl"
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
  address: string | null
  market: string | null
  special: string | null
  budgetRange: string | null
  priceLabelMode: string | null
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
  voiceHookId?: string | null
  voiceCtaId?: string | null
  renderStatus: string
  renderError: string | null
  status: PostStatus
  scheduledAt: string | null
  sourceContentId: string | null
  source: Source | null
  previewUrl: string | null
  renderedPreviewUrl: string | null
  coverThumbOffsetMs: number | null
  coverStoragePath: string | null
  coverPreviewUrl: string | null
  coverMayHaveShifted?: boolean
}

// Generation count now comes from the SHARED canonical constant (5) — this file used to declare its
// own 7, a second source of truth that could drift from the generator.

// Publishing destinations shown in the editor's "Post to" selector (icon + name buttons). Instagram
// is the connected, publish-capable platform today; TikTok/YouTube are shown as real destinations to
// prepare the multi-platform workflow / TikTok review UI, but are NOT yet connected and make NO
// external API call when selected. Selection is modeled as a SET (multi-select, not a radio) so the
// eventual social_publications model (one execution record per selected platform) fits with no
// restructuring. This selector is UI-only here — it does not change post.platform, publishing,
// scheduling, or any persisted data.
const PLATFORM_OPTIONS: { id: string; label: string; Icon: IconType }[] = [
  { id: "instagram", label: "Instagram", Icon: SiInstagram },
  { id: "tiktok", label: "TikTok", Icon: SiTiktok },
  { id: "youtube", label: "YouTube", Icon: SiYoutube },
]

const AUDIO_OPTIONS: { key: string; label: string; disabled?: boolean; note?: string }[] = [
  { key: "original", label: "Original Audio" },
  { key: "none", label: "No Music" },
  { key: "lb_track", label: "Locator Beast Music", disabled: true, note: "Coming soon" },
]

// Where the editor returns to, based on where the user entered from.
const BACK: Record<string, { path: string; label: string }> = {
  library: { path: "/admin/social-autopilot", label: "← Back to Video Library" },
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
/** Selectable posting times for the Twice Daily cadence — every half hour, labelled in local
 *  12-hour form and VALUED in minutes from local midnight, which is exactly what the scheduler
 *  stores. Minutes rather than a timestamp is what keeps 9:00 AM at 9:00 AM across a DST change. */
const TIME_CHOICES: { min: number; label: string }[] = Array.from({ length: 48 }, (_, i) => {
  const min = i * 30
  const h24 = Math.floor(min / 60)
  const m = min % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return { min, label: `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}` }
})

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
  // Selected publishing destinations (multi-select set; Instagram default so existing Instagram
  // posts/workflow are unchanged). UI-only — not wired to publishing/persistence in this task.
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(() => new Set(["instagram"]))
  const togglePlatform = (id: string) =>
    setSelectedPlatforms((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  // Platform-aware editor cap: the strictest (smallest) limit among the selected destinations (any
  // selection including TikTok → 5; Instagram and/or YouTube alone → 7), falling back to the Instagram
  // baseline (MAX_HASHTAGS) when nothing is selected. Existing tags above this cap are kept, not
  // removed — they are flagged publish-invalid via the count/help text below.
  // EDITOR cap (how many tags may be KEPT) — platform-driven, Instagram baseline. Distinct from the
  // GENERATION cap (MAX_HASHTAGS = 5) used by the buildHashtags calls below, so a locator can still
  // keep manually added tags above the generated five.
  const hashtagLimit = hashtagLimitFor(selectedPlatforms)
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
  const [voiceHookId, setVoiceHookId] = useState<string | null>(null)
  const [voiceCtaId, setVoiceCtaId] = useState<string | null>(null)
  const [scheduleVal, setScheduleVal] = useState("") // local "YYYY-MM-DDTHH:mm"
  const [scheduling, setScheduling] = useState(false) // RIGHT column shows the Schedule workspace
  // Posting: Post Once (manual date/time) vs Repeat (recurring rule) — exposed inline in the editor.
  const [postingMode, setPostingMode] = useState<"once" | "repeat">("once")
  // TWICE DAILY is a distinct cadence, not an interval — the value "twice" cannot be expressed as
  // a number of days. Kept as its own piece of state so the existing interval options are
  // completely unaffected by it.
  const [cadence, setCadence] = useState<"interval" | "daily_times">("interval")
  const [firstTimeMin, setFirstTimeMin] = useState(9 * 60)   // 9:00 AM
  const [secondTimeMin, setSecondTimeMin] = useState(19 * 60) // 7:00 PM
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
  const [previewing, setPreviewing] = useState(false) // Preview Video render in progress (blocks repeat clicks)
  const [lightbox, setLightbox] = useState<string | null>(null) // enlarged 9:16 video preview (src or null)
  // Snapshot of the overlay-affecting fields (mode/template/headline) as of the last load() — lets
  // the preview tell "untouched since load" apart from "edited this session" without touching the
  // render pipeline. Set once per load(), read-only elsewhere.
  const overlayBaselineRef = useRef<OverlayPreviewBaseline | null>(null)
  const [ttConfirmOpen, setTtConfirmOpen] = useState(false) // TikTok Direct Post confirmation modal (Sandbox MVP)

  // social_content (source) public-safe fields — edited here, written back to the source row.
  // The ONE preview element. The Reel cover reads its live currentTime instead of mounting a
  // second player — the position has already been chosen by scrubbing this one.
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  // Safe-area guide: off by default (it is a working aid, not the design), and it names the
  // platform rather than implying one universal set of zones.
  const [safeArea, setSafeArea] = useState<"off" | "instagram" | "tiktok">("off")
  const [sourceContentId, setSourceContentId] = useState<string | null>(null)
  const [propertyName, setPropertyName] = useState("")
  const [propertyType, setPropertyType] = useState("")
  const [market, setMarket] = useState("")
  const [placeId, setPlaceId] = useState("")
  // Matched property's street address, READ from property_catalog by place_id —
  // social_content stores no address and none is added. Null when the place is
  // not in the catalog yet; the row then simply does not render.
  const [address, setAddress] = useState<string | null>(null)
  // Owned here, not inside PropertyResearch, so the collapsed trigger can stay in
  // the property cell while the expanded panel spans the full row below it.
  const [researchOpen, setResearchOpen] = useState(false)
  const [special, setSpecial] = useState("") // RAW Current Special (source metadata; preserved)
  const [socialSpecial, setSocialSpecial] = useState("") // per-post explicit Social Special
  const [priceRange, setPriceRange] = useState("")
  // Per-SOURCE: what the Starting At number means for this footage. Absent → "starting_at".
  const [priceMode, setPriceMode] = useState<PriceLabelMode>("starting_at")
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
      setSelectedPlatforms(new Set([p.platform || "instagram"])) // reflect the post's platform (Instagram today)
      setOverlayMode(p.overlayMode === "existing" ? "existing" : "generate")
      const tpl = (OVERLAY_TEMPLATES as readonly string[]).includes(p.overlayTemplate ?? "") ? (p.overlayTemplate as OverlayTemplate) : DEFAULT_OVERLAY_TEMPLATE
      setOverlayTemplate(tpl)
      setAudioChoice(p.audioChoice || "original")
      setVoiceHookId(p.voiceHookId ?? null)
      setVoiceCtaId(p.voiceCtaId ?? null)
      setScheduleVal(isoToLocalInput(p.scheduledAt))
      setSourceContentId(p.sourceContentId ?? null)
      setPropertyName(p.source?.propertyName ?? "")
      setPropertyType(p.source?.propertyType ?? "")
      setMarket(p.source?.market ?? "")
      setPlaceId(p.source?.placeId ?? "")
      setAddress(p.source?.address ?? null)
      setSpecial(p.source?.special ?? "")
      setSocialSpecial(p.socialSpecial ?? "")
      setPriceRange(p.source?.budgetRange ?? "")
      setPriceMode(narrowPriceLabelMode(p.source?.priceLabelMode))
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
        priceLabelMode: narrowPriceLabelMode(p.source?.priceLabelMode),
        amenities: p.source?.amenities ?? null,
      }
      const seed = p.sourceContentId ?? undefined
      const storedHead = p.overlayHeadline ?? ""
      const genHead = buildTemplateHeadline(tpl, meta)
      // Manual if a non-empty stored headline matches neither the current template's output nor any
      // supported market/type Hero form; otherwise it is generated → re-sync to the template.
      const hDirty = !!storedHead && storedHead !== genHead && !isGeneratedHeadline(storedHead)
      setHeadlineDirty(hDirty)
      const loadedHeadline = hDirty ? storedHead : genHead
      setHeadline(loadedHeadline)
      // Baseline for the "has the user touched an overlay-affecting field this session?" check
      // below — exactly the values just set, so a fresh load never itself counts as edited.
      overlayBaselineRef.current = { mode: p.overlayMode === "existing" ? "existing" : "generate", template: tpl, headline: loadedHeadline }
      const storedCap = p.caption ?? ""
      const cDirty = !isGeneratedCaption(storedCap, meta, seed)
      setCaptionDirty(cDirty)
      setCaption(cDirty ? storedCap : buildCaption(meta, seed, tpl))
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

  // (Enlarged video preview Escape/backdrop/X close is owned by the shared VideoLightbox below.)

  const fieldsBody = useCallback(
    () => ({
      postName, postType, caption, socialSpecial: socialSpecial || null,
      overlayHeadline: headline,
      overlaySubheadline: overlayMode === "generate" ? buildTemplateDetail(overlayTemplate, { market, propertyType, special: special || null, socialSpecial: socialSpecial || null, budgetRange: priceRange || null, priceLabelMode: priceMode, amenities: amenities || null }) : "",
      overlayMode, overlayTemplate, hashtags, audioChoice, voiceHookId, voiceCtaId,
    }),
    [postName, postType, caption, socialSpecial, headline, overlayMode, overlayTemplate, market, propertyType, special, priceRange, priceMode, amenities, hashtags, audioChoice, voiceHookId, voiceCtaId],
  )

  // Persist the public-safe SOURCE facts to social_content (reuses the canonical content PATCH,
  // which also keeps place_id + auto-display-name behavior). Internal fields are never touched.
  const patchSource = useCallback(async (): Promise<boolean> => {
    if (!sourceContentId) return true
    const res = await fetch(`/api/admin/social-autopilot/content/${encodeURIComponent(sourceContentId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyName, propertyType, market, placeId, special, budgetRange: priceRange, priceLabelMode: priceMode, amenities }),
    })
    return res.ok
  }, [sourceContentId, propertyName, propertyType, market, placeId, special, priceRange, priceMode, amenities])

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
        body: JSON.stringify({
          sourceContentId,
          // A Twice Daily rule runs EVERY day at the two configured times; the interval selector
          // does not apply to it, so it is pinned to 1 rather than carrying a stale 14/30/60.
          intervalDays: cadence === "daily_times" ? 1 : repeatEvery,
          placementPref: placement,
          duration: durationBody(),
          cadence,
          ...(cadence === "daily_times" ? { dailyTimes: [firstTimeMin, secondTimeMin] } : {}),
        }),
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
    // Publish/autoschedule is the INSTAGRAM scheduler. If TikTok is selected there is no TikTok
    // scheduler — publishing would silently schedule an Instagram post. Block it (the button is
    // also disabled); TikTok's action is "Post to TikTok (Sandbox)".
    if (selectedPlatforms.has("tiktok")) {
      setError("TikTok is selected. Use “Post to TikTok (Sandbox)” to post to TikTok, or deselect TikTok to schedule Instagram.")
      return
    }
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
  // PREVIEW VIDEO — produce (or reuse) the REAL rendered MP4 so the locator can hear the finished
  // mix (overlays + music choice + Hook + CTA + ducking) BEFORE publishing. It runs the SAME
  // /render route and renderReel path Publish uses, so what plays here is the artifact Publish would
  // send if nothing changes afterwards. It never publishes, schedules, or touches recurrence.
  //
  // Reuse: persistence happens first, and the PATCH route already sets render_status back to 'none'
  // whenever a render-affecting field changed. So a freshly re-read post that still says 'ready'
  // proves the existing derivative is current and is simply replayed — no second cache is invented.
  const previewVideo = async () => {
    setPreviewing(true); setError(null); setNotice(null)
    try {
      const okSource = await patchSource()
      if (!okSource) { setError("Couldn't save before rendering."); return }
      const saved = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fieldsBody()),
      })
      if (!saved.ok) { setError("Couldn't save before rendering."); return }
      // Re-read to see whether that save invalidated the previous render.
      const fresh = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}`, { headers: { Accept: "application/json" } })
      const freshPost = fresh.ok ? ((await fresh.json()) as Post) : null
      const stillValid = freshPost?.renderStatus === "ready" && !!freshPost?.renderedPreviewUrl
      if (!stillValid) {
        const res = await fetch(`/api/admin/social-autopilot/posts/${encodeURIComponent(postId)}/render`, { method: "POST" })
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          // The render route surfaces Voice Clip problems verbatim — show them rather than a generic
          // failure, and leave every editor field untouched so nothing is lost.
          setError(j.error && j.error !== "render_failed" ? `Couldn't render: ${j.error}` : "Couldn't render this post. Please try again.")
          return
        }
      }
      await load() // refreshes renderStatus + renderedPreviewUrl, which flips the left player over
      setNotice(stillValid ? "Preview is up to date — press play to hear the final mix." : "Preview ready — press play to hear the final mix.")
    } catch {
      setError("Couldn't render this post. Please try again.")
    } finally {
      setPreviewing(false)
    }
  }

  // NOTE: the /duplicate route and Create Variation are intentionally KEPT — variation is simply no
  // longer one of the three primary editor-completion actions, because hearing the real render
  // before publishing matters more at launch. It now sits as a small secondary link beside the post
  // meta (see below), which is its ONLY entry point in the app today.

  const addTag = (raw: string) => {
    const t = normalizeHashtag(raw)
    if (!t) return
    setHashtags((prev) => (prev.length >= hashtagLimit || prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]))
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
    market, propertyType, special: special || null, socialSpecial: socialSpecial || null, budgetRange: priceRange || null, priceLabelMode: priceMode, amenities: amenities || null, ...over,
  })
  const syncGenerated = (meta: SourceMeta, tpl: OverlayTemplate = overlayTemplate) => {
    if (!headlineDirty) setHeadline(buildTemplateHeadline(tpl, meta))
    // `tpl`, not the overlayTemplate STATE: changeTemplate calls this before the state has settled,
    // and the caption's opener is now template-aware.
    if (!captionDirty) setCaption(buildCaption(meta, sourceContentId ?? undefined, tpl))
    if (!hashtagsDirty) setHashtags(buildHashtags(meta.market, MAX_HASHTAGS, meta.propertyType))
    // Overlay Detail is derived from the template + metadata — no state to set here.
  }
  // Change the overlay template: regenerate the (non-manual) headline AND caption from the new
  // template — the caption's first line is template-aware, so it must move with the selection.
  const changeTemplate = (tpl: OverlayTemplate) => {
    setOverlayTemplate(tpl)
    const meta = metaOf()
    if (!headlineDirty) setHeadline(buildTemplateHeadline(tpl, meta))
    if (!captionDirty) setCaption(buildCaption(meta, sourceContentId ?? undefined, tpl))
  }
  // Overlay DETAIL — derived from the selected template + metadata (never manual).
  const overlayDetail = overlayMode === "generate" ? buildTemplateDetail(overlayTemplate, metaOf()) : ""

  const control = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  // Compact select for the three inline Recurring controls (tighter font/padding) so all three fit
  // one desktop row AND the full "Social Beast chooses" value shows without truncation.
  const controlCompact = "w-full text-[12px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2 py-1.5"
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

  // Instagram publishing stays Reel-based: postType defaults to 'reel' and drives the preview
  // aspect + publish behavior internally. The visible Reel/Story format selector was removed from
  // this editor per the platform-selector redesign; the underlying postType logic is unchanged.
  const aspect = previewAspectClass(post.platform, postType)
  // Has the user changed an overlay-affecting field (mode/template/headline) since this post was
  // loaded? If so the previously rendered MP4 no longer represents the current configuration, so
  // the "faithful" preview below falls back to the live CSS approximation instead of misleadingly
  // showing stale burned-in text. This never touches the render pipeline or the stored asset —
  // load() resets the baseline (and picks up any newly rendered asset) on every reload.
  const overlayEdited = isOverlayPreviewStale(overlayBaselineRef.current, { mode: overlayMode, template: overlayTemplate, headline })
  const rendered = post.renderStatus === "ready" && !!post.renderedPreviewUrl && !overlayEdited
  const previewSrc = rendered ? post.renderedPreviewUrl : post.previewUrl // source for the enlarge modal
  // The chosen template's layout drives the preview (Hero / Center Hook / Center Hook + Detail),
  // shared with the FFmpeg render. 'existing' mode draws no overlay.
  //
  // PLATFORM PARITY: pass post.platform — the SAME field the render route selects and hands to
  // renderReel. The safe box is per platform now, so omitting it here would silently fit the
  // preview to Instagram's 860px while a TikTok render fitted to 764px, reintroducing exactly the
  // preview/burn-in divergence this one-geometry-path architecture exists to prevent.
  //
  // Deliberately NOT `selectedPlatforms`: that selector is UI-only preparation for the eventual
  // multi-platform workflow and does not change post.platform or what gets rendered.
  const overlayLayout = overlayMode === "existing" ? null : computeOverlayLayout(overlayTemplate, headline, overlayDetail, post.platform)

  // Posting mode toggle (Post Once / Recurring) — reused as-is in two positions: above the Repeat
  // settings form, and inline in the compact Posting|Scheduled row. Same handler/state either way.
  const postingToggle = (
    <div className="inline-flex rounded-lg border border-[var(--crm-border)] p-0.5">
      {([["once", "Post Once"], ["repeat", "Recurring"]] as const).map(([val, label]) => (
        <button key={val} type="button" onClick={() => setPostingMode(val)} aria-pressed={postingMode === val}
          className={"text-[12px] font-semibold px-3 py-1 rounded-md transition-colors " + (postingMode === val ? "bg-[var(--crm-text-primary)] text-[var(--crm-panel)]" : "text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      {/* Upper row: navigation + status. The platform selector moved beneath the video player (see
          the "Post to" buttons in the left column). "Move back to Draft" lives here, next to the
          status it acts on — it's post-status management, not one of the editor's three primary
          completion actions (Preview Video / Save Draft / Publish) at the bottom. Same
          backToDraft() handler as before; only its position moved. */}
      <div className="mb-3 flex items-center gap-2.5 flex-wrap">
        <button type="button" className={btn} onClick={() => router.push(back.path)}>{back.label}</button>
        <span className="text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-[var(--crm-card)] text-[var(--crm-text-secondary)]">{POST_STATUS_LABEL[post.status] ?? post.status}</span>
        {post.status === "scheduled" && <button type="button" className={btn} disabled={busy || publishing} onClick={() => void backToDraft()}>Move back to Draft</button>}
        {/* Create Variation lives here now rather than in the primary action row — it is a
            post-management action, not an editor-completion one, and Preview Video took its slot.
            This is currently the ONLY entry point to the /duplicate route in the app, so it must
            stay reachable; the natural longer-term home is a Library post-card action. */}
        <button type="button" className={`${btn} ml-auto`} disabled={busy || publishing || previewing} onClick={() => void clonePost()}>Create Variation</button>
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
              // Only shown when nothing overlay-affecting has changed since load (see
              // overlayEdited) — otherwise this MP4 would misleadingly look current when it isn't.
              <video ref={previewVideoRef} src={post.renderedPreviewUrl!} controls controlsList="nofullscreen" disablePictureInPicture playsInline preload="metadata" className="w-full h-full object-cover" />
            ) : post.previewUrl ? (
              <>
                <video src={post.previewUrl} controls controlsList="nofullscreen" disablePictureInPicture muted playsInline preload="metadata" className="w-full h-full object-cover" />
                {/* Pre-render APPROXIMATION overlay (CSS) — SHARED with the enlarged lightbox so
                    both previews render the exact same overlay. Live: reflects Template/Headline
                    edits immediately; null (renders nothing) in 'Already has text' mode. Also the
                    fallback once overlayEdited is true, even for an already-rendered post. */}
                <PreviewOverlay layout={overlayLayout} />
                {/* Informational only — never blocks rendering. See SourceQualityBadge. */}
                <div className="absolute bottom-2 left-2 z-10">
                  <SourceQualityBadge videoUrl={post.previewUrl} />
                </div>
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
            <SafeAreaOverlay platform={safeArea === "off" ? "instagram" : safeArea} show={safeArea !== "off"} />
          </div>

          {/* Safe-area toggle — shows what each app's UI will cover. Presentational: the headline
              fitter reads the same numbers from lib/social/platformSafeArea. */}
          <div className="mt-1.5 flex items-center gap-1">
            <span className="text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)] mr-1">Safe area</span>
            {(["off", "instagram", "tiktok"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setSafeArea(k)}
                className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full border ${safeArea === k
                  ? "border-[var(--crm-accent,#28a745)] text-[var(--crm-text-primary)] bg-[var(--crm-panel)]"
                  : "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"}`}>
                {k === "off" ? "Off" : k === "instagram" ? "Instagram" : "TikTok"}
              </button>
            ))}
          </div>

          {/* REEL COVER — a compact strip under the preview above. No second player: it reads the
              live currentTime of the one already on screen, which is the rendered derivative
              whenever `rendered` is true — the exact file Instagram receives, and therefore what a
              thumb_offset indexes. */}
          {sourceContentId && (
            <ReelCoverControl
              postId={postId}
              contentId={sourceContentId}
              renderReady={rendered}
              getCurrentMs={() => {
                const v = previewVideoRef.current
                return v && Number.isFinite(v.currentTime) ? Math.round(v.currentTime * 1000) : null
              }}
              offsetMs={post.coverThumbOffsetMs ?? null}
              coverPath={post.coverStoragePath ?? null}
              coverUrl={post.coverPreviewUrl ?? null}
              mayHaveShifted={post.coverMayHaveShifted}
              onSaved={() => void load()}
            />
          )}

          {/* ── POST TO — publishing destinations. Three platform buttons on ONE row (icon + name),
              multi-select by design (a Set) so Instagram + TikTok + YouTube can eventually be selected
              together. Instagram is the connected/publishing platform today; selecting TikTok/YouTube
              is UI-only preparation for the multi-platform workflow / TikTok review demo and makes NO
              external API call, connection, or publish. Instagram Reel publishing behavior + default
              are preserved internally (postType stays 'reel'); the format selector is intentionally
              not shown here. ── */}
          <div className="mt-3">
            <span className={fieldLabel}>Post to</span>
            <div className="mt-1 flex items-stretch gap-1 flex-nowrap">
              {PLATFORM_OPTIONS.map(({ id, label, Icon }) => {
                const on = selectedPlatforms.has(id)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    title={`Post to ${label}`}
                    onClick={() => togglePlatform(id)}
                    className={
                      "flex-1 min-w-0 inline-flex items-center justify-center gap-1 text-[11.5px] font-semibold px-1.5 py-2 rounded-lg border whitespace-nowrap transition-colors " +
                      (on
                        ? "border-[var(--crm-accent)] bg-[var(--crm-accent)] text-white"
                        : "border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-secondary)] hover:border-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]")
                    }
                  >
                    <Icon className="shrink-0" size={14} aria-hidden />
                    <span className="truncate">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* TikTok Direct Post (Sandbox MVP) — appears when TikTok is selected in "Post to". Reuses
              the CURRENT rendered video + caption; enabled only when a current render exists. Opens a
              small confirmation (account, caption, Creator-Info-driven privacy/interactions) before
              any post. Does NOT touch Instagram/scheduling/rendering. */}
          {selectedPlatforms.has("tiktok") && (
            <div className="mt-3">
              {/* Always clickable so the click never silently no-ops. The confirmation modal's
                  dry-run authoritatively reports readiness (a post with no current render shows a
                  clear message and NO Post button), so a non-ready post still cannot be posted. */}
              <button
                type="button"
                onClick={() => setTtConfirmOpen(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] hover:border-[var(--crm-text-muted)] transition-colors"
              >
                <SiTiktok size={14} aria-hidden /> Post to TikTok (Sandbox)
              </button>
              <p className="text-[10.5px] text-[var(--crm-text-muted)] mt-1">
                {post.renderStatus === "ready"
                  ? "Direct Post the current render to TikTok. Sandbox posts are private (SELF_ONLY)."
                  : "Render this post first (via Schedule/Publish) to enable TikTok Direct Post."}
              </p>
              <TikTokPostConfirm postId={post.id} open={ttConfirmOpen} onClose={() => setTtConfirmOpen(false)} />
            </div>
          )}

          {/* Rendering happens internally as part of Publish/Schedule — no manual Prepare step. */}
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
                onChange={(v) => { setPropertyName(v); setPlaceId(""); setAddress(null) }}
                onMatch={(m) => { setPropertyName(m.name); setPlaceId(m.placeId); setMarket((mk) => mk || detectMarket(m.address ?? "") || "") }}
                onClearMatch={() => { setPlaceId(""); setAddress(null) }}
              />
              {/* Full street address of the matched property. Read-only and muted —
                  nothing here is editable, and no row renders when the catalog has
                  no address for this place. */}
              {!!placeId && address && (
                <div className="mt-1 text-[11px] leading-snug text-[var(--crm-text-muted)]">{address}</div>
              )}
              {/* Property Research TRIGGER — one line, under the "Matched property"
                  indicator PropertySearchField renders. The expanded PANEL is
                  rendered full-width below this whole row (see after the grid):
                  inside this 2fr cell its inner grids overflowed and dragged the
                  page sideways. Shown only when matched — observations need a
                  property to belong to. */}
              {!!placeId && sourceContentId && (
                <button
                  type="button"
                  onClick={() => setResearchOpen((o) => !o)}
                  aria-expanded={researchOpen}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"
                >
                  <span aria-hidden>{researchOpen ? "▾" : "▸"}</span> Property Research
                </button>
              )}
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

          {/* Property Research PANEL — full editor width, directly beneath the
              Property/Type/Market row whose first cell holds its trigger. */}
          {researchOpen && !!placeId && sourceContentId && (
            <PropertyResearch sourceContentId={sourceContentId} />
          )}

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
              {/* What the number MEANS. Per-source (it describes the footage), so it
                  rides the same source PATCH as the price itself. Existing content
                  has no stored value and reads as "Starting at" — unchanged. */}
              <select
                className="mt-1.5 w-full text-[12px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-secondary)] py-1 px-2 cursor-pointer"
                value={priceMode}
                onChange={(e) => {
                  const v = narrowPriceLabelMode(e.target.value)
                  setPriceMode(v)
                  syncGenerated(metaOf({ priceLabelMode: v }))
                }}
                aria-label="Price label"
              >
                {PRICE_LABEL_MODES.map((m) => (
                  <option key={m} value={m}>{m === "exact_unit" ? "Exact unit shown" : "Starting at"}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Text Overlay — the mode toggle now shares ONE row with Overlay Template/Headline on
              desktop (was its own full-width row above them), each with its label above its control.
              'Generate' shows the Template controls + generated preview/render; 'Already has text'
              hides them and leaves the uploaded video (with its own burned-in text) untouched.
              Overlay Detail's on-screen preview field is gone (it was a pure DERIVED read-only
              display — see overlayDetail below, computed from the template + metadata, never
              user-edited); generation/preview/persistence all still use it exactly as before, this
              only removes its redundant on-screen echo to shorten the editor. */}
          {overlayMode === "generate" ? (
            /* COMPACT one-row overlay controls on desktop: Text Overlay mode | Overlay Template |
               Overlay Headline. Proportions sized to actual content, not equal thirds: the toggle
               only ever shows "Generate"/"Already has text" — needs 25% so "Already has text"
               doesn't wrap; Overlay Template's longest option ("7. Your Apartment Standards") needs
               real room (34%, unchanged); Overlay Headline text is intentionally short (per
               product), so it gives up the 5% the toggle needed — still the widest since it's the
               one free-text field, just less dominant. Wraps to 2 rows on tablet (sm) and stacks on
               mobile — same fields/handlers/values as before, just regrouped/rebalanced. */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[25fr_34fr_41fr] gap-3">
              <div className="block min-w-0">
                <span className={fieldLabel}>Text Overlay</span>
                <div className="mt-1 inline-flex rounded-lg border border-[var(--crm-border)] p-0.5">
                  {([["generate", "Generate"], ["existing", "Already has text"]] as const).map(([val, label]) => (
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
              <label className="block min-w-0">
                <span className={fieldLabel}>Overlay Template</span>
                <select className={`${control} mt-1 cursor-pointer`} value={overlayTemplate} onChange={(e) => changeTemplate(e.target.value as OverlayTemplate)}>
                  {OVERLAY_TEMPLATES.map((t, i) => <option key={t} value={t}>{i + 1}. {OVERLAY_TEMPLATE_LABEL[t]}</option>)}
                </select>
              </label>
              <label className="block min-w-0">
                <span className={fieldLabel}>Overlay Headline</span>
                <input className={`${control} mt-1`} value={headline} onChange={(e) => { setHeadline(e.target.value); setHeadlineDirty(true) }} placeholder="Burned into the video" />
              </label>
            </div>
          ) : (
            // 'Already has text' — just the mode toggle. No informational bar; the toggle label
            // itself ("Already has text") is self-explanatory. Behavior unchanged: overlayLayout
            // is null in this mode, so no overlay is generated or drawn anywhere.
            <div className="block min-w-0 max-w-[280px]">
              <span className={fieldLabel}>Text Overlay</span>
              <div className="mt-1 inline-flex rounded-lg border border-[var(--crm-border)] p-0.5">
                {([["generate", "Generate"], ["existing", "Already has text"]] as const).map(([val, label]) => (
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
                <span className={fieldLabel}>Hashtags <span className={"normal-case " + (hashtags.length > hashtagLimit ? "text-amber-600 dark:text-amber-400" : "text-[var(--crm-text-muted)]")}>{hashtags.length > hashtagLimit ? `(${hashtags.length} · max ${hashtagLimit})` : `(${hashtags.length}/${hashtagLimit})`}</span></span>
                <button type="button" className="text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]" onClick={suggestTags}>Suggest from market</button>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] p-2 min-h-[76px] content-start">
                {hashtags.map((t, i) => (
                  <span key={`${t}-${i}`} className="inline-flex items-center gap-1 h-fit text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[var(--crm-panel)] border border-[var(--crm-border)] text-[var(--crm-text-primary)]">
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => removeTag(i)}>×</button>
                  </span>
                ))}
                {hashtags.length < hashtagLimit && (
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
              <span className="text-[10.5px] text-[var(--crm-text-muted)]">{hashtags.length > hashtagLimit ? `Over the ${hashtagLimit}-tag limit for the selected platforms — remove ${hashtags.length - hashtagLimit} before publishing.` : hashtags.length === hashtagLimit ? `${hashtagLimit}-tag limit for the selected platforms reached — remove one to add another.` : "Added to the caption when published (kept separate here)."}</span>

              {/* Music | Voice Clips — 50/50 on one row, equal height/width. Music keeps the
                  existing audio behavior; Voice Clips selects reusable Hook (start) + CTA (end)
                  overlays from the library. Both triggers use the same `control` styling. */}
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={fieldLabel}>Music</span>
                  <select
                    aria-label="Music"
                    value={audioChoice}
                    onChange={(e) => e.target.value !== "lb_track" && setAudioChoice(e.target.value)}
                    className={`${control} mt-1 cursor-pointer`}
                  >
                    {AUDIO_OPTIONS.map((a) => (
                      <option key={a.key} value={a.key} disabled={a.disabled}>{a.label}{a.note ? ` — ${a.note}` : ""}</option>
                    ))}
                  </select>
                </label>
                <div className="block">
                  <span className={fieldLabel}>Voice Clips</span>
                  <div className="mt-1">
                    <VoiceClipsControl
                      triggerClassName={control}
                      hookId={voiceHookId}
                      ctaId={voiceCtaId}
                      onChange={({ hookId, ctaId }) => { setVoiceHookId(hookId); setVoiceCtaId(ctaId) }}
                    />
                  </div>
                </div>
              </div>

              {/* Posting — Post Once (manual date/time) or Repeat (recurring), exposed INLINE (no need
                  to open the calendar first). Repeat reuses the existing recurrence backend. The
                  common case (Post Once, not mid-edit) compacts Posting + Scheduled into one desktop
                  row instead of a stacked toggle + a large standalone Scheduled card — same data
                  (fmtSchedule(scheduleVal)), just laid out side by side with the label above each
                  control; the "Social Beast selected the next open slot." sentence is dropped as
                  redundant. The Recurring summary card and the Repeat settings form are unchanged. */}
              <div className="block mt-3">
                {rule && !editingRule ? (
                  /* ── Active / Paused: collapsed summary (no toggle, no verbose copy) ── */
                  <>
                    <span className={`${fieldLabel} block mb-2`}>Posting</span>
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
                  </>
                ) : editingRule || postingMode === "repeat" ? (
                  <>
                    <span className={`${fieldLabel} block mb-2`}>Posting</span>
                    {!editingRule && postingToggle}
                    {/* Recurring settings — ONE compact horizontal row on desktop (Repeat Post |
                        Duration | Posting time), stacking only on narrow screens. NO activation
                        button — the green Publish (below) activates recurrence. */}
                    <div className="mt-2 flex flex-col gap-2">
                      {/* Three settings on ONE desktop row (stacks on narrow screens). Explicit
                          proportional widths 30/29/41 — Posting time is the WIDEST (41%) so its
                          longest value "Social Beast chooses" shows in full (verified at the
                          1200px-capped desktop layout: ~132px text room vs ~120px text); Duration
                          (29%) is narrower than Repeat Post but still fits "Until stopped". NOT
                          max-content — that sized selects to their widest OPTION and starved
                          Posting time in production. */}
                      <div className="grid grid-cols-1 sm:grid-cols-[30fr_29fr_41fr] gap-2.5">
                        <label className="block min-w-0">
                          <span className="text-[11px] text-[var(--crm-text-muted)]">Repeat Post</span>
                          {/* The existing interval options are untouched; "Twice Daily" is an extra
                              entry that switches cadence rather than changing what the day values mean. */}
                          <select className={`${controlCompact} mt-1 cursor-pointer`}
                            value={cadence === "daily_times" ? "twice-daily" : String(repeatEvery)}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v === "twice-daily") setCadence("daily_times")
                              else { setCadence("interval"); setRepeatEvery(Number(v)) }
                            }}>
                            <option value="twice-daily">Twice Daily</option>
                            <option value="14">Every 14 days</option><option value="30">Every 30 days</option><option value="60">Every 60 days</option>
                          </select>
                        </label>
                        {cadence === "daily_times" && (
                          <>
                            <label className="block min-w-0">
                              <span className="text-[11px] text-[var(--crm-text-muted)]">First post</span>
                              <select className={`${controlCompact} mt-1 cursor-pointer`} value={firstTimeMin} onChange={(e) => setFirstTimeMin(Number(e.target.value))}>
                                {TIME_CHOICES.map((t) => <option key={t.min} value={t.min}>{t.label}</option>)}
                              </select>
                            </label>
                            <label className="block min-w-0">
                              <span className="text-[11px] text-[var(--crm-text-muted)]">Second post</span>
                              <select className={`${controlCompact} mt-1 cursor-pointer`} value={secondTimeMin} onChange={(e) => setSecondTimeMin(Number(e.target.value))}>
                                {TIME_CHOICES.map((t) => <option key={t.min} value={t.min}>{t.label}</option>)}
                              </select>
                            </label>
                          </>
                        )}
                        <label className="block min-w-0">
                          <span className="text-[11px] text-[var(--crm-text-muted)]">Duration</span>
                          <select className={`${controlCompact} mt-1 cursor-pointer`}
                            value={durationMode === "days" ? `d${durationDays}` : durationMode === "date" ? "date" : "until"}
                            onChange={(e) => { const v = e.target.value; if (v === "date") setDurationMode("date"); else if (v === "until") setDurationMode("until_stopped"); else { setDurationMode("days"); setDurationDays(Number(v.slice(1))) } }}>
                            <option value="d30">30 days</option><option value="d60">60 days</option><option value="d90">90 days</option><option value="date">Custom date</option><option value="until">Until stopped</option>
                          </select>
                        </label>
                        <label className="block min-w-0">
                          <span className="text-[11px] text-[var(--crm-text-muted)]">Posting time</span>
                          <select className={`${controlCompact} mt-1 cursor-pointer`} value={placement} onChange={(e) => setPlacement(e.target.value as "any" | "morning" | "midday" | "evening")}>
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
                  </>
                ) : (
                  /* Post Once, not mid-edit: Posting (toggle) | Scheduled — one compact desktop row,
                     each label above its control, stacking on mobile. */
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className={fieldLabel}>Posting</span>
                      <div className="mt-1">{postingToggle}</div>
                    </div>
                    <div>
                      <span className={fieldLabel}>Scheduled</span>
                      {scheduleVal ? (
                        // Read-only; any later override happens from the Calendar/Queue, not here.
                        <div className="mt-1 text-[13px] text-[var(--crm-text-primary)]">{fmtSchedule(scheduleVal)}</div>
                      ) : (
                        // Not yet placed. Publish hands it to Social Beast, which picks the next open
                        // slot — no date/time picker here.
                        <div className="mt-1 text-[10.5px] text-[var(--crm-text-muted)]">Social Beast will add this to the next open posting slot.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Action row: exactly the three primary editor-completion actions — Preview Video +
                  Save Draft (secondary, equal weight), Publish (primary green — hands the post to
                  Social Beast for automatic placement; NO Instagram publish). "Move back to Draft" is
                  post-status management, not a completion action — it now lives next to the status
                  pill at the top of the editor (same backToDraft() handler). */}
              <div className="mt-3 flex items-center justify-end gap-2 flex-wrap">
                {/* Preview Video replaces Create Variation in the primary row: hearing the real
                    render (overlays + music choice + Hook + CTA + ducking) is the action a locator
                    needs before publishing. It renders through the SAME route Publish uses and
                    publishes/schedules nothing. Variation moved to a secondary link above. */}
                <button type="button" className={actionSecondary} disabled={busy || publishing || previewing} onClick={() => void previewVideo()}>{previewing ? "Rendering…" : "Preview Video"}</button>
                <button type="button" className={actionSecondary} disabled={busy || publishing || previewing} onClick={() => void saveDraft()}>{busy ? "Saving…" : "Save Draft"}</button>
                <button type="button" className={actionGreen} disabled={busy || publishing || previewing || selectedPlatforms.has("tiktok")} onClick={() => void publish()}>{publishing ? "Publishing…" : "Publish"}</button>
              </div>
              {/* Publish/autoschedule is the Instagram scheduler; there is no TikTok scheduler yet.
                  When TikTok is selected, Publish is disabled to prevent an accidental Instagram
                  schedule — TikTok's action is "Post to TikTok (Sandbox)". */}
              {selectedPlatforms.has("tiktok") && (
                <p className="mt-1.5 text-right text-[10.5px] text-[var(--crm-text-muted)]">Publish schedules Instagram only. TikTok is selected — post it with “Post to TikTok (Sandbox),” or deselect TikTok to schedule Instagram.</p>
              )}
            </div>
          </div>
          </>
          )}
        </div>
      </div>

      {/* Enlarged 9:16 video preview — the SHARED lightbox (also used by History thumbnails). The
          pre-render text approximation (PreviewOverlay) is layered only when the burned-in rendered
          derivative isn't the source; the render already has its text baked in. */}
      {lightbox && (
        <VideoLightbox
          src={lightbox}
          onClose={() => setLightbox(null)}
          overlay={!rendered ? <PreviewOverlay layout={overlayLayout} /> : undefined}
        />
      )}
    </div>
  )
}
