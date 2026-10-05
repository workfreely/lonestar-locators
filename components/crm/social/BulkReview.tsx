"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { SOCIAL_MARKETS } from "@/lib/social/markets"
import { PROPERTY_TYPES } from "@/lib/social/propertyTypes"
import { inferFromFilename, detectMarket, suggestArea, type FilenameInference } from "@/lib/social/filenameInference"
import { resolvePropertyMatch } from "@/lib/social/resolveProperty"
import { buildHashtags, MAX_HASHTAGS } from "@/lib/social/hashtags"
import { preparePost, DEFAULT_OVERLAY_TEMPLATE } from "@/lib/social/composePost"
import { computeOverlayLayout } from "@/lib/social/overlaySpec"
import { DEFAULT_PLATFORM } from "@/lib/social/platformSafeArea"
import PreviewOverlay from "@/components/crm/social/PreviewOverlay"
import PropertySearchField, { type PropertyMatch } from "@/components/crm/social/PropertySearchField"
import AreaSelect from "@/components/crm/social/AreaSelect"
import { propertyNamePrefill } from "@/lib/social/intakeFields"

// Bulk Review / Intake — opens automatically for 2+ files. One compact row per source video,
// auto-prepared from the SAME filename inference + property-match pipeline as single upload.
// The user fixes exceptions (Missing/Review), optionally matches a canonical property (persists
// place_id), then Start Upload creates independent immutable social_content rows. NO render /
// schedule / publish here; completed assets appear in the existing visual Library.

