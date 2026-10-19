"use client"

import { useCallback, useEffect, useState } from "react"
import { PRESENTER, clampIntroSeconds, clampWidthPx, normalizeSide, type PresenterSide } from "@/lib/social/presenterSpec"
import {
  PRESENTER_UPLOAD, checkPresenterFormat, checkPresenterSize, labelFromFilename, presenterStorageKey,
} from "@/lib/social/presenterUpload"
import { CLIP_STATE_MESSAGE, isLipSyncSafe, type ClipMatchState } from "@/lib/social/presenterClipCache"
import { supabase } from "@/lib/supabase/client"

/**
 * AI PRESENTER — the post editor's control.
 *
 * Deliberately COLLAPSED to a single switch until it is turned on. The feature is off for every
 * existing post and will be off for most new ones, so its default state should cost one line of
 * vertical space, not a panel of disabled inputs. Everything below the switch only exists once an
 * operator has opted in.
 *
 * The geometry defaults (lower-left, 360px, 4s) are NOT defined here — they come from
 * presenterSpec, the same module the renderer reads. A control that hardcoded "360" would be a
 * second source of truth and would drift the moment the product default changed.
 */
export type PresenterOption = {
  id: string
  label: string
  isSample: boolean
  defaultIntroSeconds: number
  hasClip: boolean
  voiceKind: string
}

export type PresenterValue = {
  presenterId: string | null
  introSeconds: number | null
  side: string | null
  widthPx: number | null
  audioVoiceClipId: string | null
}

