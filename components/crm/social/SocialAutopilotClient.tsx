"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"

// Social Autopilot — SA1 Content Library (platform-admin only; server-enforced).
// Upload a source video to the PRIVATE social-media bucket (direct browser→storage,
// RLS-gated to admins in their own folder), then record it with internal property
// metadata. Previews use short-lived signed URLs from the admin-gated API. No
// scheduling / rendering / publishing yet — those are later checkpoints.

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

export default function SocialAutopilotClient() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
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
        const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "")
        const uuid =
          globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const path = `${user.id}/${uuid}.${ext}`
        // Direct browser → private bucket; storage RLS restricts this to admins/own folder.
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

  const startEdit = (it: Item) => {
    setEditingId(it.id)
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

  const saveEdit = useCallback(
    async (id: string) => {
      setSaving(true)
      try {
        const res = await fetch(`/api/admin/social-autopilot/content/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        })
        if (!res.ok) {
          setError("Couldn't save metadata.")
          return
        }
        setEditingId(null)
        setDraft({})
        await load()
      } finally {
        setSaving(false)
      }
    },
    [draft, load],
  )

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

  const card = "rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)]"
  const btn =
    "text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors disabled:opacity-50"
  const input =
    "w-full text-[13px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2.5 py-1.5"

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--crm-text-primary)]">Social Autopilot — Content Library</h1>
          <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1">
            Private, admin-only. Upload a source property video and record its internal details. This metadata is
            operational only — it never becomes part of a public post.
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
            {uploading ? "Uploading…" : "Upload video"}
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
        <div className={`${card} px-6 py-12 text-center`}>
          <p className="text-[15px] font-semibold text-[var(--crm-text-primary)]">No source videos yet</p>
          <p className="text-[13px] text-[var(--crm-text-secondary)] mt-1.5">Upload a property video to start your library.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((it) => (
            <div key={it.id} className={`${card} p-4`}>
              <div className="flex gap-3">
                <div className="w-28 flex-none rounded-lg overflow-hidden bg-[var(--crm-card)] aspect-[9/16] flex items-center justify-center">
                  {it.previewUrl && it.kind !== "image" ? (
                    <video src={it.previewUrl} preload="metadata" muted className="w-full h-full object-cover" />
                  ) : it.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.previewUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] text-[var(--crm-text-muted)]">No preview</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-[var(--crm-text-primary)] truncate">
                    {it.propertyName || <span className="text-[var(--crm-text-muted)] font-semibold">Unlabeled property</span>}
                  </div>
                  <div className="text-[12px] text-[var(--crm-text-secondary)] mt-0.5">{it.market || "—"}</div>
                  <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-1 truncate">{it.originalFilename}</div>
                  <div className="text-[11.5px] text-[var(--crm-text-muted)] mt-0.5">Uploaded {fmtDate(it.createdAt)}</div>
                  <div className="flex gap-1.5 mt-2">
                    <button type="button" className={btn} onClick={() => (editingId === it.id ? setEditingId(null) : startEdit(it))}>
                      {editingId === it.id ? "Close" : "Edit details"}
                    </button>
                    <button type="button" className={btn} onClick={() => remove(it.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>

              {editingId === it.id && (
                <div className="mt-3 pt-3 border-t border-[var(--crm-border)] flex flex-col gap-2">
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
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-[var(--crm-text-primary)] text-[var(--crm-panel)] disabled:opacity-50"
                      disabled={saving}
                      onClick={() => saveEdit(it.id)}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button type="button" className={btn} onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {editingId !== it.id && (it.special || it.budgetRange || it.amenities || it.notes) && (
                <div className="mt-3 pt-3 border-t border-[var(--crm-border)] text-[12px] text-[var(--crm-text-secondary)] space-y-0.5">
                  {it.special && <div><span className="text-[var(--crm-text-muted)]">Special:</span> {it.special}</div>}
                  {it.budgetRange && <div><span className="text-[var(--crm-text-muted)]">Budget:</span> {it.budgetRange}</div>}
                  {it.amenities && <div><span className="text-[var(--crm-text-muted)]">Amenities:</span> {it.amenities}</div>}
                  {it.notes && <div><span className="text-[var(--crm-text-muted)]">Notes:</span> {it.notes}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
