"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
  const wrapRef = useRef<HTMLDivElement>(null) // trigger wrapper — also the position anchor
  const menuRef = useRef<HTMLDivElement>(null) // portaled menu — needed for outside-click detection
  // The menu is portaled to document.body and positioned `fixed` from the trigger's own rect. The
  // portal is NOT cosmetic: the Post Editor scrolls inside SocialAutopilotShell's
  // `flex-1 overflow-y-auto` region (itself inside the admin shell's `fixed inset-0 overflow-hidden`),
  // and a plain position:absolute menu gets clipped by that scroll container — the bug this control
  // had before. A native <select> (Music, right beside this) escapes the same ancestors because the
  // browser draws its popup outside the document; portaling is the equivalent for a custom menu.
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null)

  // Anchored to the field and opening DOWNWARD like the Music select beside it: same left edge and
  // width, directly below. Space below is absorbed by maxHeight + internal scroll instead of
  // flipping — an earlier version compared the space against a worst-case 320px constant, so on the
  // real editor layout (field sits low on the page) it flipped upward over Hashtags/Overlay even
  // though the actual menu fits fine below. Flipping now only happens when the space below is
  // genuinely too small to use AND there is more of it above (short viewports only).
  const reposition = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const GAP = 4
    const EDGE = 8 // keep off the very viewport edge
    const MIN_USABLE_H = 180 // below this a menu is too cramped to be worth opening downward
    const MAX_H = 320
    const spaceBelow = window.innerHeight - rect.bottom - GAP - EDGE
    const spaceAbove = rect.top - GAP - EDGE
    const openAbove = spaceBelow < MIN_USABLE_H && spaceAbove > spaceBelow
    setCoords({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(MAX_H, Math.max(140, openAbove ? spaceAbove : spaceBelow)),
      ...(openAbove ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    })
  }, [])

  useEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener("resize", reposition)
    window.addEventListener("scroll", reposition, true) // capture: catches any scrollable ancestor
    return () => {
      window.removeEventListener("resize", reposition)
      window.removeEventListener("scroll", reposition, true)
    }
  }, [open, reposition])

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
    // The menu is portaled to document.body, so it is NOT a DOM descendant of wrapRef — a click
    // inside it must also count as "inside" or it would immediately close itself.
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return
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
      {open && coords && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Voice Clips"
          className="fixed z-50 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] shadow-lg p-2 overflow-y-auto"
          style={{ left: coords.left, width: coords.width, top: coords.top, bottom: coords.bottom, maxHeight: coords.maxHeight }}
        >
          {section("Hooks", "hook", hooks, hookId, "start of video")}
          <div className="border-t border-[var(--crm-border)] my-1" />
          {section("CTAs", "cta", ctas, ctaId, "end of video")}
          {err && <p className="px-1 pt-1 text-[11.5px] text-red-500">{err}</p>}
          {busy && <p className="px-1 pt-1 text-[11.5px] text-[var(--crm-text-muted)]">Working…</p>}
        </div>,
        document.body,
      )}
    </div>
  )
}
