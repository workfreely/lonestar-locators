"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import { DEMO_LIBRARY } from "./demoFixtures"
import { SOCIAL_MARKETS, normalizeSocialMarket } from "@/lib/social/markets"
import { PROPERTY_TYPES } from "@/lib/social/propertyTypes"
import { inferFromFilename } from "@/lib/social/filenameInference"

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
  special: string | null
  budgetRange: string | null
  amenities: string | null
  notes: string | null
  placeId: string | null
  createdAt: string
  previewUrl: string | null
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
  propertyName: string
  propertyType: string
  special: string
  budgetRange: string
  amenities: string
  notes: string
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
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null) // files awaiting batch setup
  const [batch, setBatch] = useState<BatchMeta>({ market: "", propertyName: "", propertyType: "", special: "", budgetRange: "", amenities: "", notes: "" })
  const [uploads, setUploads] = useState<UploadFile[] | null>(null) // active/finished progress list
  const [uploadingBatch, setUploadingBatch] = useState(false)

  // Bulk selection (real rows only).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkKind, setBulkKind] = useState<null | "market" | "property">(null)
  const [bulkValue, setBulkValue] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)

  // Individual edit.
  const [editing, setEditing] = useState<Item | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

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
    // Prefill batch fields from the FIRST file's filename (editable suggestions). For a single
    // video or a same-property batch this is exactly right; the user can override any field.
    const inf = inferFromFilename(files[0].name)
    setPendingFiles(files)
    setBatch({ market: inf.market ?? "", propertyName: inf.propertyName ?? "", propertyType: inf.propertyType ?? "", special: "", budgetRange: "", amenities: "", notes: "" })
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
      else body.propertyName = bulkValue || null
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
  }, [bulkKind, bulkValue, selected, load])

  // ---- Individual edit -------------------------------------------------------
  const openEdit = (it: Item) => {
    setEditing(it)
    setDraft({
      displayName: it.displayName ?? "",
      propertyName: it.propertyName ?? "",
      propertyType: it.propertyType ?? "",
      market: it.market ?? "",
      special: it.special ?? "",
      budgetRange: it.budgetRange ?? "",
      amenities: it.amenities ?? "",
      placeId: it.placeId ?? "",
      notes: it.notes ?? "",
    })
  }
  const saveEdit = useCallback(async () => {
    if (!editing) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        propertyName: draft.propertyName ?? "",
        propertyType: draft.propertyType ?? "",
        market: draft.market ?? "",
        special: draft.special ?? "",
        budgetRange: draft.budgetRange ?? "",
        amenities: draft.amenities ?? "",
        placeId: draft.placeId ?? "",
        notes: draft.notes ?? "",
      }
      // Only send Display Name when the user actually changed it — a manual change locks
      // the name (name_customized=true); leaving it lets Market/Property auto-refine it.
      if ((draft.displayName ?? "") !== (editing.displayName ?? "")) body.displayName = draft.displayName ?? ""
      const res = await fetch(`/api/admin/social-autopilot/content/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        setError("Couldn't save.")
        return
      }
      setEditing(null)
      setDraft({})
      await load()
    } finally {
      setSaving(false)
    }
  }, [editing, draft, load])
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
          const q = scheduleDate ? `?date=${encodeURIComponent(scheduleDate)}` : ""
          router.push(`/admin/social-autopilot/posts/${encodeURIComponent(json.id)}${q}`)
        }
      } catch {
        setError("Couldn't create the post.")
      } finally {
        setCreatingId(null)
      }
    },
    [router, scheduleDate],
  )

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
      <div className="mb-3 flex items-center gap-2.5 flex-wrap">
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
          className="grid gap-3"
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
                  {!c.demo && c.raw && (
                    <div className="mt-2 pt-2 border-t border-[var(--crm-border)] flex flex-col gap-1.5" onDoubleClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
                        disabled={creatingId === c.raw.id}
                        onClick={() => void createPost(c.raw!.id)}
                      >
                        {creatingId === c.raw.id ? "Creating…" : "+ Create Post"}
                      </button>
                      <div className="flex gap-1.5">
                        <button type="button" className={btn} onClick={() => openEdit(c.raw!)}>Edit</button>
                        <button type="button" className={btn} onClick={() => remove(c.raw!.id)}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
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
                <span className={fieldLabel}>Market <span className="text-[var(--crm-text-primary)]">*</span></span>
                <select className={`${inputCls} mt-1`} value={batch.market} onChange={(e) => setBatch((b) => ({ ...b, market: e.target.value }))}>
                  <option value="">Select market…</option>
                  {SOCIAL_MARKETS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Property / building name</span>
                <input className={`${inputCls} mt-1`} value={batch.propertyName} onChange={(e) => setBatch((b) => ({ ...b, propertyName: e.target.value }))} placeholder="Encouraged — used to name each video" />
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
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={fieldLabel}>Special</span>
                  <input className={`${inputCls} mt-1`} value={batch.special} onChange={(e) => setBatch((b) => ({ ...b, special: e.target.value }))} />
                </label>
                <label className="block">
                  <span className={fieldLabel}>Budget / price</span>
                  <input className={`${inputCls} mt-1`} value={batch.budgetRange} onChange={(e) => setBatch((b) => ({ ...b, budgetRange: e.target.value }))} />
                </label>
              </div>
              <label className="block">
                <span className={fieldLabel}>Amenities</span>
                <input className={`${inputCls} mt-1`} value={batch.amenities} onChange={(e) => setBatch((b) => ({ ...b, amenities: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Notes</span>
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
              <input className={inputCls} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="Property / building name" autoFocus />
            )}
            <div className="flex gap-2 mt-4">
              <button type="button" className={primaryBtn} disabled={bulkBusy || (bulkKind === "market" && !bulkValue)} onClick={() => void applyBulk()}>
                {bulkBusy ? "Applying…" : "Apply"}
              </button>
              <button type="button" className={btn} disabled={bulkBusy} onClick={() => setBulkKind(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Individual edit modal. */}
      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">Edit details</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5 mb-3 truncate" title={editing.originalFilename ?? undefined}>
              Original file: {editing.originalFilename}
            </div>
            <div className="flex flex-col gap-2">
              <label className="block">
                <span className={fieldLabel}>Display name</span>
                <input className={`${inputCls} mt-1`} value={draft.displayName ?? ""} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} />
                <span className="text-[10.5px] text-[var(--crm-text-muted)]">
                  {editing.nameCustomized ? "Custom name — won't auto-update." : "Auto-generated from Property + Market until you edit it here."}
                </span>
              </label>
              <label className="block">
                <span className={fieldLabel}>Property / building name</span>
                <input className={`${inputCls} mt-1`} value={draft.propertyName ?? ""} onChange={(e) => setDraft((d) => ({ ...d, propertyName: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabel}>City / market</span>
                <select className={`${inputCls} mt-1`} value={draft.market ?? ""} onChange={(e) => setDraft((d) => ({ ...d, market: e.target.value }))}>
                  <option value="">No market</option>
                  {[...SOCIAL_MARKETS, ...(draft.market && !SOCIAL_MARKETS.includes(draft.market) ? [draft.market] : [])].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Property type</span>
                <select className={`${inputCls} mt-1`} value={draft.propertyType ?? ""} onChange={(e) => setDraft((d) => ({ ...d, propertyType: e.target.value }))}>
                  <option value="">No type</option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>Current or historical special</span>
                <input className={`${inputCls} mt-1`} value={draft.special ?? ""} onChange={(e) => setDraft((d) => ({ ...d, special: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Budget / price range</span>
                <input className={`${inputCls} mt-1`} value={draft.budgetRange ?? ""} onChange={(e) => setDraft((d) => ({ ...d, budgetRange: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Amenities</span>
                <input className={`${inputCls} mt-1`} value={draft.amenities ?? ""} onChange={(e) => setDraft((d) => ({ ...d, amenities: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Google Place ID (optional)</span>
                <input className={`${inputCls} mt-1`} value={draft.placeId ?? ""} onChange={(e) => setDraft((d) => ({ ...d, placeId: e.target.value }))} />
              </label>
              <label className="block">
                <span className={fieldLabel}>Notes</span>
                <textarea className={`${inputCls} mt-1 min-h-[56px]`} value={draft.notes ?? ""} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className={primaryBtn} disabled={saving} onClick={() => void saveEdit()}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" className={btn} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
