"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
// The pure rule module, NOT renderVideo — that one imports node:child_process and
// cannot be pulled into a client bundle.
import { voiceClipsFit } from "@/lib/social/voiceFit"

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
  /** Absent ⇒ no recommendations are fetched and the control behaves exactly as before. */
  postId?: string | null
  /** Raised when the current selection has a HARD factual conflict, so the editor can stop a publish. */
  onBlocksPublishChange?: (blocked: boolean) => void
  /**
   * The source video's length, read from the preview player's metadata. The server does not know
   * it — social_content.duration_s is null on every row — so the browser, which has already
   * loaded the video, is the cheapest place to learn it. Null/absent ⇒ no fit check here; the
   * renderer still refuses an overlapping pair.
   */
  videoDurationSeconds?: number | null
  /**
   * The lengths of the clips CURRENTLY selected, reported upward as they become known.
   *
   * This control already fetches the library, so it is the only place that knows how long the
   * chosen hook and CTA are. The editor needs those numbers to print its timing line, and
   * fetching the list a second time to learn them would be a second source of truth for the same
   * fact. Null means "nothing selected for that slot", not "unknown".
   */
  onSelectionDurationsChange?: (d: { hookSeconds: number | null; ctaSeconds: number | null }) => void
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

/** What the suggestions endpoint returns, narrowed to what this control renders. */
type Suggested = { id: string | null; displayName: string; why?: string[]; reasons?: string[]; eligibility?: string; transcript?: string | null; transcriptStatus?: string }
type Warning = { level: "hard" | "soft"; reasons: string[] } | null
type Suggestions = {
  property: { name: string | null; market: string | null; propertyType: string | null; propertyTypeSource: string | null; startingRent: number | null }
  recommended: { hooks: Suggested[]; ctas: Suggested[] }
  conditional: Suggested[]
  rejected: Suggested[]
  warnings: { hook: Warning; cta: Warning }
  blocksPublish: boolean
}

