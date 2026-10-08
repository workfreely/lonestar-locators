"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { DEMO_LIBRARY } from "./demoFixtures"
import { SOCIAL_MARKETS, normalizeSocialMarket } from "@/lib/social/markets"
import { formatSocialDisplayName } from "@/lib/social/displayName"
import PreviewOverlay from "@/components/crm/social/PreviewOverlay"
import { computeOverlayLayout, type OverlayLayout } from "@/lib/social/overlaySpec"
import { OVERLAY_TEMPLATES, OVERLAY_TEMPLATE_LABEL, DEFAULT_OVERLAY_TEMPLATE } from "@/lib/social/composePost"
import { PROPERTY_TYPES } from "@/lib/social/propertyTypes"
import { inferFromFilename, detectMarket, suggestArea } from "@/lib/social/filenameInference"
import { resolvePropertyMatch } from "@/lib/social/resolveProperty"
import BulkReview from "@/components/crm/social/BulkReview"
import PropertySearchField from "@/components/crm/social/PropertySearchField"
import AreaSelect from "@/components/crm/social/AreaSelect"
import SpecialSelect from "@/components/crm/social/SpecialSelect"
import AmenitySelect from "@/components/crm/social/AmenitySelect"
import { propertyNamePrefill } from "@/lib/social/intakeFields"
import { parseAmenities, serializeAmenities } from "@/lib/social/amenities"
import { PRICE_LABEL_MODES, priceLabelMode as narrowPriceLabelMode, type PriceLabelMode } from "@/lib/social/composePost"

// Public-post overrides once stored on a source (social_content.details.preparedPost). Retained
// for the Item shape / backward compatibility; the editor lives in PostEditor now, not here.
type PreparedPost = { overlayHeadline: string; overlaySubheadline: string; caption: string; hashtags: string[] }

// Social Autopilot → Library (platform-admin only; server-enforced). SA1.1: multi-file
// upload with a one-time batch setup (Market + Property + shared metadata), per-file
// progress, browser-generated 9:16 posters, individual + BULK metadata editing, and real
// search / market filter / sort over real records.
//
// INVARIANT: one social_content row = one ORIGINAL source video. Market / Property /
// Display Name are organizational METADATA only — they never determine the storage path
// and never move/rename/re-upload the underlying private object. The immutable storage
// identity is {owner}/{contentId}/source.<ext>; the original filename is preserved forever
// (shown on hover). When there are zero real rows the grid shows isolated UI-only SAMPLE
// cards (never DB rows, never selectable, never uploaded); one real row hides them.

type Item = {
  id: string
  kind: string
  displayName: string | null
  nameCustomized: boolean
  uploadBatchId: string | null
  batchSeq: number | null
  originalFilename: string | null
  propertyName: string | null
  propertyType: string | null
  market: string | null
  areaNeighborhood: string | null
  special: string | null
  budgetRange: string | null
  amenities: string | null
  tags: string[]
  notes: string | null
  placeId: string | null
  createdAt: string
  previewUrl: string | null
  preparedPost: PreparedPost | null // saved public-post overrides (from social_content.details)
}

type Card = {
  key: string
  // STORED name, exactly as it sits in social_content.display_name. Everything
  // non-visual reads this one: the search box below matches against it, and
  // post_name snapshots copy it verbatim.
  displayName: string
  // The same name formatted for READING (ISO dates → "Oct 2, 2026"). Rendered,
  // and nothing else. Kept separate from displayName on purpose — reformatting
  // that field in place would silently change what the search box matches, so a
  // locator typing "2026-10" would stop finding their own videos.
  titleLabel: string
  propertyName: string | null
  market: string | null
  marketLabel: string // normalized (Dallas/Fort Worth → DFW) for filter + sort
  sortDate: number
  originalFilename: string | null
  previewUrl: string | null
  // The saved draft's overlay, rebuilt from persisted values — null when this
  // source has no draft, or when the draft is in "existing" mode (the video
  // already carries its own text, so drawing ours would double it).
  draftOverlay: OverlayLayout | null
  hue: number | null
  demo: boolean
  raw?: Item
  // Set ONLY on Rendered/Ready cards: the finished creative this card represents. Working cards
  // carry `raw` (the source) instead. Exactly one of the two is present, which is what lets the
  // shared card JSX route a click to the right place.
  post?: RenderedPost
}

/** A post with a usable artifact — one Rendered/Ready card. `hasRender` is computed server-side
 *  so the library and the editor cannot disagree about what "rendered" means. */
type RenderedPost = {
  id: string
  postName: string | null
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  externalPostUrl: string | null
  renderVersion: number | null
  renderedPreviewUrl: string | null
  sourceContentId: string | null
  sourceStoragePath: string | null
  overlayTemplate: string | null
  propertyName: string | null
  market: string | null
  createdAt: string | null
  updatedAt: string | null
}

// Per-file upload state (batch upload progress).
type UploadFile = {
  uid: string
  contentId: string
  file: File
  seq: number
  status: "pending" | "uploading" | "done" | "error"
  error?: string
}

type BatchMeta = {
  market: string
  areaNeighborhood: string
  propertyName: string
  propertyType: string
  placeId: string | null
  matched: boolean
  special: string
  budgetRange: string
  amenities: string
  notes: string
  overlayMode: "generate" | "existing"
  /** Per-SOURCE meaning of Starting At — same field the Post Editor sets, captured at intake. */
  priceLabelMode: PriceLabelMode
}

const SORTS = ["Newest", "Oldest", "Property", "Market"] as const
type Sort = (typeof SORTS)[number]

const UPLOAD_CONCURRENCY = 3

const base = (name: string | null) => (name ? name.replace(/\.[^.]+$/, "") : "")
/** Human label for a template id, read from the canonical catalog so a renamed or added template
 *  never needs a second list here. Falls back to the raw id rather than hiding an unknown value. */
const templateLabel = (id: string | null): string =>
  (id && OVERLAY_TEMPLATE_LABEL[id as keyof typeof OVERLAY_TEMPLATE_LABEL]) || id || "—"