export default function AiPresenterControl({
  value,
  onChange,
  disabled,
  disabledHint,
  controlClassName,
}: {
  value: PresenterValue
  onChange: (next: PresenterValue) => void
  disabled?: boolean
  disabledHint?: string
  controlClassName: string
}) {
  const [options, setOptions] = useState<PresenterOption[] | null>(null)
  // Narration choices come from the SAME endpoint the Voice Clips control uses, so the two lists
  // can never disagree about what exists. Fetched here rather than threaded through the editor.
  const [voiceClips, setVoiceClips] = useState<{ id: string; name: string; clipType: string }[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)
  // Upload state is kept separate from loadErr: a failed upload must not read as "the presenter
  // list is broken", and the list the operator already has stays usable while one upload fails.
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  // LIP-SYNC MATCH. Recomputed from the server on every change of presenter or voice hook — never
  // carried over, because a retained match is how a clip synced to one recording ends up on
  // another. null while unknown, so the UI says nothing rather than guessing.
  const [clipState, setClipState] = useState<ClipMatchState | null>(null)
  const [matching, setMatching] = useState(false)
  const [associating, setAssociating] = useState(false)
  const [associateErr, setAssociateErr] = useState<string | null>(null)
  const on = !!value.presenterId

  // Loaded lazily — a post that never turns the feature on never pays for this request.
  //
  // RETURNS the list as well as storing it. `toggle` needs the presenters in the same tick it
  // fetched them, and reading `options` after `await load()` would read the CLOSURE's value, which
  // is still null until React re-renders — so the first click would always conclude that no
  // presenter exists and silently refuse to turn on. Returning the value sidesteps the stale
  // closure entirely.
  const load = useCallback(async (): Promise<PresenterOption[]> => {
    try {
      const res = await fetch("/api/admin/social-autopilot/presenters")
      if (!res.ok) { setLoadErr("Couldn't load presenters."); setOptions([]); return [] }
      const j = (await res.json()) as { presenters?: PresenterOption[] }
      const list = j.presenters ?? []
      setOptions(list)
      return list
    } catch {
      setLoadErr("Couldn't load presenters.")
      setOptions([])
      return []
    }
  }, [])
  useEffect(() => { if (on && options === null) void load() }, [on, options, load])
  useEffect(() => {
    if (!on || voiceClips.length) return
    void (async () => {
      try {
        const res = await fetch("/api/admin/social-autopilot/voice-clips")
        if (!res.ok) return
        const j = (await res.json()) as { clips?: { id: string; name: string; clipType: string }[] }
        setVoiceClips(j.clips ?? [])
      } catch { /* narration stays optional — the presenter's own voice is the fallback */ }
    })()
  }, [on, voiceClips.length])

  // ── THE MATCH LOOKUP ──────────────────────────────────────────────────────────────────────
  // Keyed on BOTH ids, so changing either one re-asks the server. The previous answer is cleared
  // first: showing a stale "Reusing…" against a newly chosen hook would assert exactly the thing
  // this feature exists to prevent.
  useEffect(() => {
    if (!on || !value.presenterId) { setClipState(null); return }
    let live = true
    setClipState(null)
    setMatching(true)
    void (async () => {
      try {
        const q = new URLSearchParams({ presenterId: value.presenterId! })
        if (value.audioVoiceClipId) q.set("voiceClipId", value.audioVoiceClipId)
        const res = await fetch(`/api/admin/social-autopilot/presenters/clips?${q.toString()}`)
        if (!live) return
        if (!res.ok) { setClipState(null); return }
        const j = (await res.json()) as { state?: ClipMatchState }
        if (live) setClipState(j.state ?? null)
      } catch {
        if (live) setClipState(null)
      } finally {
        if (live) setMatching(false)
      }
    })()
    // Cleanup flips `live`, so a slow response for the PREVIOUS selection cannot land after a
    // newer one — the classic way a stale match becomes visible.
    return () => { live = false }
  }, [on, value.presenterId, value.audioVoiceClipId])

  const patch = (p: Partial<PresenterValue>) => onChange({ ...value, ...p })

  const toggle = async () => {
    if (on) {
      // Turning OFF clears the whole configuration rather than leaving orphaned settings behind
      // that would silently reapply if it were switched on again later.
      onChange({ presenterId: null, introSeconds: null, side: null, widthPx: null, audioVoiceClipId: null })
      return
    }
    const loaded = options ?? (await load())
    setLoadErr(null)
    // Pick the agent's own presenter if they have one, else the sample — never a clipless row,
    // which could not render.
    const list = loaded.filter((o) => o.hasClip)
    const first = list.find((o) => !o.isSample) ?? list[0]
    if (!first) { setLoadErr("No presenter is available yet."); return }
    patch({ presenterId: first.id, introSeconds: clampIntroSeconds(first.defaultIntroSeconds), side: null, widthPx: null })
  }

  /**
   * UPLOAD AN AVATAR CLIP — the two-step the Voice Clips library uses.
   *
   * The browser puts the file in the bucket with its own authenticated client, then the route
   * registers the key. The file deliberately does NOT travel through the API request: a serverless
   * request body is capped well below the size of a real avatar clip, so the simpler-looking
   * version is the one that fails on a large file.
   *
   * The checks here are a courtesy, not the protection — they catch the obvious mistake before a
   * pointless upload. The route re-derives all of them server-side, and it is the route that
   * proves transparency, which nothing on this side can do.
   */
  const upload = async (file: File) => {
    setUploadErr(null)
    const fmt = checkPresenterFormat(file.name)
    if (!fmt.ok) { setUploadErr(fmt.detail); return }
    const sizeErr = checkPresenterSize(file.size)
    if (sizeErr) { setUploadErr(sizeErr); return }

    setUploading(true)
    try {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id
      if (!uid) throw new Error("You are not signed in.")
      const key = presenterStorageKey(uid, fmt.ext, crypto.randomUUID())
      const up = await supabase.storage.from("social-media").upload(key, file, {
        contentType: file.type || (fmt.ext === "webm" ? "video/webm" : "video/quicktime"),
        upsert: false,
      })
      if (up.error) throw new Error(up.error.message)

      const res = await fetch("/api/admin/social-autopilot/presenters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: key, filename: file.name, label: labelFromFilename(file.name) }),
      })
      const j = (await res.json().catch(() => ({}))) as { presenter?: PresenterOption; error?: string; detail?: string }
      // The route removes the stored object on every failure, so there is nothing to clean up here
      // and a retry starts from a clean bucket.
      if (!res.ok || !j.presenter) throw new Error(j.detail ?? j.error ?? "The avatar could not be saved.")

      // Refresh from the server rather than appending locally, so the list is exactly what the
      // next render of this control would fetch — and select the new avatar straight away.
      const list = await load()
      const saved = list.find((o) => o.id === j.presenter!.id) ?? j.presenter
      patch({ presenterId: saved.id, introSeconds: clampIntroSeconds(saved.defaultIntroSeconds) })
      setLoadErr(null)
    } catch (e) {
      setUploadErr((e as Error).message.slice(0, 240))
    } finally {
      setUploading(false)
    }
  }

  /**
   * ASSOCIATE the selected presenter's clip with the selected voice recording.
   *
   * This is what POPULATES the cache in Phase 2a. It is an explicit operator statement rather than
   * an inference: nothing about an uploaded WebM says which audio it was synced to, and guessing
   * (by upload time, by filename, by "the latest hook") would manufacture exactly the mismatch the
   * cache exists to prevent — invisibly. The server re-resolves both ids and the storage key.
   */
  const associate = async () => {
    if (!value.presenterId || !value.audioVoiceClipId) return
    setAssociateErr(null)
    setAssociating(true)
    try {
      const res = await fetch("/api/admin/social-autopilot/presenters/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // IDS ONLY. The server reads the presenter's own clip path; the browser never names a
        // storage key, so it cannot point a match at a different object.
        body: JSON.stringify({ presenterId: value.presenterId, voiceClipId: value.audioVoiceClipId }),
      })
      const j = (await res.json().catch(() => ({}))) as { clip?: unknown; error?: string; detail?: string }
      if (!res.ok || !j.clip) throw new Error(j.detail ?? j.error ?? "Could not save the match.")
      // Re-ask the server rather than assuming: the displayed state and the state a render would
      // use then come from the same computation.
      setClipState(null)
      const q = new URLSearchParams({ presenterId: value.presenterId, voiceClipId: value.audioVoiceClipId })
      const after = await fetch(`/api/admin/social-autopilot/presenters/clips?${q.toString()}`)
      if (after.ok) setClipState(((await after.json()) as { state?: ClipMatchState }).state ?? null)
    } catch (e) {
      setAssociateErr((e as Error).message.slice(0, 240))
    } finally {
      setAssociating(false)
    }
  }

  const side: PresenterSide = normalizeSide(value.side)
  const widthPx = clampWidthPx(value.widthPx)
  const introSeconds = clampIntroSeconds(value.introSeconds)
  const wrap = disabled ? "opacity-45 pointer-events-none" : ""
  // One shared sub-label style: the rows only read as rows if every caption above them matches.
  const subLabel = "block truncate text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)]"

  return (
    <div className="block" title={disabled ? disabledHint : undefined} aria-disabled={disabled || undefined}>
      <div className={`flex items-center justify-between ${wrap}`}>
        <span className="text-[11px] uppercase tracking-wide font-semibold text-[var(--crm-text-secondary)]">
          AI Presenter
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="AI Presenter"
          onClick={() => void toggle()}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-[var(--crm-border)]"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
        </button>
      </div>

      {!on ? (
        <p className="mt-1 text-[11px] text-[var(--crm-text-muted)]">Off</p>
      ) : (
        <div className={`mt-2 flex flex-col gap-2 ${wrap}`}>
          {loadErr && <p className="text-[11px] text-red-400">{loadErr}</p>}
          {uploadErr && <p className="text-[11px] text-red-400">{uploadErr}</p>}

          {/* ROW 1 — who speaks, and with what voice. */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              {/* The upload sits ON the Presenter caption rather than in a row of its own: it is
                  the same decision as "which presenter", just the first time you make it. */}
              <span className="flex items-baseline justify-between gap-2">
                <span className={subLabel}>Presenter</span>
                <span
                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${uploading ? "text-[var(--crm-text-muted)]" : "cursor-pointer text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"}`}
                  title={`Upload a transparent avatar clip (WebM or alpha MOV, up to ${PRESENTER_UPLOAD.maxBytes / (1024 * 1024)} MB)`}
                >
                  {uploading ? "Checking…" : (
                    <label className="cursor-pointer">
                      + Upload
                      <input
                        type="file"
                        accept={PRESENTER_UPLOAD.acceptAttribute}
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          e.currentTarget.value = ""
                          if (f) void upload(f)
                        }}
                      />
                    </label>
                  )}
                </span>
              </span>
              <select
                className={controlClassName}
                value={value.presenterId ?? ""}
                onChange={(e) => {
                  const pick = (options ?? []).find((o) => o.id === e.target.value)
                  patch({ presenterId: e.target.value || null, introSeconds: pick ? clampIntroSeconds(pick.defaultIntroSeconds) : introSeconds })
                }}
              >
                {options === null && <option value={value.presenterId ?? ""}>Loading…</option>}
                {(options ?? []).map((o) => (
                  <option key={o.id} value={o.id} disabled={!o.hasClip}>
                    {o.label}{o.isSample ? " (sample)" : ""}{o.hasClip ? "" : " — no clip"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block min-w-0">
              <span className={subLabel}>Narration</span>
              <select
                className={controlClassName}
                value={value.audioVoiceClipId ?? ""}
                onChange={(e) => patch({ audioVoiceClipId: e.target.value || null })}
              >
                <option value="">Own voice</option>
                {voiceClips.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>

          {/* ROW 2 — where it stands and how long it speaks. */}
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className={subLabel}>Corner</span>
              <select
                className={controlClassName}
                value={side}
                onChange={(e) => patch({ side: e.target.value === "right" ? "right" : null })}
              >
                <option value="left">Lower left</option>
                <option value="right">Lower right</option>
              </select>
            </label>
            <label className="block min-w-0">
              <span className={subLabel}>Intro · {introSeconds.toFixed(1)}s</span>
              <input
                type="range" className="mt-2 w-full"
                min={PRESENTER.minIntroSeconds} max={PRESENTER.maxIntroSeconds} step={0.5}
                value={introSeconds}
                onChange={(e) => patch({ introSeconds: clampIntroSeconds(Number(e.target.value)) })}
              />
            </label>
          </div>

          {/* ROW 3 — size, full width: it is the control most worth dragging precisely. */}
          <label className="block">
            <span className={subLabel}>Size · {widthPx}px{widthPx === PRESENTER.widthPx ? " (default)" : ""}</span>
            <input
              type="range" className="mt-1.5 w-full"
              min={PRESENTER.minWidthPx} max={PRESENTER.maxWidthPx} step={20}
              value={widthPx}
              // Storing NULL at the default keeps presenterSpec the single definition of "default",
              // so a future change to it reaches this post instead of being overridden by a copy.
              onChange={(e) => {
                const px = clampWidthPx(Number(e.target.value))
                patch({ widthPx: px === PRESENTER.widthPx ? null : px })
              }}
            />
          </label>

          {/* ── LIP-SYNC MATCH STATE ──────────────────────────────────────────────────────────
              Said out loud, because the failure it describes is invisible in the editor: the
              avatar renders and plays, its mouth just does not match the words. `matched` is the
              only state that is safe, so it is the only one styled as reassurance. */}
          {matching ? (
            <p className="text-[10.5px] text-[var(--crm-text-muted)]">Checking for a matching avatar clip…</p>
          ) : clipState ? (
            <p
              className={`text-[10.5px] ${
                isLipSyncSafe(clipState) ? "text-emerald-500"
                  : clipState === "no_voice_selected" ? "text-[var(--crm-text-muted)]"
                  : clipState === "pending" ? "text-sky-500"
                  : "text-amber-500"
              }`}
            >
              {CLIP_STATE_MESSAGE[clipState]}
            </p>
          ) : null}

          {/* Associating a clip is only offered when there is something to associate it WITH and
              nothing already matched — an operator should not be invited to re-state a fact the
              cache already holds. */}
          {!matching && (clipState === "unmatched" || clipState === "unavailable") && value.audioVoiceClipId && (
            <button
              type="button"
              disabled={associating}
              onClick={() => void associate()}
              className="self-start rounded-md border border-[var(--crm-border)] px-2 py-1 text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] disabled:opacity-45"
              title="Record that this presenter's clip was lip-synced to the selected voice hook, so it is reused automatically next time"
            >
              {associating ? "Saving…" : "This clip matches this voice hook"}
            </button>
          )}
          {associateErr && <p className="text-[11px] text-red-400">{associateErr}</p>}

          <p className="text-[10.5px] text-[var(--crm-text-muted)]">Fades out after the intro.</p>
        </div>
      )}
    </div>
  )
}