const UPLOAD_CONCURRENCY = 3
const extOf = (name: string) => (name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4"
function uuidv4(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"))
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`
}
async function runPool<T>(items: T[], limit: number, worker: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) await worker(items[i++]) }))
}

type Row = {
  uid: string
  contentId: string
  file: File
  objectUrl: string
  inf: FilenameInference
  propertyName: string
  market: string
  areaNeighborhood: string
  propertyType: string
  overlayMode: "generate" | "existing"
  placeId: string | null
  matched: boolean
  approved: boolean
  upload: "pending" | "uploading" | "done" | "error"
}
type Status = "ready" | "review" | "missing"
// Content-preparation readiness and CANONICAL property matching are separate concepts. A row is
// only "Ready" once its property is a confirmed canonical match (place_id) OR the operator has
// explicitly approved it — never merely because the filename inferred a name/market/type. A
// prepared-but-unconfirmed property surfaces as "Confirm Property" so we never imply a match that
// doesn't exist.
function rowStatus(r: Row): Status {
  if (!r.propertyName.trim() || !r.market) return "missing"
  if ((r.matched && !!r.placeId) || r.approved) return "ready"
  return "review"
}

// Lazy poster from the LOCAL file (generated only when scrolled into view; no full <video> per
// row). One canvas frame → data URL, cached in component state.
function LazyPoster({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [poster, setPoster] = useState<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || poster) return
    const io = new IntersectionObserver((es) => {
      if (!es[0].isIntersecting) return
      io.disconnect()
      const v = document.createElement("video")
      v.muted = true
      v.playsInline = true
      v.preload = "metadata"
      v.src = url
      v.onloadeddata = () => { try { v.currentTime = Math.min(0.5, (isFinite(v.duration) ? v.duration : 1) / 2) } catch { /* ignore */ } }
      v.onseeked = () => {
        try {
          const c = document.createElement("canvas")
          c.width = 54; c.height = 96
          const ctx = c.getContext("2d")
          if (ctx) { ctx.drawImage(v, 0, 0, 54, 96); setPoster(c.toDataURL("image/jpeg", 0.6)) }
        } catch { /* ignore */ }
        v.src = ""
      }
    }, { rootMargin: "300px" })
    io.observe(el)
    return () => io.disconnect()
  }, [url, poster])
  return (
    <div ref={ref} className="h-12 w-[27px] flex-none rounded bg-[var(--crm-card)] overflow-hidden">
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] text-[var(--crm-text-muted)]">▶</div>
      )}
    </div>
  )
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  ready: { label: "Ready", cls: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/12" },
  review: { label: "Confirm Property", cls: "text-amber-600 dark:text-amber-400 bg-amber-500/12" },
  missing: { label: "Missing Info", cls: "text-red-600 dark:text-red-400 bg-red-500/12" },
}

export default function BulkReview({ files, onClose, onUploaded }: { files: File[]; onClose: () => void; onUploaded: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<"all" | Status>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [activeUid, setActiveUid] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batch, setBatch] = useState({ propertyName: "", market: "", propertyType: "", overlayMode: "generate" as "generate" | "existing", placeId: null as string | null, matched: false })
  // Which optional batch-override action is open (null = none). These are conveniences, not the
  // primary per-row workflow, so they only surface as explicit actions.
  const [bulkKind, setBulkKind] = useState<null | "property" | "market" | "type" | "overlay">(null)

  // Build rows once from the selected files.
  useEffect(() => {
    const built: Row[] = files.map((file, i) => {
      const inf = inferFromFilename(file.name)
      return {
        uid: `${i}-${file.name}`,
        contentId: uuidv4(),
        file,
        objectUrl: URL.createObjectURL(file),
        inf,
        // UUID/hash/export filenames are not property names — leave blank so the search is usable.
        propertyName: propertyNamePrefill(inf.propertyName),
        market: inf.market ?? "",
        areaNeighborhood: "",
        propertyType: inf.propertyType ?? "",
        overlayMode: "generate",
        placeId: null,
        matched: false,
        approved: false,
        upload: "pending",
      }
    })
    setRows(built)
    setActiveUid(built[0]?.uid ?? null)
    // Headless auto-resolution against the read-only property search — sequential + cancellable
    // so a large batch never fires a burst of requests. A single clear in-market match fills the
    // canonical name + place_id (+ area from its address); ambiguous rows keep inferred text and
    // the operator confirms from suggestions. Never overwrites a row the operator already edited.
    let cancelled = false
    void (async () => {
      for (const r of built) {
        if (cancelled) break
        const seed = r.inf.propertyName
        if (!seed) continue
        const res = await resolvePropertyMatch(seed, r.inf.market)
        if (cancelled || !res.match) continue
        setRows((prev) => prev.map((row) => {
          if (row.uid !== r.uid || row.matched || row.propertyName !== seed) return row
          const market = row.market || detectMarket(res.match!.address ?? "") || ""
          const area = row.areaNeighborhood || suggestArea(res.match!.address, market)
          return { ...row, propertyName: res.match!.name, placeId: res.match!.placeId, matched: true, ...(market ? { market } : {}), ...(area ? { areaNeighborhood: area } : {}) }
        }))
      }
    })()
    return () => { cancelled = true; built.forEach((r) => URL.revokeObjectURL(r.objectUrl)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patchRow = (uid: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))

  const counts = useMemo(() => {
    const c = { all: rows.length, ready: 0, review: 0, missing: 0 }
    for (const r of rows) c[rowStatus(r)]++
    return c
  }, [rows])
  const visible = useMemo(() => (filter === "all" ? rows : rows.filter((r) => rowStatus(r) === filter)), [rows, filter])

  const active = rows.find((r) => r.uid === activeUid) ?? null

  const toggleSel = (uid: string) => setSelected((p) => { const n = new Set(p); n.has(uid) ? n.delete(uid) : n.add(uid); return n })
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.uid))
  const selectAllVisible = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((r) => r.uid)))

  // Open one optional batch-override action with a clean draft.
  const openBulk = (kind: "property" | "market" | "type" | "overlay") => {
    setBatch({ propertyName: "", market: "", propertyType: "", overlayMode: "generate", placeId: null, matched: false })
    setBulkKind(kind)
  }
  const clearSelection = () => { setSelected(new Set()); setBulkKind(null) }
  const bulkCanApply = bulkKind === "property" ? !!batch.propertyName.trim() : bulkKind === "market" ? !!batch.market : bulkKind === "type" ? !!batch.propertyType : bulkKind === "overlay" ? true : false

  // Apply ONLY the open action's field to the selected rows. Property carries its canonical
  // place_id (a picked match); a free-text property clears any stale id and its matched flag.
  const applyBulk = () => {
    if (selected.size === 0 || !bulkKind || !bulkCanApply) return
    setRows((prev) => prev.map((r) => {
      if (!selected.has(r.uid)) return r
      const next = { ...r }
      if (bulkKind === "property") { next.propertyName = batch.propertyName.trim(); next.placeId = batch.matched ? batch.placeId : null; next.matched = batch.matched }
      if (bulkKind === "market") next.market = batch.market
      if (bulkKind === "type") next.propertyType = batch.propertyType
      if (bulkKind === "overlay") next.overlayMode = batch.overlayMode
      return next
    }))
    setBulkKind(null)
  }

  // Detail-panel property match → set name + place_id + (derive market from address if empty).
  const onMatch = (uid: string, m: PropertyMatch) => {
    const row = rows.find((r) => r.uid === uid)
    const market = row?.market || detectMarket(m.address ?? "") || detectMarket(m.name) || ""
    const area = row?.areaNeighborhood || suggestArea(m.address, market)
    patchRow(uid, { propertyName: m.name, placeId: m.placeId, matched: true, ...(market ? { market } : {}), ...(area ? { areaNeighborhood: area } : {}) })
  }

  const approveAndNext = (uid: string) => {
    patchRow(uid, { approved: true })
    // advance to the next row still needing attention (review/missing), else next row, else close.
    const order = visible
    const idx = order.findIndex((r) => r.uid === uid)
    const after = [...order.slice(idx + 1), ...order.slice(0, idx)]
    const next = after.find((r) => r.uid !== uid && rowStatus(r) !== "ready") ?? after[0] ?? null
    setActiveUid(next ? next.uid : null)
  }

  const startUpload = useCallback(async () => {
    setUploading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError("Please sign in again."); return }
      const batchId = uuidv4()
      const list = rows
      await runPool(list, UPLOAD_CONCURRENCY, async (r) => {
        setRows((prev) => prev.map((x) => (x.uid === r.uid ? { ...x, upload: "uploading" } : x)))
        try {
          const path = `${user.id}/${r.contentId}/source.${extOf(r.file.name)}`
          const up = await supabase.storage.from("social-media").upload(path, r.file, { contentType: r.file.type || "video/mp4", upsert: true })
          if (up.error) throw new Error(up.error.message)
          const res = await fetch("/api/admin/social-autopilot/content", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contentId: r.contentId,
              storagePath: path,
              originalFilename: r.file.name,
              contentType: r.file.type || null,
              sizeBytes: r.file.size,
              kind: (r.file.type || "").startsWith("image/") ? "image" : "clip",
              uploadBatchId: batchId,
              batchSeq: list.indexOf(r) + 1,
              market: r.market || null,
              propertyName: r.propertyName || null,
              propertyType: r.propertyType || null,
              overlayMode: r.overlayMode,
              areaNeighborhood: r.areaNeighborhood || null,
              placeId: r.placeId || null,
            }),
          })
          if (!res.ok) throw new Error("record failed")
          setRows((prev) => prev.map((x) => (x.uid === r.uid ? { ...x, upload: "done" } : x)))
        } catch {
          setRows((prev) => prev.map((x) => (x.uid === r.uid ? { ...x, upload: "error" } : x)))
        }
      })
      onUploaded()
    } finally {
      setUploading(false)
    }
  }, [rows, onUploaded])

  const doneCount = rows.filter((r) => r.upload === "done").length
  const allUploaded = rows.length > 0 && rows.every((r) => r.upload === "done" || r.upload === "error")

  const inputCls = "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const fieldLabel = "text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]"
  const btn = "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const primaryBtn = "text-[12.5px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
  const chip = (on: boolean) => "text-[12px] font-semibold px-2.5 py-1 rounded-full border transition-colors " + (on ? "border-[var(--crm-text-primary)] text-[var(--crm-text-primary)] bg-[var(--crm-card)]" : "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")

  // Property name / area are INTERNAL — the public preview uses only market + type (Bulk Review
  // rows don't capture special/price/amenities; those refine the preview later in Create Post).
  const activePrep = active ? preparePost({ market: active.market, propertyType: active.propertyType }, active.uid) : null
  // The ONE shared layout engine — the same call the Post Composer and the FFmpeg render make. This
  // used to hand-roll its own overlay from wrapHeadline() + overlayPreviewStyle(), which broke the
  // headline into ≤16-char lines BEFORE measuring anything and then drew every line at a fixed 66px.
  // That bypassed fit-to-width entirely, so "SAN ANTONIO SPLIT-LEVEL PENTHOUSES" rendered as three
  // stacked lines here while the actual burn-in was one fitted line. Bulk Review rows have no
  // per-row template (it is chosen later in Create Post), so the preview shows the default (T1).
  //
  // PLATFORM PARITY: these rows have no post yet, so there is no post.platform to read. The posts
  // route creates every new post as Instagram, so that is the platform whose safe box the burn-in
  // will use — passed EXPLICITLY rather than left to the parameter default, so this preview states
  // which platform it is showing instead of inheriting one by accident. A guard test asserts the
  // creation platform still matches DEFAULT_PLATFORM; if post creation ever becomes multi-platform,
  // that test fails here rather than this preview silently drifting from the render.
  const bulkLayout = activePrep ? computeOverlayLayout(DEFAULT_OVERLAY_TEMPLATE, activePrep.overlayHeadline, activePrep.overlaySubheadline, DEFAULT_PLATFORM) : null
  const activeConfirmed = !!(active && active.matched && active.placeId)

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => !uploading && onClose()}>
      <div className="w-full max-w-5xl h-[88vh] rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header + filters */}
        <div className="px-4 py-3 border-b border-[var(--crm-border)] flex items-center gap-2.5 flex-wrap">
          <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">Bulk Review</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" className={chip(filter === "all")} onClick={() => setFilter("all")}>All {counts.all}</button>
            <button type="button" className={chip(filter === "ready")} onClick={() => setFilter("ready")}>Ready {counts.ready}</button>
            <button type="button" className={chip(filter === "review")} onClick={() => setFilter("review")}>Confirm {counts.review}</button>
            <button type="button" className={chip(filter === "missing")} onClick={() => setFilter("missing")}>Missing Info {counts.missing}</button>
          </div>
          <button type="button" className={`${btn} ml-auto`} disabled={uploading} onClick={onClose}>Close</button>
        </div>

        {/* Optional batch overrides — actions, not permanent form fields. Row-by-row review is
            the primary workflow; these just apply one change to the whole selection at once. */}
        {selected.size > 0 && (
          <div className="border-b border-[var(--crm-border)] bg-[var(--crm-card)]">
            <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-[12px] font-bold text-[var(--crm-text-primary)]">{selected.size} selected</span>
              <span className="text-[11px] text-[var(--crm-text-muted)]">· optional batch overrides:</span>
              <button type="button" className={btn} onClick={() => openBulk("property")}>Change Property</button>
              <button type="button" className={btn} onClick={() => openBulk("market")}>Change Market</button>
              <button type="button" className={btn} onClick={() => openBulk("type")}>Change Type</button>
              <button type="button" className={btn} onClick={() => openBulk("overlay")}>Change Overlay</button>
              <button type="button" className={`${btn} ml-auto`} onClick={clearSelection}>Clear</button>
            </div>
            {bulkKind && (
              <div className="px-4 pb-2.5 pt-0.5 flex items-end gap-2 flex-wrap border-t border-[var(--crm-border)]">
                {bulkKind === "property" && (
                  <div className="min-w-[220px] flex-1 max-w-[360px]">
                    <span className={fieldLabel}>Canonical property</span>
                    <PropertySearchField value={batch.propertyName} matched={batch.matched} inputClassName={`${inputCls} mt-0.5`} placeholder="Search existing property or type…"
                      onChange={(v) => setBatch((b) => ({ ...b, propertyName: v, matched: false, placeId: null }))}
                      onMatch={(m) => setBatch((b) => ({ ...b, propertyName: m.name, placeId: m.placeId, matched: true, market: detectMarket(m.address ?? "") || b.market }))}
                      onClearMatch={() => setBatch((b) => ({ ...b, matched: false, placeId: null }))}
                    />
                  </div>
                )}
                {bulkKind === "market" && (
                  <div>
                    <span className={fieldLabel}>Market</span>
                    <select className={`${inputCls} mt-0.5`} value={batch.market} onChange={(e) => setBatch((b) => ({ ...b, market: e.target.value }))} autoFocus>
                      <option value="">Select market…</option>{SOCIAL_MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                {bulkKind === "type" && (
                  <div>
                    <span className={fieldLabel}>Type</span>
                    <select className={`${inputCls} mt-0.5`} value={batch.propertyType} onChange={(e) => setBatch((b) => ({ ...b, propertyType: e.target.value }))} autoFocus>
                      <option value="">Select type…</option>{PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                {bulkKind === "overlay" && (
                  <div>
                    <span className={fieldLabel}>Overlay</span>
                    <select className={`${inputCls} mt-0.5`} value={batch.overlayMode} onChange={(e) => setBatch((b) => ({ ...b, overlayMode: e.target.value === "existing" ? "existing" : "generate" }))} autoFocus>
                      <option value="generate">Generate</option>
                      <option value="existing">Already has text</option>
                    </select>
                  </div>
                )}
                <button type="button" className={primaryBtn} disabled={!bulkCanApply} onClick={applyBulk}>Apply to {selected.size}</button>
                <button type="button" className={btn} onClick={() => setBulkKind(null)}>Cancel</button>
                {bulkKind === "property" && (
                  <span className="text-[11px] text-[var(--crm-text-muted)] pb-1.5 basis-full">{batch.matched ? "✓ Canonical property will be linked to the selected videos." : "Pick a suggestion to link the canonical property, or type a name to set it manually."}</span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_340px]">
          {/* Table */}
          <div className="overflow-auto border-r border-[var(--crm-border)]">
            <table className="w-full text-[12px] border-collapse text-[var(--crm-text-secondary)]">
              <thead className="sticky top-0 bg-[var(--crm-panel)] z-10">
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)] border-b border-[var(--crm-border)]">
                  <th className="px-2 py-2"><input type="checkbox" checked={allVisibleSelected} onChange={selectAllVisible} className="accent-[var(--crm-text-primary)]" /></th>
                  <th className="px-2 py-2 font-semibold">Video</th>
                  <th className="px-2 py-2 font-semibold">Property</th>
                  <th className="px-2 py-2 font-semibold">Market</th>
                  <th className="px-2 py-2 font-semibold">Type</th>
                  <th className="px-2 py-2 font-semibold">Overlay</th>
                  <th className="px-2 py-2 font-semibold">Caption</th>
                  <th className="px-2 py-2 font-semibold text-right"># </th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const st = rowStatus(r)
                  const overlayOk = !!r.propertyName.trim()
                  const captionOk = !!(r.propertyName.trim() || r.market)
                  // Row readiness indicator — count what generation would actually produce (shared cap), not 8.
                  const tags = buildHashtags(r.market, MAX_HASHTAGS, r.propertyType).length
                  const sel = selected.has(r.uid)
                  return (
                    <tr key={r.uid} onClick={() => setActiveUid(r.uid)} className={"border-b border-[var(--crm-border)] cursor-pointer " + (activeUid === r.uid ? "bg-[var(--crm-card)]" : "hover:bg-[var(--crm-card)]/60")}>
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel} onChange={() => toggleSel(r.uid)} className="accent-[var(--crm-text-primary)]" /></td>
                      <td className="px-2 py-1.5"><div className="flex items-center gap-2"><LazyPoster url={r.objectUrl} /><span className="truncate max-w-[130px] text-[var(--crm-text-secondary)]" title={r.file.name}>{r.file.name}</span></div></td>
                      <td className="px-2 py-1.5"><span className={r.propertyName ? "text-[var(--crm-text-primary)]" : "text-[var(--crm-text-muted)]"}>{r.propertyName || "—"}</span>{r.matched && r.placeId && <span className="ml-1 text-emerald-500" title="Confirmed canonical property (place_id)">●</span>}</td>
                      <td className="px-2 py-1.5"><span className={r.market ? "text-[var(--crm-text-primary)]" : "text-[var(--crm-text-muted)]"}>{r.market || "—"}</span></td>
                      <td className="px-2 py-1.5">{r.propertyType || <span className="text-[var(--crm-text-muted)]">—</span>}</td>
                      <td className="px-2 py-1.5">{overlayOk ? <span className="text-emerald-600 dark:text-emerald-400">Ready</span> : <span className="text-[var(--crm-text-muted)]">—</span>}</td>
                      <td className="px-2 py-1.5">{captionOk ? <span className="text-emerald-600 dark:text-emerald-400">Ready</span> : <span className="text-[var(--crm-text-muted)]">—</span>}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-[var(--crm-text-secondary)]">{tags}</td>
                      <td className="px-2 py-1.5"><span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded ${STATUS_META[st].cls}`}>{STATUS_META[st].label}</span>{r.upload !== "pending" && <span className="ml-1 text-[10px] text-[var(--crm-text-muted)]">{r.upload}</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Detail / review panel — clicking any row drives this. Scrolls independently; the
              Save / Approve & Next actions stay pinned at the bottom. */}
          <div className="flex flex-col min-h-0 overflow-hidden">
            {active ? (
              <>
                <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
                  {/* Video with the prepared overlay drawn on top (CSS approximation of the burn-in;
                      NO FFmpeg here). */}
                  <div className="relative w-full aspect-[9/16] rounded-xl overflow-hidden border border-[var(--crm-border)] bg-black">
                    <video src={active.objectUrl} controls muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    {/* The SAME component the Post Composer and its lightbox use, fed by the same
                        computeOverlayLayout call, so this surface can no longer drift from the burn-in:
                        fitted font size, the real Libre Baskerville face, and white-space:pre (the
                        browser cannot re-wrap a fitted line). */}
                    <PreviewOverlay layout={bulkLayout} />
                  </div>

                  {/* Prepared Post — what this source will publish as. Read-only preview. */}
                  {activePrep && (
                    <div className="rounded-lg border border-[var(--crm-border)] p-2.5 flex flex-col gap-2">
                      <div className="text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)] font-semibold">Prepared Post</div>
                      <div>
                        <div className={fieldLabel}>Overlay</div>
                        <div className="text-[13px] font-bold text-[var(--crm-text-primary)] leading-tight">{activePrep.overlayHeadline || "—"}</div>
                        {activePrep.overlaySubheadline && <div className="text-[12px] text-[var(--crm-text-secondary)]">{activePrep.overlaySubheadline}</div>}
                      </div>
                      <div>
                        <div className={fieldLabel}>Caption</div>
                        <div className="text-[12px] text-[var(--crm-text-secondary)] line-clamp-3 whitespace-pre-line">{activePrep.caption}</div>
                      </div>
                      <div>
                        <div className={fieldLabel}>Hashtags</div>
                        <div className="text-[12px] text-[var(--crm-text-secondary)] break-words">{activePrep.hashtags.slice(0, 6).join(" ")}{activePrep.hashtags.length > 6 ? " …" : ""}</div>
                        <div className="text-[11px] text-[var(--crm-text-muted)] mt-0.5">{activePrep.hashtags.length} hashtags</div>
                      </div>
                    </div>
                  )}

                  {/* Property confirmation — separate from content readiness. */}
                  {active.propertyName.trim() && !activeConfirmed && !active.approved && (
                    <div className="text-[11.5px] text-amber-600 dark:text-amber-400">Property not yet confirmed — pick a canonical match below, or Approve to confirm this name manually.</div>
                  )}

                  {/* Editable metadata — beneath the visual/prepared review. */}
                  <div className="text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)] font-semibold pt-0.5">Edit metadata</div>
                  <label className="block">
                    <span className={fieldLabel}>Property / building name</span>
                    <PropertySearchField value={active.propertyName} matched={active.matched} inputClassName={`${inputCls} mt-1`} placeholder="Search existing property or type…"
                      onChange={(v) => patchRow(active.uid, { propertyName: v, matched: false, placeId: null })}
                      onMatch={(m) => onMatch(active.uid, m)}
                      onClearMatch={() => patchRow(active.uid, { matched: false, placeId: null })}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={fieldLabel}>Market</span>
                      <select className={`${inputCls} mt-1`} value={active.market} onChange={(e) => patchRow(active.uid, { market: e.target.value })}>
                        <option value="">—</option>{SOCIAL_MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className={fieldLabel}>Type</span>
                      <select className={`${inputCls} mt-1`} value={active.propertyType} onChange={(e) => patchRow(active.uid, { propertyType: e.target.value })}>
                        <option value="">—</option>{PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </label>
                  </div>
                  {/* Text Overlay default for this source: Generate (Beast Social overlay) vs Already
                      has text (video already has burned-in text — no Beast Social overlay). */}
                  <label className="block">
                    <span className={fieldLabel}>Overlay</span>
                    <select className={`${inputCls} mt-1`} value={active.overlayMode} onChange={(e) => patchRow(active.uid, { overlayMode: e.target.value === "existing" ? "existing" : "generate" })}>
                      <option value="generate">Generate</option>
                      <option value="existing">Already has text</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={fieldLabel}>Area / Neighborhood <span className="normal-case text-[var(--crm-text-muted)]">· internal</span></span>
                    {/* Canonical market catalog — the same bank the Upload modal and Smart Lead Form read. */}
                    <AreaSelect market={active.market} value={active.areaNeighborhood} className={`${inputCls} mt-1`}
                      onChange={(v) => patchRow(active.uid, { areaNeighborhood: v })} />
                  </label>
                </div>
                {/* Sticky action bar */}
                <div className="border-t border-[var(--crm-border)] bg-[var(--crm-panel)] px-3 py-2.5 flex items-center gap-2">
                  <button type="button" className={btn} onClick={() => setActiveUid(null)}>Save</button>
                  <button type="button" className={`${primaryBtn} ml-auto`} onClick={() => approveAndNext(active.uid)}>Approve &amp; Next</button>
                </div>
              </>
            ) : (
              <div className="text-[12.5px] text-[var(--crm-text-muted)] py-10 text-center">Select a row to review.</div>
            )}
          </div>
        </div>

        {/* Footer: upload */}
        <div className="px-4 py-3 border-t border-[var(--crm-border)] flex items-center gap-2">
          {error && <span className="text-[12px] text-red-500">{error}</span>}
          <span className="text-[11.5px] text-[var(--crm-text-muted)] ml-auto">{uploading || allUploaded ? `${doneCount}/${rows.length} uploaded` : `${rows.length} videos · Ready ${counts.ready} · Confirm ${counts.review} · Missing ${counts.missing}`}</span>
          {allUploaded ? (
            <button type="button" className={primaryBtn} onClick={onClose}>Done</button>
          ) : (
            <button type="button" className={primaryBtn} disabled={uploading || rows.length === 0} onClick={() => void startUpload()}>{uploading ? "Uploading…" : "Start Upload"}</button>
          )}
        </div>
      </div>
    </div>
  )
}