const extOf = (name: string) => (name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4"

// RFC-4122 v4 — MUST match the server's UUID gate (it validates contentId + storage path).
function uuidv4(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"))
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`
}

// Bounded-concurrency pool — a slow/failing file never blocks the others.
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let idx = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = idx++
      await worker(items[cur])
    }
  })
  await Promise.all(runners)
}

// 9:16 thumbnail. Real item → seeked poster frame (click to play). Demo → color block.
function Thumb({ card }: { card: Card }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  if (card.demo || !card.previewUrl) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: `linear-gradient(160deg, hsl(${card.hue ?? 220} 55% 42%), hsl(${(card.hue ?? 220) + 30} 55% 28%))` }}
      >
        <span className="h-8 w-8 rounded-full bg-white/85 text-black text-[12px] flex items-center justify-center pl-0.5">▶</span>
      </div>
    )
  }
  return (
    <div className="relative w-full h-full" title={card.originalFilename ?? undefined}>
      {card.raw?.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.previewUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <video
          ref={ref}
          src={card.previewUrl}
          muted
          playsInline
          preload="metadata"
          controls={playing}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            try {
              v.currentTime = Math.min(0.6, (isFinite(v.duration) ? v.duration : 2) / 2)
            } catch {
              /* seeking unsupported — first frame stands */
            }
          }}
          className="w-full h-full object-cover bg-black"
        />
      )}
      {/* SAVED DRAFT overlay — the shared PreviewOverlay, same as the editor and
          the lightbox. It stays visible during playback (matching the editor),
          and is pointer-events-none so the play button and the native controls
          underneath remain clickable. */}
      <PreviewOverlay layout={card.draftOverlay} />
      {!playing && (
        <button
          type="button"
          aria-label="Play preview"
          onClick={() => {
            setPlaying(true)
            ref.current?.play().catch(() => {})
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/10 transition-colors"
        >
          <span className="h-8 w-8 rounded-full bg-white/90 text-black text-[12px] flex items-center justify-center pl-0.5">▶</span>
        </button>
      )}
    </div>
  )
}

/**
 * Rebuild a source's SAVED DRAFT overlay from persisted values.
 *
 * This is the same expression the editor uses for its pre-render preview
 * (PostEditor.tsx: `overlayMode === "existing" ? null : computeOverlayLayout(...)`)
 * with the editor's live state replaced by what Save Draft actually wrote. There
 * is deliberately no second rendering path: the geometry comes from
 * computeOverlayLayout and the pixels from <PreviewOverlay>, the same two the
 * editor, the lightbox and BulkReview all go through.
 *
 * Pricing needs no recomputation here. Save Draft persists the composed detail
 * line — buildTemplateDetail(template, {market, type, special, budgetRange, …}) —
 * into overlay_subheadline, so the stored value already carries the price.
 *
 * Returns null (→ raw source video, exactly as before) when:
 *   • the source has no non-published post at all,
 *   • the draft is in "existing" mode — the video already has text burned in, so
 *     layering ours would double it, which is why the editor nulls out too,
 *   • or the draft has no headline yet (a post created but never edited).
 *
 * When a source has several drafts the NEWEST by updated_at wins, so re-saving a
 * draft is reflected on the next library load.
 */
function draftOverlayFor(posts: {
  status: string; overlayMode: string; overlayTemplate: string | null
  overlayHeadline: string | null; overlaySubheadline: string | null; updatedAt: string | null
  platform: string | null
}[] | undefined): OverlayLayout | null {
  if (!posts || posts.length === 0) return null
  const newest = [...posts].sort(
    (a, b) => (Date.parse(b.updatedAt ?? "") || 0) - (Date.parse(a.updatedAt ?? "") || 0),
  )[0]
  if (!newest) return null
  if (newest.overlayMode === "existing") return null
  const headline = (newest.overlayHeadline ?? "").trim()
  if (!headline) return null
  const tpl = (OVERLAY_TEMPLATES as readonly string[]).includes(newest.overlayTemplate ?? "")
    ? (newest.overlayTemplate as string)
    : DEFAULT_OVERLAY_TEMPLATE
  // PLATFORM PARITY: the draft's own platform — the same field the render route reads — so this
  // card preview is fitted to the same safe box the burn-in will use. `?? undefined` lets
  // computeOverlayLayout apply its documented Instagram fallback for a row that predates the
  // column; it is never silently forced to Instagram for a post that HAS a platform.
  return computeOverlayLayout(tpl, headline, newest.overlaySubheadline ?? "", newest.platform ?? undefined)
}

export default function SocialAutopilotClient() {
  const router = useRouter()
  // A YYYY-MM-DD carried from the Calendar's "Create Post" on a specific date; passed on to
  // the editor so the scheduled date prefills after a source video is chosen.
  const [scheduleDate, setScheduleDate] = useState("")
  useEffect(() => {
    if (typeof window === "undefined") return
    const v = new URLSearchParams(window.location.search).get("scheduleDate") ?? ""
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) setScheduleDate(v)
  }, [])
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [market, setMarket] = useState("All")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<Sort>("Newest")

  // Upload flow.
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null) // 1-file quick setup
  const [bulkFiles, setBulkFiles] = useState<File[] | null>(null) // 2+ files → Bulk Review
  const [batch, setBatch] = useState<BatchMeta>({ market: "", areaNeighborhood: "", propertyName: "", propertyType: "", placeId: null, matched: false, special: "", budgetRange: "", amenities: "", notes: "", overlayMode: "generate", priceLabelMode: "starting_at" })
  const [uploads, setUploads] = useState<UploadFile[] | null>(null) // active/finished progress list
  const [uploadingBatch, setUploadingBatch] = useState(false)

  // Bulk selection (real rows only).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Bulk delete — confirmation gate + in-flight flag. Nothing is deleted until the
  // modal's destructive action is pressed.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [bulkKind, setBulkKind] = useState<null | "market" | "property">(null)
  const [bulkValue, setBulkValue] = useState("")
  const [bulkPlaceId, setBulkPlaceId] = useState<string | null>(null) // canonical id when a match is picked
  const [bulkMatched, setBulkMatched] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  // Source metadata is now edited inside PostEditor (the single editor). The Library only creates
  // posts, opens the single editable draft, and deletes source videos.

  // Per-source rollup of EDITABLE (non-published) posts. Drives the "Edit Post" workflow:
  // 0 → create+open, 1 → open it, >1 → let the operator pick (never silently guess).
  type EditablePost = {
    id: string; status: string; scheduledAt: string | null; name: string
    // Persisted overlay state — enough to rebuild the draft's preview without a
    // second fetch. updatedAt picks the newest draft when a source has several.
    overlayMode: string; overlayTemplate: string | null
    overlayHeadline: string | null; overlaySubheadline: string | null
    updatedAt: string | null
    // The post's publishing platform — carried so the card preview is fitted to the same safe
    // area the render path uses for this post.
    platform: string | null
  }
  const [postsBySource, setPostsBySource] = useState<Record<string, EditablePost[]>>({})
  // Rendered/Ready inventory — posts holding a usable artifact, INCLUDING published ones. They are
  // reusable history (what went out, with which template and footage), so hiding them once live
  // would throw away the thing that makes this a library rather than a queue.
  const [renderedPosts, setRenderedPosts] = useState<RenderedPost[]>([])
  const [tab, setTab] = useState<"working" | "rendered">("working")
  const [editMenuFor, setEditMenuFor] = useState<string | null>(null) // source id whose picker is open

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/admin/social-autopilot/content", { headers: { Accept: "application/json" } })
      if (!res.ok) {
        setError(res.status === 403 ? "Not authorized." : "Couldn't load the library.")
        setItems([])
        return
      }
      const json = (await res.json()) as { items?: Item[] }
      setItems(Array.isArray(json.items) ? json.items : [])
    } catch {
      setError("Couldn't load the library.")
      setItems([])
    }
    // Editable-post rollup (best-effort; a failure just falls back to create-on-click).
    try {
      const pres = await fetch("/api/admin/social-autopilot/posts", { headers: { Accept: "application/json" } })
      if (pres.ok) {
        const pj = (await pres.json()) as {
          items?: {
            id: string; sourceContentId: string | null; status: string; scheduledAt: string | null; postName: string | null
            overlayMode?: string | null; overlayTemplate?: string | null
            overlayHeadline?: string | null; overlaySubheadline?: string | null; updatedAt?: string | null
            platform?: string | null
            hasRender?: boolean; renderedPreviewUrl?: string | null; renderVersion?: number | null
            sourceStoragePath?: string | null; publishedAt?: string | null; externalPostUrl?: string | null
            createdAt?: string | null
            source: { propertyName: string | null; displayName: string | null; market?: string | null } | null
          }[]
        }
        const map: Record<string, EditablePost[]> = {}
        const rendered: RenderedPost[] = []
        for (const p of pj.items ?? []) {
          // RENDERED/READY: a usable artifact exists. `hasRender` is the server's own predicate
          // (render_status = 'ready' AND rendered_storage_path IS NOT NULL) and deliberately
          // ignores status, so Ready, Scheduled and Published all qualify.
          if (p.hasRender) {
            rendered.push({
              id: p.id, postName: p.postName, status: p.status,
              scheduledAt: p.scheduledAt, publishedAt: p.publishedAt ?? null,
              externalPostUrl: p.externalPostUrl ?? null,
              renderVersion: p.renderVersion ?? null,
              renderedPreviewUrl: p.renderedPreviewUrl ?? null,
              sourceContentId: p.sourceContentId,
              sourceStoragePath: p.sourceStoragePath ?? null,
              overlayTemplate: p.overlayTemplate ?? null,
              propertyName: p.source?.propertyName ?? null,
              market: p.source?.market ?? null,
              createdAt: p.createdAt ?? null, updatedAt: p.updatedAt ?? null,
            })
          }
          const sid = p.sourceContentId
          if (!sid || p.status === "published") continue // the WORKING rollup stays editable-only
          ;(map[sid] ??= []).push({
            id: p.id, status: p.status, scheduledAt: p.scheduledAt,
            name: p.source?.propertyName || p.source?.displayName || p.postName || "Untitled",
            overlayMode: p.overlayMode ?? "generate",
            overlayTemplate: p.overlayTemplate ?? null,
            overlayHeadline: p.overlayHeadline ?? null,
            overlaySubheadline: p.overlaySubheadline ?? null,
            updatedAt: p.updatedAt ?? null,
            platform: p.platform ?? null,
          })
        }
        setPostsBySource(map)
        setRenderedPosts(rendered)
      }
    } catch { /* non-fatal */ }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const usingDemo = items !== null && items.length === 0

  // Property facts for a rendered card, looked up from the ONE social_content row the post points
  // at — never copied onto the post. This is the reuse guarantee made visible: two rendered cards
  // for the same property read the same record, so they cannot show different prices.
  const sourceById = useMemo(() => {
    const m: Record<string, Item> = {}
    for (const it of items ?? []) m[it.id] = it
    return m
  }, [items])

  // Unify real + demo into a common card shape.
  const allCards: Card[] = useMemo(() => {
    if (items && items.length > 0) {
      return items.map((it) => ({
        key: it.id,
        displayName: it.displayName || it.propertyName || base(it.originalFilename) || "Untitled",
        titleLabel: formatSocialDisplayName(
          it.displayName || it.propertyName || base(it.originalFilename) || "Untitled",
        ),
        propertyName: it.propertyName,
        market: it.market,
        marketLabel: normalizeSocialMarket(it.market),
        sortDate: new Date(it.createdAt).getTime() || 0,
        originalFilename: it.originalFilename,
        previewUrl: it.previewUrl,
        draftOverlay: draftOverlayFor(postsBySource[it.id]),
        hue: null,
        demo: false,
        raw: it,
      }))
    }
    if (usingDemo) {
      return DEMO_LIBRARY.map((d, i) => ({
        key: d.id,
        displayName: d.displayName,
        titleLabel: formatSocialDisplayName(d.displayName),
        propertyName: d.propertyName,
        market: d.market,
        marketLabel: normalizeSocialMarket(d.market),
        sortDate: DEMO_LIBRARY.length - i,
        originalFilename: d.originalFilename,
        previewUrl: null,
        draftOverlay: null,
        hue: d.hue,
        demo: true,
      }))
    }
    return []
  }, [items, usingDemo, postsBySource])

  // Market chips: the primary SA taxonomy (San Antonio / Austin / DFW / Houston) is always
  // shown; any other normalized market present in the data is appended (extensible).
  const marketChips = useMemo(() => {
    const present = new Set(allCards.map((c) => c.marketLabel).filter(Boolean))
    const extras = Array.from(present).filter((m) => !SOCIAL_MARKETS.includes(m)).sort()
    return ["All", ...SOCIAL_MARKETS, ...extras]
  }, [allCards])

  // ABSOLUTE inventory per market, counted from allCards — the UNFILTERED list.
  // Counting `cards` instead would make every number move the moment a market is
  // picked or a search is typed, which defeats the question these answer: "how
  // much reusable inventory do I have here?" Keyed on the same marketLabel the
  // filter compares against, so a pill's number always equals what clicking it
  // yields. Dallas and DFW stay distinct — normalizeSocialMarket only trims.
  const marketCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of allCards) counts.set(c.marketLabel, (counts.get(c.marketLabel) ?? 0) + 1)
    counts.set("All", allCards.length)
    return counts
  }, [allCards])

  // ── RENDERED / READY — POST-CENTRIC CARDS ────────────────────────────────────────────────
  //
  // The Working tab is SOURCE-centric: one card per social_content, which is the upload-and-prepare
  // workflow and is unchanged. The Rendered tab is POST-centric: one card per finished artifact.
  //
  // The differing cardinality is deliberate, not a bug. One property can carry several creatives
  // (different template, different headline, different footage), and once rendered each is its own
  // reusable asset with its own history. So a source with three posts, two of them rendered, shows
  // ONE Working card and TWO Rendered cards.
  //
  // Both tabs build the SAME `Card` shape and render through the SAME JSX below, so the two tabs
  // cannot visually drift — the tab chooses the array, never the renderer.
  const renderedCards: Card[] = useMemo(() => {
    const out: Card[] = []
    for (const p of renderedPosts) {
      const src = p.sourceContentId ? sourceById[p.sourceContentId] : undefined
      const name = p.propertyName || src?.propertyName || src?.displayName || p.postName || "Untitled"
      out.push({
        key: p.id, // the POST is the identity here, not the source
        displayName: name,
        titleLabel: formatSocialDisplayName(name),
        propertyName: p.propertyName ?? src?.propertyName ?? null,
        market: p.market ?? src?.market ?? null,
        marketLabel: normalizeSocialMarket(p.market ?? src?.market ?? null),
        // Sorted by when the creative last changed, so a freshly rendered version surfaces first.
        sortDate: new Date(p.updatedAt ?? p.createdAt ?? 0).getTime() || 0,
        originalFilename: src?.originalFilename ?? null,
        // The RENDERED derivative — what actually went out, overlay burned in.
        previewUrl: p.renderedPreviewUrl ?? null,
        // The overlay is already in the pixels; drawing the CSS preview on top would double it.
        draftOverlay: null,
        hue: null,
        // No `raw`: a Rendered card is a POST, not a source row. The card JSX branches on which of
        // the two is present, so leaving this undefined is what routes the click to the post.
        demo: false,
        post: p,
      })
    }
    return out
  }, [renderedPosts, sourceById])

  // Tab counts are of the FULL set, not the filtered view, so switching tabs never looks empty
  // because a market chip is still applied from the other tab.
  const workingCount = allCards.filter((c) => !c.demo).length

  const cards = useMemo(() => {
    let list = tab === "rendered" ? renderedCards : allCards
    if (market !== "All") list = list.filter((c) => c.marketLabel === market)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((c) => [c.displayName, c.propertyName, c.originalFilename].some((v) => (v ?? "").toLowerCase().includes(q)))
    const sorted = [...list]
    if (sort === "Newest") sorted.sort((a, b) => b.sortDate - a.sortDate)
    else if (sort === "Oldest") sorted.sort((a, b) => a.sortDate - b.sortDate)
    else if (sort === "Property") sorted.sort((a, b) => (a.propertyName ?? "").localeCompare(b.propertyName ?? ""))
    else if (sort === "Market") sorted.sort((a, b) => a.marketLabel.localeCompare(b.marketLabel))
    return sorted
  }, [allCards, renderedCards, tab, market, search, sort])

  // Visible REAL ids (demo never counts toward selection).
  const visibleRealIds = useMemo(() => cards.filter((c) => !c.demo && c.raw).map((c) => c.raw!.id), [cards])
  // Prune selection to what's currently loaded/real.
  useEffect(() => {
    setSelected((prev) => {
      const live = new Set(visibleRealIds)
      let changed = false
      const next = new Set<string>()
      prev.forEach((id) => {
        if (live.has(id)) next.add(id)
        else changed = true
      })
      return changed ? next : prev
    })
  }, [visibleRealIds])

  const allVisibleSelected = visibleRealIds.length > 0 && visibleRealIds.every((id) => selected.has(id))
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const selectAllVisible = () => setSelected(new Set(visibleRealIds))
  const clearSelection = () => setSelected(new Set())

  // ---- Upload ----------------------------------------------------------------
  const pickFiles = () => {
    setError(null)
    fileRef.current?.click()
  }
  const onFilesChosen = (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (files.length === 0) return
    if (files.length >= 2) {
      // 2+ files → Bulk Review (per-file inference + review/exception workflow).
      setBulkFiles(files)
    } else {
      // 1 file → quick single-video setup, prefilled from the filename (editable).
      const inf = inferFromFilename(files[0].name)
      setPendingFiles(files)
      // A UUID/hash/export filename is not a property name — leave the field blank so the
      // property search is usable immediately. Market/type inference is unaffected.
      setBatch({ market: inf.market ?? "", areaNeighborhood: "", propertyName: propertyNamePrefill(inf.propertyName), propertyType: inf.propertyType ?? "", placeId: null, matched: false, special: "", budgetRange: "", amenities: "", notes: "", overlayMode: "generate", priceLabelMode: "starting_at" })
      // Auto-resolve the inferred name against the read-only property search. A single clear
      // in-market match auto-fills the canonical name + place_id (+ area from its address);
      // anything ambiguous is left as inferred text for the operator to confirm. Guarded so a
      // late result never overwrites edits the operator has already made.
      const seedName = propertyNamePrefill(inf.propertyName)
      if (seedName) {
        const seed = seedName
        void resolvePropertyMatch(seed, inf.market).then((r) => {
          if (!r.match) return
          setBatch((b) => {
            if (b.matched || b.propertyName !== seed) return b
            const market = b.market || detectMarket(r.match!.address ?? "") || ""
            return { ...b, propertyName: r.match!.name, placeId: r.match!.placeId, matched: true, market, areaNeighborhood: b.areaNeighborhood || suggestArea(r.match!.address, market) }
          })
        })
      }
    }
    if (fileRef.current) fileRef.current.value = ""
  }

  const uploadOne = useCallback(async (uf: UploadFile, batchId: string, meta: BatchMeta, userId: string) => {
    setUploads((prev) => prev?.map((u) => (u.uid === uf.uid ? { ...u, status: "uploading", error: undefined } : u)) ?? prev)
    try {
      const path = `${userId}/${uf.contentId}/source.${extOf(uf.file.name)}`
      const up = await supabase.storage.from("social-media").upload(path, uf.file, {
        contentType: uf.file.type || "video/mp4",
        upsert: true, // same contentId only — safe, and makes retry idempotent
      })
      if (up.error) throw new Error(up.error.message)
      const res = await fetch("/api/admin/social-autopilot/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: uf.contentId,
          storagePath: path,
          originalFilename: uf.file.name,
          contentType: uf.file.type || null,
          sizeBytes: uf.file.size,
          kind: (uf.file.type || "").startsWith("image/") ? "image" : "clip",
          uploadBatchId: batchId,
          batchSeq: uf.seq,
          market: meta.market || null,
          propertyName: meta.propertyName || null,
          propertyType: meta.propertyType || null,
          overlayMode: meta.overlayMode,
          areaNeighborhood: meta.areaNeighborhood || null,
          placeId: meta.placeId || null,
          special: meta.special || null,
          budgetRange: meta.budgetRange || null,
          priceLabelMode: meta.priceLabelMode,
          amenities: meta.amenities || null,
          notes: meta.notes || null,
        }),
      })
      if (!res.ok) throw new Error("record failed")
      setUploads((prev) => prev?.map((u) => (u.uid === uf.uid ? { ...u, status: "done" } : u)) ?? prev)
    } catch (e) {
      setUploads((prev) => prev?.map((u) => (u.uid === uf.uid ? { ...u, status: "error", error: e instanceof Error ? e.message : "failed" } : u)) ?? prev)
    }
  }, [])

  const startBatch = useCallback(async () => {
    if (!pendingFiles || !batch.market) return
    setUploadingBatch(true)
    setError(null)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setError("Please sign in again.")
        return
      }
      const batchId = uuidv4()
      const meta = { ...batch }
      const files: UploadFile[] = pendingFiles.map((file, i) => ({ uid: `${batchId}-${i}`, contentId: uuidv4(), file, seq: i + 1, status: "pending" }))
      setUploads(files)
      setPendingFiles(null)
      await runPool(files, UPLOAD_CONCURRENCY, (uf) => uploadOne(uf, batchId, meta, user.id))
      await load()
    } catch {
      setError("Upload failed to start.")
    } finally {
      setUploadingBatch(false)
    }
  }, [pendingFiles, batch, uploadOne, load])

  const retryOne = useCallback(async (uid: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setError("Please sign in again.")
      return
    }
    const uf = uploads?.find((u) => u.uid === uid)
    if (!uf) return
    // Rebuild meta from the batch snapshot still shown alongside progress.
    const batchId = uf.uid.split("-").slice(0, 5).join("-")
    await uploadOne(uf, batchId, batch, user.id)
    await load()
  }, [uploads, batch, uploadOne, load])

  const closeUploads = () => {
    setUploads(null)
    void load()
  }
  const uploadsDone = uploads !== null && !uploadingBatch && uploads.every((u) => u.status === "done" || u.status === "error")
  const uploadDoneCount = uploads?.filter((u) => u.status === "done").length ?? 0
  const uploadErrCount = uploads?.filter((u) => u.status === "error").length ?? 0

  // ---- Bulk ------------------------------------------------------------------
  const openBulk = (kind: "market" | "property") => {
    setBulkKind(kind)
    setBulkValue("")
    setBulkPlaceId(null)
    setBulkMatched(false)
  }
  const applyBulk = useCallback(async () => {
    if (!bulkKind) return
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setBulkBusy(true)
    setError(null)
    setNotice(null)
    try {
      const body: Record<string, unknown> = { ids }
      if (bulkKind === "market") body.market = bulkValue || null
      else { body.propertyName = bulkValue || null; body.placeId = bulkMatched ? bulkPlaceId : null }
      const res = await fetch("/api/admin/social-autopilot/content/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError("Bulk update failed.")
        return
      }
      const json = (await res.json()) as { updated?: number; failed?: number }
      const updated = json.updated ?? 0
      const failed = json.failed ?? 0
      setNotice(failed > 0 ? `Updated ${updated} of ${updated + failed}. ${failed} failed.` : `Updated ${updated} ${updated === 1 ? "video" : "videos"}.`)
      setBulkKind(null)
      clearSelection()
      await load()
    } finally {
      setBulkBusy(false)
    }
  }, [bulkKind, bulkValue, bulkPlaceId, bulkMatched, selected, load])

  /**
   * Bulk delete — the SAME deletion the per-card trash icon performs, applied to
   * each selected id.
   *
   * Deliberately fans out to the existing `DELETE /content/:id` endpoint rather
   * than adding a delete branch to the bulk route: that endpoint is the one place
   * that removes the storage object before the row, and duplicating it server-side
   * would be a second deletion implementation to keep in sync. Per-request results
   * also give honest per-item success/failure for free.
   *
   * Failures are never reported as success — any failure surfaces as an error and
   * the library is reloaded either way, so what's on screen is the real state.
   */
  const deleteSelected = useCallback(async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setDeleteBusy(true)
    setError(null)
    setNotice(null)
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/admin/social-autopilot/content/${encodeURIComponent(id)}`, { method: "DELETE" })
            return res.ok
          } catch {
            return false
          }
        }),
      )
      const deleted = results.filter(Boolean).length
      const failed = results.length - deleted
      if (failed > 0) {
        setError(`Deleted ${deleted} of ${results.length}. ${failed} could not be deleted — the library below shows the current state.`)
      } else {
        setNotice(`Deleted ${deleted} ${deleted === 1 ? "video" : "videos"}.`)
      }
      setConfirmDelete(false)
      clearSelection()
      // Reload regardless of outcome: on partial failure this is what keeps the
      // library honest rather than optimistically dropping cards that still exist.
      await load()
    } finally {
      setDeleteBusy(false)
    }
  }, [selected, load])

  const remove = useCallback(
    async (id: string) => {
      if (!confirm("Delete this source video and its file? This cannot be undone.")) return
      const res = await fetch(`/api/admin/social-autopilot/content/${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!res.ok) {
        setError("Couldn't delete.")
        return
      }
      await load()
    },
    [load],
  )

  // Create a NEW draft post referencing this source video (one source → many posts), then
  // open the editor. Never modifies/duplicates the source; a fresh social_posts row is made.
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const createPost = useCallback(
    async (sourceContentId: string) => {
      setCreatingId(sourceContentId)
      setError(null)
      try {
        const res = await fetch("/api/admin/social-autopilot/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceContentId }),
        })
        if (!res.ok) {
          setError("Couldn't create the post.")
          return
        }
        const json = (await res.json()) as { id?: string }
        if (json.id) {
          const params = new URLSearchParams({ from: "library" })
          if (scheduleDate) params.set("date", scheduleDate)
          router.push(`/admin/social-autopilot/posts/${encodeURIComponent(json.id)}?${params.toString()}`)
        }
      } catch {
        setError("Couldn't create the post.")
      } finally {
        setCreatingId(null)
      }
    },
    [router, scheduleDate],
  )

  // Open an existing post in the unified editor (Library origin).
  const openPost = useCallback((postId: string) => router.push(`/admin/social-autopilot/posts/${encodeURIComponent(postId)}?from=library`), [router])
  // "Edit Post" workflow: 0 editable → create the first draft + open; exactly 1 → open it;
  // >1 → open a small picker so the operator chooses (never silently guesses).
  const editPost = useCallback((sid: string) => {
    const ed = postsBySource[sid] ?? []
    if (ed.length === 0) return void createPost(sid)
    if (ed.length === 1) return openPost(ed[0].id)
    setEditMenuFor((cur) => (cur === sid ? null : sid))
  }, [postsBySource, createPost, openPost])

  // ---- styles ----------------------------------------------------------------
  const chip = (active: boolean) =>
    "text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors " +
    (active
      ? "border-[var(--crm-text-primary)] text-[var(--crm-text-primary)] bg-[var(--crm-card)]"
      : "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")
  const control = "text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const btn = "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const primaryBtn = "text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
  const inputCls = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  // Destructive styling, matching the app's red-600 convention (ProfileAvatarMenu,
  // FirstRunChecklist). Ghost variant for the bar; filled for the modal's commit.
  const dangerGhostBtn = `${btn} !text-red-600 hover:!bg-red-50 dark:hover:!bg-red-950/40`
  const dangerBtn = "text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
  const fieldLabel = "text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]"

  return (
    <div>
      {scheduleDate && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-4 py-2.5 text-[13px] text-[var(--crm-text-primary)]">
          Scheduling for <span className="font-semibold">{new Date(`${scheduleDate}T00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span> — choose a video and press <span className="font-semibold">Create Post</span> to start a draft with that date prefilled.
        </div>
      )}

      {/* One compact controls row: Search · Market filters · Sort · Upload Videos.
          Upload sits on THIS row (ml-auto → right-aligned) and shrink-0 keeps it from
          being squeezed; the row wraps gracefully at narrow widths. The standalone
          "SAMPLE DATA" pill was removed — sample state is still obvious from the per-card
          "Sample" markers on the demo fixtures. */}
      {/* mb-6 (24px) gives extra breathing room before the card grid vs. the tighter mb-3 rows. */}
      {/* WORKING vs RENDERED / READY.
          Its own row above the existing controls, so Search / Market / Sort / Upload keep their
          current positions exactly. Both tabs feed the SAME card grid below — the tab only picks
          which array is rendered, so the two can never look like different libraries. */}
      <div className="mb-3 flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Library view">
        {([
          ["working", "Working", workingCount, "Drafts, unrendered, rendering and render errors"],
          ["rendered", "Rendered / Ready", renderedCards.length, "Finished videos — ready, scheduled and published"],
        ] as const).map(([id, label, count, hint]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            title={hint}
            onClick={() => setTab(id)}
            className={chip(tab === id)}
          >
            {label} <span className="opacity-55 tabular-nums">({count})</span>
          </button>
        ))}
      </div>
      <div className="mb-6 flex items-center gap-2.5 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search property name…"
          className={`${control} w-[220px] max-w-full`}
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          {marketChips.map((m) => (
            <button key={m} type="button" className={chip(market === m)} onClick={() => setMarket(m)}>
              {m}{" "}
              {/* Dimmer than the label so the pill reads as a filter first and a
                  count second. */}
              <span className="opacity-55 tabular-nums">({marketCounts.get(m) ?? 0})</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--crm-text-secondary)]">
          Sort
          <select className={control} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="button" className={`ml-auto shrink-0 text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)]`} onClick={pickFiles}>
          Upload Videos
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,image/*"
          multiple
          hidden
          onChange={(e) => onFilesChosen(e.target.files)}
        />
      </div>

      {(error || notice) && (
        <div className={`mb-3 rounded-lg border px-4 py-2.5 text-[13px] ${error ? "border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)]" : "border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"}`}>
          {error || notice}
        </div>
      )}

      {/* Bulk action bar — appears only with a real selection. */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2.5 flex-wrap rounded-xl border border-[var(--crm-text-primary)] bg-[var(--crm-card)] px-3 py-2">
          <span className="text-[12.5px] font-bold text-[var(--crm-text-primary)]">{selected.size} selected</span>
          <button type="button" className={btn} onClick={() => openBulk("market")}>Change Market</button>
          <button type="button" className={btn} onClick={() => openBulk("property")}>Change Property</button>
          {/* Opens the confirmation modal only — never deletes on this click. */}
          <button type="button" className={dangerGhostBtn} onClick={() => setConfirmDelete(true)}>Delete Selected</button>
          {!allVisibleSelected && (
            <button type="button" className={btn} onClick={selectAllVisible}>Select all visible ({visibleRealIds.length})</button>
          )}
          <button type="button" className={`${btn} ml-auto`} onClick={clearSelection}>Clear</button>
        </div>
      )}

      {items === null ? (
        <div className="text-[13px] text-[var(--crm-text-secondary)] py-10 text-center">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center text-[13px] text-[var(--crm-text-secondary)]">
          No videos match.
        </div>
      ) : (
        <div
          /* Density = 5 cards on a full ~1200px content area, driven by ACTUAL container
             width (auto-fill) rather than viewport breakpoints — so it steps 5→4→3→2 as the
             content area narrows, INCLUDING when Beast Companion consumes width. ~210px min
             avoids cramping; min(…,45%) keeps 2-up on phones. 9:16 ratio + typography kept. */
          className="grid gap-3 sa-library-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(210px, 45%), 1fr))" }}
        >
          {cards.map((c) => {
            const isSel = !c.demo && c.raw ? selected.has(c.raw.id) : false
            // A Rendered card has a post instead of a source row; both are "real" (interactive,
            // non-sample). `open` is the card's primary action either way.
            const real = !c.demo && (!!c.raw || !!c.post)
            const open = c.post ? () => router.push(`/admin/social-autopilot/posts/${c.post!.id}?from=library`) : c.raw ? () => void createPost(c.raw!.id) : undefined
            return (
              <div
                key={c.key}
                // Real cards: theme-accent hover/focus glow + double-click opens the composer
                // (canonical Create Post → one guarded draft). Inner controls stop double-click
                // from bubbling, so play/select/Edit/Delete never create a post.
                tabIndex={real ? 0 : undefined}
                onDoubleClick={open}
                onKeyDown={open ? (e) => { if (e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); open() } } : undefined}
                className={`rounded-2xl border bg-[var(--crm-panel)] overflow-hidden flex flex-col ${real ? "sa-lib-card" : ""} ${isSel ? "border-[var(--crm-text-primary)] ring-1 ring-[var(--crm-text-primary)]" : "border-[var(--crm-border)]"}`}
              >
                <div className="relative aspect-[9/16] bg-[var(--crm-card)]" onDoubleClick={(e) => e.stopPropagation()}>
                  <Thumb card={c} />
                  {/* Rendered cards carry no checkbox (bulk actions are a source-level operation);
                      the corner shows WHERE the creative is instead — the one thing you cannot tell
                      by looking at the video. */}
                  {c.post ? (
                    <span className={`absolute top-1.5 left-1.5 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-white ${c.post.publishedAt ? "bg-emerald-600/90" : c.post.status === "scheduled" ? "bg-sky-600/90" : "bg-black/55"}`}>
                      {c.post.publishedAt ? "Published" : c.post.status === "scheduled" ? "Scheduled" : "Ready"}
                    </span>
                  ) : c.demo ? (
                    <span className="absolute top-1.5 left-1.5 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/55 text-white">
                      Sample
                    </span>
                  ) : (
                    c.raw && (
                      <label className="absolute top-1.5 left-1.5 flex items-center justify-center h-6 w-6 rounded-md bg-black/45 hover:bg-black/60 cursor-pointer" title="Select">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-white cursor-pointer"
                          checked={isSel}
                          onChange={() => toggleSelect(c.raw!.id)}
                        />
                      </label>
                    )
                  )}
                </div>
                <div className="p-2.5 flex-1 flex flex-col">
                  {/* titleLabel, not displayName: display formatting only. The
                      hover title still shows the untouched original filename. */}
                  <div className="text-[12.5px] font-bold text-[var(--crm-text-primary)] leading-snug line-clamp-2" title={c.originalFilename ?? undefined}>
                    {c.titleLabel}
                  </div>
                  <div className="text-[11.5px] text-[var(--crm-text-secondary)] mt-1 truncate">
                    {c.propertyName || <span className="text-[var(--crm-text-muted)]">No property</span>}
                    {c.marketLabel ? ` · ${c.marketLabel}` : ""}
                  </div>
                  {/* RENDERED/READY footer. Same card shell, same typography, same button class as
                      the Working footer below — only the labels and the destination differ. */}
                  {c.post && (
                    <div className="relative mt-2 pt-2 border-t border-[var(--crm-border)] flex flex-col gap-1.5" onDoubleClick={(e) => e.stopPropagation()}>
                      <div className="text-[10.5px] text-[var(--crm-text-muted)] truncate">
                        {templateLabel(c.post.overlayTemplate)} · v{c.post.renderVersion ?? 1}
                        {c.post.sourceStoragePath ? " · own footage" : ""}
                      </div>
                      <button
                        type="button"
                        className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)]"
                        onClick={() => router.push(`/admin/social-autopilot/posts/${c.post!.id}?from=library`)}
                      >
                        Open Post
                      </button>
                      {c.post.externalPostUrl && (
                        <a
                          href={c.post.externalPostUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-center text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] underline underline-offset-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View on Instagram
                        </a>
                      )}
                    </div>
                  )}
                  {!c.demo && c.raw && (() => {
                    const sid = c.raw.id
                    const ed = postsBySource[sid] ?? []
                    return (
                      <div className="relative mt-2 pt-2 border-t border-[var(--crm-border)] flex flex-col gap-1.5" onDoubleClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
                          disabled={creatingId === sid}
                          aria-haspopup={ed.length > 1 ? "dialog" : undefined}
                          aria-expanded={ed.length > 1 ? editMenuFor === sid : undefined}
                          onClick={() => editPost(sid)}
                        >
                          {creatingId === sid ? "Creating…" : "Edit Post"}
                        </button>
                        <div className="flex items-center gap-1.5">
                          <button type="button" aria-label="Delete source video" title="Delete source video" className="ml-auto p-1.5 rounded-lg text-[var(--crm-text-muted)] hover:text-red-500 hover:bg-[var(--crm-card)] transition-colors" onClick={() => remove(c.raw!.id)}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 2+ files → Bulk Review / Intake. */}
      {bulkFiles && (
        <BulkReview files={bulkFiles} onClose={() => setBulkFiles(null)} onUploaded={() => void load()} />
      )}

      {/* Edit Post chooser — shown when a source has MORE THAN ONE editable post, so "Edit Post"
          never guesses. A modal (not an in-card dropdown, which the card's overflow-hidden clipped
          — the cause of the "click does nothing" bug). Pick a post to open, or create a variation. */}
      {editMenuFor && (postsBySource[editMenuFor]?.length ?? 0) > 1 && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setEditMenuFor(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">Edit which post?</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5 mb-3">This source has {postsBySource[editMenuFor]!.length} editable posts. Choose one to open, or start a new variation.</div>
            <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
              {postsBySource[editMenuFor]!.map((p) => (
                <button key={p.id} type="button" className="text-left px-3 py-2 rounded-lg border border-[var(--crm-border)] hover:bg-[var(--crm-card)] transition-colors" onClick={() => { const id = p.id; setEditMenuFor(null); openPost(id) }}>
                  <span className="text-[13px] font-semibold text-[var(--crm-text-primary)]">{p.name}</span>
                  <span className="text-[11.5px] text-[var(--crm-text-muted)]"> · {p.status}{p.scheduledAt ? ` · ${new Date(p.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className={primaryBtn} onClick={() => { const s = editMenuFor; setEditMenuFor(null); void createPost(s!) }}>+ New post variation</button>
              <button type="button" className={btn} onClick={() => setEditMenuFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch setup modal — assign Market (required) + Property + shared metadata ONCE. */}
      {pendingFiles && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => !uploadingBatch && setPendingFiles(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">Upload {pendingFiles.length} {pendingFiles.length === 1 ? "video" : "videos"}</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5 mb-3">Suggestions were prefilled from the filename — edit anything. These apply to the whole batch; each video stays its own record you can refine afterward.</div>
            <div className="flex flex-col gap-2.5">
              <label className="block">
                <span className={fieldLabel}>Property / building name <span className="normal-case text-[var(--crm-text-muted)]">· internal</span></span>
                <PropertySearchField
                  value={batch.propertyName}
                  matched={batch.matched}
                  inputClassName={`${inputCls} mt-1`}
                  placeholder="Search existing property or type…"
                  onChange={(v) => setBatch((b) => ({ ...b, propertyName: v, matched: false, placeId: null }))}
                  onMatch={(m) => setBatch((b) => { const market = b.market || detectMarket(m.address ?? "") || ""; return { ...b, propertyName: m.name, placeId: m.placeId, matched: true, market, areaNeighborhood: b.areaNeighborhood || suggestArea(m.address, market) } })}
                  onClearMatch={() => setBatch((b) => ({ ...b, matched: false, placeId: null }))}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>City / Market <span className="text-[var(--crm-text-primary)]">*</span></span>
                <select className={`${inputCls} mt-1`} value={batch.market} onChange={(e) => setBatch((b) => ({ ...b, market: e.target.value }))}>
                  <option value="">Select market…</option>
                  {SOCIAL_MARKETS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Property type</span>
                <select className={`${inputCls} mt-1`} value={batch.propertyType} onChange={(e) => setBatch((b) => ({ ...b, propertyType: e.target.value }))}>
                  <option value="">Select type…</option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Text Overlay</span>
                <select className={`${inputCls} mt-1`} value={batch.overlayMode} onChange={(e) => setBatch((b) => ({ ...b, overlayMode: e.target.value === "existing" ? "existing" : "generate" }))}>
                  <option value="generate">Generate with Social Beast</option>
                  <option value="existing">Already has text</option>
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Area / Neighborhood <span className="normal-case text-[var(--crm-text-muted)]">· internal</span></span>
                {/* Canonical market catalog — the same bank the Smart Lead Form reads. */}
                <AreaSelect market={batch.market} value={batch.areaNeighborhood} className={`${inputCls} mt-1`}
                  onChange={(v) => setBatch((b) => ({ ...b, areaNeighborhood: v }))} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabel}>Current Special</span>
                  <div className="mt-1">
                    <SpecialSelect value={batch.special} onChange={(v) => setBatch((b) => ({ ...b, special: v }))} />
                  </div>
                </label>
                <label className="block">
                  {/* Same field, same column (budget_range) — this label just said
                      "Price Range" while the Post Editor said "Starting At" for the
                      identical value. Label only: nothing about storage, parsing or
                      template behaviour changes. */}
                  <span className={fieldLabel}>Starting At</span>
                  <input className={`${inputCls} mt-1`} value={batch.budgetRange} onChange={(e) => setBatch((b) => ({ ...b, budgetRange: e.target.value }))} />
                  {/* Same per-source meaning the Post Editor sets, so it does not have to be re-stated there. */}
                  <select className={`${inputCls} mt-1 cursor-pointer`} value={batch.priceLabelMode}
                    onChange={(e) => setBatch((b) => ({ ...b, priceLabelMode: narrowPriceLabelMode(e.target.value) }))}>
                    {PRICE_LABEL_MODES.map((m) => <option key={m} value={m}>{m === "starting_at" ? "Starting at" : "Exact unit shown"}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className={fieldLabel}>Amenities / Features <span className="normal-case text-[var(--crm-text-muted)]">· choose up to 3</span></span>
                {/* The SAME canonical bank and 3-cap as the Post Editor — not a second vocabulary. */}
                <AmenitySelect value={parseAmenities(batch.amenities)} onChange={(next) => setBatch((b) => ({ ...b, amenities: serializeAmenities(next) }))} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Notes <span className="normal-case text-[var(--crm-text-muted)]">· internal</span></span>
                <textarea className={`${inputCls} mt-1 min-h-[52px]`} value={batch.notes} onChange={(e) => setBatch((b) => ({ ...b, notes: e.target.value }))} />
              </label>
              <ul className="mt-1 max-h-[120px] overflow-y-auto text-[11.5px] text-[var(--crm-text-secondary)] rounded-lg border border-[var(--crm-border)] divide-y divide-[var(--crm-border)]">
                {pendingFiles.map((f, i) => (
                  <li key={i} className="px-2.5 py-1.5 truncate" title={f.name}>{String(i + 1).padStart(2, "0")} · {f.name}</li>
                ))}
              </ul>
            </div>
            {/* Action hierarchy: Cancel = secondary (left), Start Upload = primary (rightmost). */}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button type="button" className={btn} disabled={uploadingBatch} onClick={() => setPendingFiles(null)}>Cancel</button>
              <button type="button" className={primaryBtn} disabled={!batch.market || uploadingBatch} onClick={() => void startBatch()}>
                {uploadingBatch ? "Starting…" : "Start Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload progress — one failure never destroys the successful ones; failures retry. */}
      {uploads && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4">
            <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">
              {uploadsDone ? "Upload complete" : "Uploading…"}
            </div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5 mb-3">
              {uploadDoneCount} done{uploadErrCount ? ` · ${uploadErrCount} failed` : ""} · {uploads.length} total
            </div>
            <ul className="text-[12px] rounded-lg border border-[var(--crm-border)] divide-y divide-[var(--crm-border)]">
              {uploads.map((u) => (
                <li key={u.uid} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="truncate flex-1 text-[var(--crm-text-secondary)]" title={u.file.name}>{String(u.seq).padStart(2, "0")} · {u.file.name}</span>
                  {u.status === "pending" && <span className="text-[var(--crm-text-muted)] text-[11px]">Pending</span>}
                  {u.status === "uploading" && <span className="text-[var(--crm-text-primary)] text-[11px]">Uploading…</span>}
                  {u.status === "done" && <span className="text-[11px] font-semibold text-emerald-500">Complete</span>}
                  {u.status === "error" && (
                    <span className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-red-500" title={u.error}>Failed</span>
                      <button type="button" className={btn} disabled={uploadingBatch} onClick={() => void retryOne(u.uid)}>Retry</button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-4">
              <button type="button" className={primaryBtn} disabled={!uploadsDone} onClick={closeUploads}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk value modal. */}
      {bulkKind && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => !bulkBusy && setBulkKind(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">{bulkKind === "market" ? "Change Market" : "Change Property"}</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5 mb-3">Applies to {selected.size} selected {selected.size === 1 ? "video" : "videos"}. System-generated names refresh; names you customized stay. Storage and original filenames are untouched.</div>
            {bulkKind === "market" ? (
              <select className={inputCls} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                <option value="">Select market…</option>
                {SOCIAL_MARKETS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <>
                <PropertySearchField
                  value={bulkValue}
                  matched={bulkMatched}
                  placeholder="Search existing property or type…"
                  onChange={(v) => { setBulkValue(v); setBulkMatched(false); setBulkPlaceId(null) }}
                  onMatch={(m) => { setBulkValue(m.name); setBulkPlaceId(m.placeId); setBulkMatched(true) }}
                  onClearMatch={() => { setBulkMatched(false); setBulkPlaceId(null) }}
                />
                <div className="text-[11px] text-[var(--crm-text-muted)] mt-1.5">
                  {bulkMatched ? "✓ Canonical property will be linked to the selected videos." : "Pick a suggestion to link the canonical property, or type a name to set it manually."}
                </div>
              </>
            )}
            <div className="flex gap-2 mt-4">
              <button type="button" className={primaryBtn} disabled={bulkBusy || (bulkKind === "market" ? !bulkValue : !bulkValue.trim())} onClick={() => void applyBulk()}>
                {bulkBusy ? "Applying…" : "Apply"}
              </button>
              <button type="button" className={btn} disabled={bulkBusy} onClick={() => setBulkKind(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation. Same modal shell as the bulk value modal above;
          Cancel sits first because the commit is destructive. */}
      {confirmDelete && selected.size > 0 && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => !deleteBusy && setConfirmDelete(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">
              Delete {selected.size} selected {selected.size === 1 ? "video" : "videos"}?
            </div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5 mb-3">
              This will permanently remove the selected videos from the Video Library.
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className={btn} disabled={deleteBusy} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className={dangerBtn} disabled={deleteBusy} onClick={() => void deleteSelected()}>
                {deleteBusy ? "Deleting…" : `Delete ${selected.size} ${selected.size === 1 ? "Video" : "Videos"}`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
