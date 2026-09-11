"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { DEMO_LIBRARY } from "./demoFixtures"

// Social Autopilot → Library (platform-admin only; server-enforced). Visual card grid
// of source videos with market filtering, search + sort homes, and browser-generated
// 9:16 thumbnails from the private signed video (no backend rendering). When empty it
// shows isolated UI-only SAMPLE cards (never DB rows) so the design is reviewable.
// One social_content row = one source video (later: many social_posts variations).

type Item = {
  id: string
  kind: string
  originalFilename: string | null
  propertyName: string | null
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
  dateLabel: string
  sortDate: number
  originalFilename: string | null
  previewUrl: string | null
  hue: number | null
  demo: boolean
  raw?: Item
}

const META_FIELDS: { key: keyof Item; label: string; textarea?: boolean }[] = [
  { key: "propertyName", label: "Property / building name" },
  { key: "market", label: "City / market" },
  { key: "special", label: "Current or historical special" },
  { key: "budgetRange", label: "Budget / price range" },
  { key: "amenities", label: "Amenities" },
  { key: "placeId", label: "Google Place ID (optional)" },
  { key: "notes", label: "Notes", textarea: true },
]
const SORTS = ["Newest", "Oldest", "Property", "Market"] as const
type Sort = (typeof SORTS)[number]

const base = (name: string | null) => (name ? name.replace(/\.[^.]+$/, "") : "")
const fmt = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

// 9:16 thumbnail. Real item → seeked poster frame (click to play). Demo → color block.
function Thumb({ card, onOpen }: { card: Card; onOpen?: () => void }) {
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
            onOpen?.()
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
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [market, setMarket] = useState("All")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<Sort>("Newest")
  const [editing, setEditing] = useState<Item | null>(null)
  const [draft, setDraft] = useState<Partial<Item>>({})
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
        displayName: it.propertyName || base(it.originalFilename) || "Untitled",
        propertyName: it.propertyName,
        market: it.market,
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

  const markets = useMemo(() => ["All", ...Array.from(new Set(allCards.map((c) => c.market).filter(Boolean) as string[])).sort()], [allCards])

  const cards = useMemo(() => {
    let list = allCards
    if (market !== "All") list = list.filter((c) => c.market === market)
    const q = search.trim().toLowerCase()
    if (q) list = list.filter((c) => [c.displayName, c.propertyName, c.originalFilename].some((v) => (v ?? "").toLowerCase().includes(q)))
    const sorted = [...list]
    if (sort === "Newest") sorted.sort((a, b) => b.sortDate - a.sortDate)
    else if (sort === "Oldest") sorted.sort((a, b) => a.sortDate - b.sortDate)
    else if (sort === "Property") sorted.sort((a, b) => (a.propertyName ?? "").localeCompare(b.propertyName ?? ""))
    else if (sort === "Market") sorted.sort((a, b) => (a.market ?? "").localeCompare(b.market ?? ""))
    return sorted
  }, [allCards, market, search, sort])

  const onUpload = useCallback(
    async (file: File) => {
      setError(null)
      setUploading(true)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          setError("Please sign in again.")
          return
        }
        const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4"
        const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const path = `${user.id}/${uuid}.${ext}`
        const up = await supabase.storage.from("social-media").upload(path, file, { contentType: file.type || "video/mp4", upsert: false })
        if (up.error) {
          setError("Upload failed (storage): " + up.error.message)
          return
        }
        const res = await fetch("/api/admin/social-autopilot/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath: path,
            originalFilename: file.name,
            contentType: file.type || null,
            sizeBytes: file.size,
            kind: (file.type || "").startsWith("image/") ? "image" : "clip",
          }),
        })
        if (!res.ok) {
          setError("Upload saved to storage but metadata record failed.")
          return
        }
        await load()
      } catch {
        setError("Upload failed.")
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ""
      }
    },
    [load],
  )

  const openEdit = (it: Item) => {
    setEditing(it)
    setDraft({
      propertyName: it.propertyName ?? "",
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
      const res = await fetch(`/api/admin/social-autopilot/content/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
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

  const chip = (active: boolean) =>
    "text-[12px] font-semibold px-3 py-1.5 rounded-full border transition-colors " +
    (active
      ? "border-[var(--crm-text-primary)] text-[var(--crm-text-primary)] bg-[var(--crm-card)]"
      : "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]")
  const control =
    "text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const btn =
    "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const inputCls =
    "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"

  return (
    <div>
      {/* One compact controls row: Search · Market filters · Sort · [Sample] · Upload */}
      <div className="mb-3 flex items-center gap-2.5 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search property name…"
          className={`${control} w-[220px] max-w-full`}
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          {markets.map((m) => (
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
        {usingDemo && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-dashed border-[var(--crm-border)] text-[var(--crm-text-muted)]" title="Sample content for layout preview — not saved">
            Sample data
          </span>
        )}
        <button
          type="button"
          className="ml-auto text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          title="Multi-file upload with batch property details arrives in SA1.1"
        >
          {uploading ? "Uploading…" : "Upload Videos"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onUpload(f)
          }}
        />
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[13px] text-[var(--crm-text-secondary)]">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-[13px] text-[var(--crm-text-secondary)] py-10 text-center">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center text-[13px] text-[var(--crm-text-secondary)]">
          No videos match.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {cards.map((c) => (
            <div key={c.key} className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-hidden flex flex-col">
              <div className="relative aspect-[9/16] bg-[var(--crm-card)]">
                <Thumb card={c} />
                {c.demo && (
                  <span className="absolute top-1.5 left-1.5 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-black/55 text-white">
                    Sample
                  </span>
                )}
              </div>
              <div className="p-2.5 flex-1 flex flex-col">
                <div className="text-[12.5px] font-bold text-[var(--crm-text-primary)] leading-snug line-clamp-2" title={c.originalFilename ?? undefined}>
                  {c.displayName}
                </div>
                <div className="text-[11.5px] text-[var(--crm-text-secondary)] mt-1 truncate">
                  {c.propertyName || <span className="text-[var(--crm-text-muted)]">No property</span>}
                  {c.market ? ` · ${c.market}` : ""}
                </div>
                <div className="text-[11px] text-[var(--crm-text-muted)] mt-0.5">{c.dateLabel}</div>
                {!c.demo && c.raw && (
                  <div className="flex gap-1.5 mt-2 pt-2 border-t border-[var(--crm-border)]">
                    <button type="button" className={btn} onClick={() => openEdit(c.raw!)}>Edit</button>
                    <button type="button" className={btn} onClick={() => remove(c.raw!.id)}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">Edit details</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5 mb-3 truncate" title={editing.originalFilename ?? undefined}>{editing.originalFilename}</div>
            <div className="flex flex-col gap-2">
              {META_FIELDS.map((f) => (
                <label key={String(f.key)} className="block">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">{f.label}</span>
                  {f.textarea ? (
                    <textarea className={`${inputCls} mt-1 min-h-[56px]`} value={(draft[f.key] as string) ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                  ) : (
                    <input className={`${inputCls} mt-1`} value={(draft[f.key] as string) ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />
                  )}
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50" disabled={saving} onClick={() => void saveEdit()}>
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