export default function VoiceClipsControl({ triggerClassName, hookId, ctaId, onChange, postId, onBlocksPublishChange, videoDurationSeconds, onSelectionDurationsChange }: Props) {
  // RECOMMENDATIONS ARE ADVISORY. They are fetched, displayed and never applied: nothing here
  // calls onChange on its own, so opening this control cannot alter a saved draft.
  const [sug, setSug] = useState<Suggestions | null>(null)
  useEffect(() => {
    if (!postId) return
    let alive = true
    fetch(`/api/admin/social-autopilot/posts/${postId}/voice-suggestions`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j) setSug(j) })
      .catch(() => {})
    return () => { alive = false }
    // hookId/ctaId are dependencies because the WARNING is about what is currently selected.
  }, [postId, hookId, ctaId])
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

  // Loaded on open as before, and ONCE up front when a fit check is possible — the overlap
  // warning has to be true of a closed control too, and it needs the selected clips' durations.
  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => { if (!open && (hookId || ctaId) && clips.length === 0) load() }, [open, hookId, ctaId, clips.length, load])
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

  // ── WOULD THE TWO SELECTED CLIPS TALK OVER EACH OTHER? ──────────────────────────────────────
  // The hook plays from the start and the CTA runs to the end, so a pair longer than the video
  // overlaps. Computed from the clip list this control already has and the duration the preview
  // player already loaded — no new request, no new column. The renderer enforces the same rule
  // from the probed duration; this is the half that tells someone BEFORE they render.
  const [fit, setFit] = useState<{ hook: number; cta: number; video: number } | null>(null)
  useEffect(() => {
    const h = clips.find((c) => c.id === hookId)?.durationSeconds ?? null
    const c = clips.find((c) => c.id === ctaId)?.durationSeconds ?? null
    const v = videoDurationSeconds ?? null
    setFit(h !== null && c !== null && v !== null && !voiceClipsFit(v, h, c) ? { hook: h, cta: c, video: v } : null)
  }, [clips, hookId, ctaId, videoDurationSeconds])
  useEffect(() => { onBlocksPublishChange?.((sug?.blocksPublish ?? false) || fit !== null) }, [sug?.blocksPublish, fit, onBlocksPublishChange])

  // The same two lookups the fit check just did, handed to whoever asked for them.
  const hookSeconds = clips.find((c) => c.id === hookId)?.durationSeconds ?? null
  const ctaSeconds = clips.find((c) => c.id === ctaId)?.durationSeconds ?? null
  useEffect(() => { onSelectionDurationsChange?.({ hookSeconds, ctaSeconds }) }, [hookSeconds, ctaSeconds, onSelectionDurationsChange])
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

  /**
   * DELETE IS PERMANENT AND WAS ONE CLICK AWAY.
   *
   * This removes the row AND the uploaded original from storage, with no undo. In a 52-row menu
   * the × sits a few pixels from the row you meant to select, and a misplaced click silently
   * destroyed a recording — it had to be re-imported from the copy on disk. One confirm, naming
   * the clip, is the whole fix; nothing else about the control changes.
   */
  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete “${name}” from the library?\n\nThis removes the uploaded recording as well, and cannot be undone.`)) return
    setBusy(true)
    try {
      await fetch(`/api/admin/social-autopilot/voice-clips?id=${id}`, { method: "DELETE" })
      if (hookId === id) onChange({ hookId: null, ctaId })
      if (ctaId === id) onChange({ hookId, ctaId: null })
      await load()
    } finally { setBusy(false) }
  }

  const preview = (url?: string | null) => { if (url) { const a = new Audio(url); a.play().catch(() => {}) } }

  const section = (label: string, type: "hook" | "cta", list: Clip[], selectedId: string | null, place: string) => {
    const recs = (type === "hook" ? sug?.recommended.hooks : sug?.recommended.ctas) ?? []
    // A conditional clip belongs to THIS section when it is one of this section's clips. The
    // membership test is the whole rule: an unmatched id (a clip the library no longer has) belongs
    // to neither section rather than to both.
    const cond = (sug?.conditional ?? []).filter((c) => !!c.id && list.some((l) => l.id === c.id))
    const warning = (type === "hook" ? sug?.warnings.hook : sug?.warnings.cta) ?? null
    return (
    <div className="mb-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)]">{label} <span className="normal-case">· {place}</span></span>
        <label className="text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] cursor-pointer">
          + Upload
          <input type="file" accept="audio/*" className="hidden" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(type, f); e.currentTarget.value = "" }} />
        </label>
      </div>
      {/* THE WARNING COMES FIRST, because it is about what is already chosen. A hard conflict is
          factual — wrong market, a price the verified rent does not support, the wrong property
          type — and blocks publishing. A soft one is a claim that needs confirming, not
          correcting, so it informs without stopping anything. */}
      {warning && (
        <p className={`mx-1 mb-1 rounded-md border px-1.5 py-1 text-[10.5px] leading-snug ${
          warning.level === "hard"
            ? "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
            : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
          <span className="font-semibold">{warning.level === "hard" ? "Conflicts with verified property details — publishing is blocked." : "Needs your confirmation."}</span>{" "}
          {warning.reasons.join("; ")}
        </p>
      )}

      {/* RECOMMENDED. The same rows as below, in a labelled group, each carrying the reason it was
          recommended. Clicking one is an ordinary manual selection — there is no second code path. */}
      {recs.length > 0 && (
        <div className="mb-1">
          <div className="px-1 text-[10px] uppercase tracking-wide text-emerald-600">Recommended</div>
          {recs.map((r) => {
            const c = r.id ? list.find((x) => x.id === r.id) : null
            return (
              <div key={r.id ?? r.displayName} className={`flex items-start gap-1 px-2 py-1 rounded-md ${selectedId === r.id ? "bg-[var(--crm-panel)]" : "hover:bg-[var(--crm-panel)]"}`}>
                <button type="button" className="flex-1 text-left" disabled={!r.id}
                  onClick={() => r.id && onChange({ hookId: type === "hook" ? r.id : hookId, ctaId: type === "cta" ? r.id : ctaId })}>
                  <span className="block text-[12.5px] text-[var(--crm-text-primary)] truncate">{selectedId === r.id ? "✓ " : ""}{r.displayName}</span>
                  {(r.why ?? []).map((w, i) => <span key={i} className="block text-[10px] text-[var(--crm-text-muted)]">· {w}</span>)}
                </button>
                {c?.previewUrl && <button type="button" aria-label="Preview" className="mt-[2px] text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => preview(c.previewUrl)}>▶</button>}
              </div>
            )
          })}
        </div>
      )}

      {/* CONDITIONAL. Compatible, but making a claim nothing in the database can settle — a client
          experience, a current special. Shown so the library does not look smaller than it is, and
          labelled so choosing one is a decision rather than an accident. */}
      {cond.length > 0 && (
        <div className="mb-1">
          <div className="px-1 text-[10px] uppercase tracking-wide text-amber-600">Needs confirmation</div>
          {cond.map((r) => (
            <div key={r.id ?? r.displayName} className={`flex items-start gap-1 px-2 py-1 rounded-md ${selectedId === r.id ? "bg-[var(--crm-panel)]" : "hover:bg-[var(--crm-panel)]"}`}>
              <button type="button" className="flex-1 text-left" disabled={!r.id}
                onClick={() => r.id && onChange({ hookId: type === "hook" ? r.id : hookId, ctaId: type === "cta" ? r.id : ctaId })}>
                <span className="block text-[12.5px] text-[var(--crm-text-primary)] truncate">{selectedId === r.id ? "✓ " : ""}{r.displayName}</span>
                {(r.why ?? []).map((w, i) => <span key={i} className="block text-[10px] text-amber-600">· {w}</span>)}
              </button>
            </div>
          ))}
        </div>
      )}

      {recs.length > 0 && <div className="px-1 text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)]">All {type === "hook" ? "hooks" : "CTAs"}</div>}
      <button type="button" onClick={() => onChange({ hookId: type === "hook" ? null : hookId, ctaId: type === "cta" ? null : ctaId })}
        className={`w-full text-left text-[12.5px] px-2 py-1 rounded-md ${!selectedId ? "bg-[var(--crm-panel)] font-semibold" : "hover:bg-[var(--crm-panel)]"} text-[var(--crm-text-primary)]`}>
        None
      </button>
      {list.map((c) => (
        <div key={c.id} className={`flex items-center gap-1 px-2 py-1 rounded-md ${selectedId === c.id ? "bg-[var(--crm-panel)]" : "hover:bg-[var(--crm-panel)]"}`}>
          <button type="button" className="flex-1 text-left text-[12.5px] text-[var(--crm-text-primary)] truncate"
            onClick={() => onChange({ hookId: type === "hook" ? c.id : hookId, ctaId: type === "cta" ? c.id : ctaId })}>
            {selectedId === c.id ? "✓ " : ""}{c.name}{c.durationSeconds ? ` · ${c.durationSeconds.toFixed(1)}s` : ""}
          </button>
          {c.previewUrl && <button type="button" aria-label="Preview" className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => preview(c.previewUrl)}>▶</button>}
          <button type="button" aria-label="Delete" className="text-[var(--crm-text-muted)] hover:text-red-500" onClick={() => remove(c.id, c.name)}>×</button>
        </div>
      ))}
      {/* No empty-state sentence: an empty section is just "None" + "+ Upload", which is self-evident. */}
    </div>
    )
  }

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
      {/* THE OVERLAP WARNING SITS OUTSIDE THE MENU, because it is true whether the menu is open or
          shut and it stops a publish. Everything else in this control is advisory; this is not. */}
      {fit && (
        <p className="mt-1 rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-1 text-[10.5px] leading-snug text-red-600 dark:text-red-400">
          <span className="font-semibold">Hook and CTA don&rsquo;t fit — publishing is blocked.</span>{" "}
          {fit.hook.toFixed(1)}s + {fit.cta.toFixed(1)}s is longer than this {fit.video.toFixed(1)}s video, so they
          would play over each other. Choose a shorter clip or longer footage — nothing is trimmed to make them fit.
        </p>
      )}
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
