"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { DEMO_LIBRARY } from "./demoFixtures"
import { SOCIAL_MARKETS, normalizeSocialMarket } from "@/lib/social/markets"
import { PROPERTY_TYPES } from "@/lib/social/propertyTypes"
import { inferFromFilename, detectMarket, suggestArea } from "@/lib/social/filenameInference"
import { resolvePropertyMatch } from "@/lib/social/resolveProperty"
import BulkReview from "@/components/crm/social/BulkReview"
import PropertySearchField from "@/components/crm/social/PropertySearchField"

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
  displayName: string
  propertyName: string | null
  market: string | null
  marketLabel: string // normalized (Dallas/Fort Worth → DFW) for filter + sort
  dateLabel: string
  sortDate: number
  originalFilename: string | null
  previewUrl: string | null
  hue: number | null
  demo: boolean
  raw?: Item
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
}

const SORTS = ["Newest", "Oldest", "Property", "Market"] as const
type Sort = (typeof SORTS)[number]

const UPLOAD_CONCURRENCY = 3

const base = (name: string | null) => (name ? name.replace(/\.[^.]+$/, "") : "")
const fmt = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}
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
  const [batch, setBatch] = useState<BatchMeta>({ market: "", areaNeighborhood: "", propertyName: "", propertyType: "", placeId: null, matched: false, special: "", budgetRange: "", amenities: "", notes: "", overlayMode: "generate" })
  const [uploads, setUploads] = useState<UploadFile[] | null>(null) // active/finished progress list
  const [uploadingBatch, setUploadingBatch] = useState(false)

  // Bulk selection (real rows only).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkKind, setBulkKind] = useState<null | "market" | "property">(null)
  const [bulkValue, setBulkValue] = useState("")
  const [bulkPlaceId, setBulkPlaceId] = useState<string | null>(null) // canonical id when a match is picked
  const [bulkMatched, setBulkMatched] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  // Source metadata is now edited inside PostEditor (the single editor). The Library only creates
  // posts, opens the single editable draft, and deletes source videos.

  // Per-source rollup of EDITABLE (non-published) posts. Drives the "Edit Post" workflow:
  // 0 → create+open, 1 → open it, >1 → let the operator pick (never silently guess).
  type EditablePost = { id: string; status: string; scheduledAt: string | null; name: string }
  const [postsBySource, setPostsBySource] = useState<Record<string, EditablePost[]>>({})
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
          items?: { id: string; sourceContentId: string | null; status: string; scheduledAt: string | null; postName: string | null; source: { propertyName: string | null; displayName: string | null } | null }[]
        }
        const map: Record<string, EditablePost[]> = {}
        for (const p of pj.items ?? []) {
          const sid = p.sourceContentId
          if (!sid || p.status === "published") continue // only editable (non-published) posts
          ;(map[sid] ??= []).push({ id: p.id, status: p.status, scheduledAt: p.scheduledAt, name: p.source?.propertyName || p.source?.displayName || p.postName || "Untitled" })
        }
        setPostsBySource(map)
      }
    } catch { /* non-fatal */ }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const usingDemo = items !== null && items.length === 0

  // Unify real + demo into a common card shape.
  const allCards: Card[] = useMemo(() => {
    if (items && items.length > 0) {
      return items.map((it) => ({
        key: it.id,
        displayName: it.displayName || it.propertyName || base(it.originalFilename) || "Untitled",
        propertyName: it.propertyName,
        market: it.market,
        marketLabel: normalizeSocialMarket(it.market),
        dateLabel: fmt(it.createdAt),
        sortDate: new Date(it.createdAt).getTime() || 0,
        originalFilename: it.originalFilename,
        previewUrl: it.previewUrl,
        hue: null,
        demo: false,
        raw: it,
      }))
    }
    if (usingDemo) {
      return DEMO_LIBRARY.map((d, i) => ({
        key: d.id,
        displayName: d.displayName,
        propertyName: d.propertyName,
        market: d.market,
        marketLabel: normalizeSocialMarket(d.market),
        dateLabel: d.dateLabel,
        sortDate: DEMO_LIBRARY.length - i,
        originalFilename: d.originalFilename,
        previewUrl: null,
        hue: d.hue,
        demo: true,
      }))
    }
    return []
  }, [items, usingDemo])

  // Market chips: the primary SA taxonomy (San Antonio / Austin / DFW / Houston) is always
  // shown; any other normalized market present in the data is appended (extensible).
  const marketChips = useMemo(() => {
    const present = new Set(allCards.map((c) => c.marketLabel).filter(Boolean))
    const extras = Array.from(present).filter((m) => !SOCIAL_MARKETS.includes(m)).sort()
    return ["All", ...SOCIAL_MARKETS, ...extras]
  }, [allCards])

  const cards = useMemo(() => {
    let list = allCards
    if (market !== "All") list = list.filter((c) => c.marketLabel === market)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((c) => [c.displayName, c.propertyName, c.originalFilename].some((v) => (v ?? "").toLowerCase().includes(q)))
    const sorted = [...list]
    if (sort === "Newest") sorted.sort((a, b) => b.sortDate - a.sortDate)
    else if (sort === "Oldest") sorted.sort((a, b) => a.sortDate - b.sortDate)
    else if (sort === "Property") sorted.sort((a, b) => (a.propertyName ?? "").localeCompare(b.propertyName ?? ""))
    else if (sort === "Market") sorted.sort((a, b) => a.marketLabel.localeCompare(b.marketLabel))
    return sorted
  }, [allCards, market, search, sort])

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
      setBatch({ market: inf.market ?? "", areaNeighborhood: "", propertyName: inf.propertyName ?? "", propertyType: inf.propertyType ?? "", placeId: null, matched: false, special: "", budgetRange: "", amenities: "", notes: "", overlayMode: "generate" })
      // Auto-resolve the inferred name against the read-only property search. A single clear
      // in-market match auto-fills the canonical name + place_id (+ area from its address);
      // anything ambiguous is left as inferred text for the operator to confirm. Guarded so a
      // late result never overwrites edits the operator has already made.
      if (inf.propertyName) {
        const seed = inf.propertyName
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
              {m}
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
            const real = !c.demo && c.raw
            return (
              <div
                key={c.key}
                // Real cards: theme-accent hover/focus glow + double-click opens the composer
                // (canonical Create Post → one guarded draft). Inner controls stop double-click
                // from bubbling, so play/select/Edit/Delete never create a post.
                tabIndex={real ? 0 : undefined}
                onDoubleClick={real ? () => void createPost(c.raw!.id) : undefined}
                onKeyDown={real ? (e) => { if (e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); void createPost(c.raw!.id) } } : undefined}
                className={`rounded-2xl border bg-[var(--crm-panel)] overflow-hidden flex flex-col ${real ? "sa-lib-card" : ""} ${isSel ? "border-[var(--crm-text-primary)] ring-1 ring-[var(--crm-text-primary)]" : "border-[var(--crm-border)]"}`}
              >
                <div className="relative aspect-[9/16] bg-[var(--crm-card)]" onDoubleClick={(e) => e.stopPropagation()}>
                  <Thumb card={c} />
                  {c.demo ? (
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
                  <div className="text-[12.5px] font-bold text-[var(--crm-text-primary)] leading-snug line-clamp-2" title={c.originalFilename ?? undefined}>
                    {c.displayName}
                  </div>
                  <div className="text-[11.5px] text-[var(--crm-text-secondary)] mt-1 truncate">
                    {c.propertyName || <span className="text-[var(--crm-text-muted)]">No property</span>}
                    {c.marketLabel ? ` · ${c.marketLabel}` : ""}
                  </div>
                  <div className="text-[11px] text-[var(--crm-text-muted)] mt-0.5">{c.dateLabel}</div>
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
                <input className={`${inputCls} mt-1`} value={batch.areaNeighborhood} onChange={(e) => setBatch((b) => ({ ...b, areaNeighborhood: e.target.value }))} placeholder="e.g. Schertz, Stone Oak, The Rim, Uptown" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabel}>Current Special</span>
                  <input className={`${inputCls} mt-1`} value={batch.special} onChange={(e) => setBatch((b) => ({ ...b, special: e.target.value }))} />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Price Range</span>
                  <input className={`${inputCls} mt-1`} value={batch.budgetRange} onChange={(e) => setBatch((b) => ({ ...b, budgetRange: e.target.value }))} />
                </label>
              </div>
              <label className="block">
                <span className={fieldLabel}>Amenities / Features</span>
                <input className={`${inputCls} mt-1`} value={batch.amenities} onChange={(e) => setBatch((b) => ({ ...b, amenities: e.target.value }))} />
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

    </div>
  )
}
