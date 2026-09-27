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
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null) // trigger button wrapper — also the position anchor
  const popoverRef = useRef<HTMLDivElement>(null) // portaled panel — needed for outside-click detection
  // Every admin page renders inside a `fixed inset-0 … overflow-hidden` shell (app/admin/layout.tsx),
  // which clips any plain `position:absolute` descendant that would visually extend past it — the
  // exact class of bug this popover had (appeared clipped/partial depending on where the trigger sat
  // on the page). Portaling to document.body (the SAME pattern already used for LeadBoard's drag
  // overlay, for this identical reason) escapes that ancestor entirely; `position: fixed` coordinates
  // are computed from the trigger's own bounding rect below, with a flip-to-above fallback when there
  // isn't enough room below in the viewport.
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(null)

  const reposition = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const POPOVER_MAX_H = 320 // keep in sync with the panel's max-h below
    const GAP = 4
    const spaceBelow = window.innerHeight - rect.bottom
    const openAbove = spaceBelow < POPOVER_MAX_H + GAP && rect.top > spaceBelow
    setCoords({
      right: window.innerWidth - rect.right,
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
    setLoading(true)
    try {
      const r = await fetch("/api/admin/social-autopilot/voice-clips")
      const j = await r.json()
      setClips(Array.isArray(j.clips) ? j.clips : [])
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => {
    if (!open) return
    // The popover is portaled to document.body now, so it's no longer a DOM descendant of wrapRef —
    // a click inside it must also count as "inside" or it would immediately close itself.
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || popoverRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const hooks = clips.filter((c) => c.clipType === "hook")
  const ctas = clips.filter((c) => c.clipType === "cta")
  const nameById = (id: string | null) => clips.find((c) => c.id === id)?.name
  const summary = (() => {
    const parts: string[] = []
    if (hookId) parts.push("Hook")
    if (ctaId) parts.push("CTA")
    return parts.length ? parts.join(" + ") : "Add Voice Clips"
  })()

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
      {list.length === 0 && !loading && <p className="px-2 py-1 text-[11.5px] text-[var(--crm-text-muted)]">No {label.toLowerCase()} yet — upload one to reuse across videos.</p>}
    </div>
  )

  return (
    <div className="relative" ref={wrapRef}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className={`${triggerClassName} cursor-pointer flex items-center justify-between text-left`}
        title={[hookId && `Hook: ${nameById(hookId)}`, ctaId && `CTA: ${nameById(ctaId)}`].filter(Boolean).join(" · ") || undefined}>
        <span className={summary === "Add Voice Clips" ? "text-[var(--crm-text-muted)]" : "text-[var(--crm-text-primary)]"}>{summary}</span>
        <span className="text-[var(--crm-text-muted)] ml-1">▾</span>
      </button>
      {open && coords && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-50 w-[min(320px,90vw)] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] shadow-lg p-2 max-h-[320px] overflow-auto"
          style={{ right: coords.right, top: coords.top, bottom: coords.bottom }}
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
