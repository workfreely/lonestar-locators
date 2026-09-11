"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"

// Social Autopilot → Library (platform-admin only; server-enforced). Visual card grid
// of source videos, designed to browse many. Thumbnails are generated IN THE BROWSER
// from the private signed video (a seeked early frame) — no backend rendering. Media
// stays private (signed URLs only). SA1 behavior preserved: upload, edit internal
// metadata, delete. Multi-upload + the editable naming convention arrive in SA1.1.

type Item = {
  id: string
  kind: string
  originalFilename: string | null
  contentType: string | null
  sizeBytes: number | null
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

const META_FIELDS: { key: keyof Item; label: string; textarea?: boolean }[] = [
  { key: "propertyName", label: "Property / building name" },
  { key: "market", label: "City / market" },
  { key: "special", label: "Current or historical special" },
  { key: "budgetRange", label: "Budget / price range" },
  { key: "amenities", label: "Amenities" },
  { key: "placeId", label: "Google Place ID (optional)" },
  { key: "notes", label: "Notes", textarea: true },
]

function filenameBase(name: string | null): string {
  if (!name) return ""
  return name.replace(/\.[^.]+$/, "")
}

// Browser-generated poster: show a seeked early frame; click to play with controls.
function VideoThumb({ src, title, isImage }: { src: string | null; title?: string; isImage?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  if (!src) {
    return <div className="w-full h-full flex items-center justify-center text-[11px] text-[var(--crm-text-muted)]">No preview</div>
  }
  if (isImage) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" title={title} className="w-full h-full object-cover" />
  }
  return (
    <div className="relative w-full h-full" title={title}>
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        preload="metadata"
        controls={playing}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          try {
            // Prefer an early useful frame over a possibly-black frame 0.
            v.currentTime = Math.min(0.6, (isFinite(v.duration) ? v.duration : 2) / 2)
          } catch {
            /* seeking unsupported for this source — the first frame stands */
          }
        }}
        className="w-full h-full object-cover bg-black"
      />
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
          <span className="h-9 w-9 rounded-full bg-white/90 text-black text-[13px] flex items-center justify-center pl-0.5">▶</span>
        </button>
      )}
    </div>
  )
}

export default function SocialAutopilotClient() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
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
        const up = await supabase.storage.from("social-media").upload(path, file, {
          contentType: file.type || "video/mp4",
          upsert: false,
        })
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
        setError("Couldn't save metadata.")
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

  const btn =
    "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const input =
    "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"
  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }
  const contentName = (it: Item) => it.propertyName || filenameBase(it.originalFilename) || "Untitled"

  return (
    <div>
      {/* Library header + upload. Search / filters / sort will live in this row later. */}
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[16px] font-bold text-[var(--crm-text-primary)]">Library</h2>
          <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1 max-w-xl">
            Your private source videos. Internal property details are operational only — they never become part of a
            public post.
          </p>
        </div>
        <div>
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
          <button
            type="button"
            className="text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload Videos"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-4 py-2.5 text-[13px] text-[var(--crm-text-secondary)]">
          {error}
        </div>
      )}

      {items === null ? (
        <div className="text-[13px] text-[var(--crm-text-secondary)] py-10 text-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-[var(--crm-text-primary)]">No source videos yet</p>
          <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1.5">Upload property videos to start your library.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((it) => (
            <div key={it.id} className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-hidden flex flex-col">
              <div className="aspect-[9/16] bg-[var(--crm-card)]">
                <VideoThumb src={it.previewUrl} title={it.originalFilename ?? undefined} isImage={it.kind === "image"} />
              </div>
              <div className="p-2.5 flex-1 flex flex-col">
                {/* Content Name — prominent; hover shows the original filename */}
                <div className="text-[13px] font-bold text-[var(--crm-text-primary)] leading-snug line-clamp-2" title={it.originalFilename ?? undefined}>
                  {contentName(it)}
                </div>
                <div className="text-[11.5px] text-[var(--crm-text-secondary)] mt-1 truncate">
                  {it.propertyName ? it.propertyName : <span className="text-[var(--crm-text-muted)]">No property</span>}
                  {it.market ? ` · ${it.market}` : ""}
                </div>
                <div className="text-[11px] text-[var(--crm-text-muted)] mt-0.5">{fmtDate(it.createdAt)}</div>
                <div className="flex gap-1.5 mt-2 pt-2 border-t border-[var(--crm-border)]">
                  <button type="button" className={btn} onClick={() => openEdit(it)}>Edit</button>
                  <button type="button" className={btn} onClick={() => remove(it.id)}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit metadata modal */}
      {editing && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[15px] font-bold text-[var(--crm-text-primary)]">Edit details</div>
            <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5 mb-3 truncate" title={editing.originalFilename ?? undefined}>
              {editing.originalFilename}
            </div>
            <div className="flex flex-col gap-2">
              {META_FIELDS.map((f) => (
                <label key={String(f.key)} className="block">
                  <span className="text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">{f.label}</span>
                  {f.textarea ? (
                    <textarea
                      className={`${input} mt-1 min-h-[56px]`}
                      value={(draft[f.key] as string) ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className={`${input} mt-1`}
                      value={(draft[f.key] as string) ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
                disabled={saving}
                onClick={() => void saveEdit()}
              >
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
