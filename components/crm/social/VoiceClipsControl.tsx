"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"

// Voice Clips control for the Social Beast post editor. Sits 50/50 beside Music. The
// trigger matches the Music <select> height/width; opening it reveals the reusable
// library organized into Hooks (auto-placed at the start) and CTAs (auto-placed at the
// end). A Hook and a CTA can each be selected (mix-and-match). Clips carry file basics
// only — no property metadata (the post supplies context). Upload records to the
// social-media bucket + social_voice_clips.
type Clip = { id: string; clipType: "hook" | "cta"; name: string; durationSeconds: number | null; previewUrl?: string | null }
type Props = {
  triggerClassName: string
  hookId: string | null
  ctaId: string | null
  onChange: (next: { hookId: string | null; ctaId: string | null }) => void
}

async function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const el = document.createElement("audio")
      el.preload = "metadata"
      el.onloadedmetadata = () => { const d = el.duration; URL.revokeObjectURL(el.src); resolve(isFinite(d) ? Math.round(d * 10) / 10 : null) }
      el.onerror = () => resolve(null)
      el.src = URL.createObjectURL(file)
    } catch { resolve(null) }
  })
}

export default function VoiceClipsControl({ triggerClassName, hookId, ctaId, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [clips, setClips] = useState<Clip[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // The menu is a plain `position: absolute` child of this wrapper — the SAME anchored-dropdown
  // pattern every other custom select in this editor already uses (SpecialSelect, AmenitySelect,
  // PropertySearchField, AgentSearchField: `absolute z-2x/3x mt-1 w-full max-h-* overflow-auto`).
  // It is laid out inside the same scrolling content as the trigger, so the two move together by
  // construction — no portal, no fixed coordinates, no rect math, no scroll/resize listeners. The
  // previous version positioned it `fixed` from getBoundingClientRect() and re-measured on scroll,
  // which is exactly why it drifted: fixed coordinates are viewport-anchored, so the trigger scrolled
  // while the menu stayed put until a scroll event + React re-render caught it up a frame or more
  // later. `w-full` also gives it the field's exact width for free, matching the Music select.
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/social-autopilot/voice-clips")
      const j = await r.json()
      setClips(Array.isArray(j.clips) ? j.clips : [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => {
    if (!open) return
    // The menu is a DOM descendant of wrapRef again, so one containment check covers both the
    // trigger and the menu (clicks inside either are "inside").
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const hooks = clips.filter((c) => c.clipType === "hook")
  const ctas = clips.filter((c) => c.clipType === "cta")
  const nameById = (id: string | null) => clips.find((c) => c.id === id)?.name
  // Closed-field value, parallel to Music's "No Music" / "Original Audio" — a plain state label, never
  // clip filenames (those stay in the menu + the hover title).
  const summary = hookId && ctaId ? "Hook + CTA" : hookId ? "Hook selected" : ctaId ? "CTA selected" : "No Voice Clips"

  async function upload(clipType: "hook" | "cta", file: File) {
    setErr(null); setBusy(true)
    try {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id
      if (!uid) throw new Error("not signed in")
      const ext = (file.name.split(".").pop() || "m4a").toLowerCase().replace(/[^a-z0-9]/g, "")
      const path = `${uid}/voice/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from("social-media").upload(path, file, { contentType: file.type || "audio/mpeg", upsert: false })
      if (up.error) throw new Error(up.error.message)
      const durationSeconds = await readDuration(file)
      const name = file.name.replace(/\.[^.]+$/, "").slice(0, 120) || (clipType === "hook" ? "Hook" : "CTA")
      const res = await fetch("/api/admin/social-autopilot/voice-clips", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipType, name, storagePath: path, durationSeconds }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "save failed")
      const { clip } = await res.json()
      await load()
      // auto-select the newly uploaded clip for its type
      onChange({ hookId: clipType === "hook" ? clip.id : hookId, ctaId: clipType === "cta" ? clip.id : ctaId })
    } catch (e) { setErr((e as Error).message.slice(0, 120)) } finally { setBusy(false) }
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      await fetch(`/api/admin/social-autopilot/voice-clips?id=${id}`, { method: "DELETE" })
      if (hookId === id) onChange({ hookId: null, ctaId })
      if (ctaId === id) onChange({ hookId, ctaId: null })
      await load()
    } finally { setBusy(false) }
  }

  const preview = (url?: string | null) => { if (url) { const a = new Audio(url); a.play().catch(() => {}) } }

  const section = (label: string, type: "hook" | "cta", list: Clip[], selectedId: string | null, place: string) => (
    <div className="mb-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)]">{label} <span className="normal-case">· {place}</span></span>
        <label className="text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] cursor-pointer">
          + Upload
          <input type="file" accept="audio/*" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(type, f); e.currentTarget.value = "" }} />
        </label>
      </div>
      <button type="button" onClick={() => onChange({ hookId: type === "hook" ? null : hookId, ctaId: type === "cta" ? null : ctaId })}
        className={`w-full text-left text-[12.5px] px-2 py-1 rounded-md ${!selectedId ? "bg-[var(--crm-panel)] font-semibold" : "hover:bg-[var(--crm-panel)]"} text-[var(--crm-text-primary)]`}>
        None
      </button>
      {list.map((c) => (
        <div key={c.id} className={`flex items-center gap-1 px-2 py-1 rounded-md ${selectedId === c.id ? "bg-[var(--crm-panel)]" : "hover:bg-[var(--crm-panel)]"}`}>
          <button type="button" className="flex-1 text-left text-[12.5px] text-[var(--crm-text-primary)] truncate"
            onClick={() => onChange({ hookId: type === "hook" ? c.id : hookId, ctaId: type === "cta" ? c.id : ctaId })}>
            {selectedId === c.id ? "✓ " : ""}{c.name}{c.durationSeconds ? ` · ${c.durationSeconds}s` : ""}
          </button>
          {c.previewUrl && <button type="button" aria-label="Preview" className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => preview(c.previewUrl)}>▶</button>}
          <button type="button" aria-label="Delete" className="text-[var(--crm-text-muted)] hover:text-red-500" onClick={() => remove(c.id)}>×</button>
        </div>
      ))}
      {/* No empty-state sentence: an empty section is just "None" + "+ Upload", which is self-evident. */}
    </div>
  )

  return (
    <div className="relative" ref={wrapRef}>
      {/* Trigger = the SAME `control` class the Music <select> beside it uses (identical height,
          border, radius, background, typography), plus a select-style chevron and focus ring, so the
          two read as one control system. The value text uses primary color in every state, exactly
          like Music's selected option ("No Voice Clips" is a real value, not a placeholder). */}
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className={`${triggerClassName} cursor-pointer flex items-center justify-between gap-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--crm-accent)]`}
        title={[hookId && `Hook: ${nameById(hookId)}`, ctaId && `CTA: ${nameById(ctaId)}`].filter(Boolean).join(" · ") || undefined}>
        <span className="text-[var(--crm-text-primary)] truncate">{summary}</span>
        <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 shrink-0 text-[var(--crm-text-muted)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Voice Clips"
          className="absolute z-30 mt-1 w-full left-0 max-h-[320px] overflow-y-auto rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] shadow-lg p-2"
        >
          {section("Hooks", "hook", hooks, hookId, "start of video")}
          <div className="border-t border-[var(--crm-border)] my-1" />
          {section("CTAs", "cta", ctas, ctaId, "end of video")}
          {err && <p className="px-1 pt-1 text-[11.5px] text-red-500">{err}</p>}
          {busy && <p className="px-1 pt-1 text-[11.5px] text-[var(--crm-text-muted)]">Working…</p>}
        </div>
      )}
    </div>
  )
}
