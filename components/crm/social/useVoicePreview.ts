"use client"

import { useEffect, useRef } from "react"
import { computeVoiceWindows, duckGain, VOICE_MIX, type VoiceWindow } from "@/lib/social/voiceFit"

/**
 * LIVE AUDIO PREVIEW — hear roughly what the render will sound like, before there is a render.
 *
 * It adds no player and no buttons. It attaches to the <video> that is already on screen and
 * follows it: play, pause, seek, rate, end. Two ordinary HTMLAudioElements hold the chosen Hook
 * and CTA; the hook is placed at the start and the CTA against the end, from the SAME
 * computeVoiceWindows the renderer uses, and the video's own volume is pulled down while either
 * one speaks using the SAME curve ffmpeg is handed.
 *
 * ── WHAT IT DOES NOT TOUCH ──────────────────────────────────────────────────────────────────
 * Nothing is uploaded, written, re-encoded or saved. The clips stream from the signed URLs the
 * library already hands the editor, and the video element is read, never re-sourced. Muting stays
 * the viewer's decision: this only ever writes `volume`, never `muted`, so a player that is muted
 * by default stays silent until a person unmutes it — exactly as before.
 *
 * ── WHERE IT DIFFERS FROM THE FINISHED FILE ─────────────────────────────────────────────────
 *  · No master pass. renderReel normalises the finished mix to −14 LUFS with a −1.5 dBTP ceiling;
 *    a browser cannot, so the preview is quieter and more dynamic than the real thing.
 *  · The duck is written on an animation frame, not per sample. The curve is identical, its
 *    resolution is ~60Hz instead of 48kHz. Inaudible on a 0.25s ramp, but it is an approximation.
 *  · Two sources arriving at the output device are not one limited stream: nothing here can clip
 *    the way a render can, and nothing protects against it either.
 *  · A presenter's narration is not previewed. The renderer mixes it; this does not.
 */
export type VoicePreviewInput = {
  /** The player already on screen. Null while nothing is mounted. */
  video: HTMLVideoElement | null
  hookUrl: string | null
  ctaUrl: string | null
  hookSeconds: number | null
  ctaSeconds: number | null
  /** False when Music is "No Music" — the BED is dropped, the voice is not. */
  playBed: boolean
  /** True when the two clips cannot both fit. The CTA is withheld rather than doubled onto the hook. */
  overlapping: boolean
}

export function useVoicePreview({ video, hookUrl, ctaUrl, hookSeconds, ctaSeconds, playBed, overlapping }: VoicePreviewInput) {
  // One element per URL, kept across renders so a re-render never restarts a clip mid-sentence.
  const hookRef = useRef<HTMLAudioElement | null>(null)
  const ctaRef = useRef<HTMLAudioElement | null>(null)
  const rafRef = useRef<number | null>(null)
  // Read inside the animation frame, so the loop never closes over a stale selection.
  const cfg = useRef({ hookSeconds, ctaSeconds, playBed, overlapping })
  cfg.current = { hookSeconds, ctaSeconds, playBed, overlapping }

  useEffect(() => {
    const make = (url: string | null, ref: React.MutableRefObject<HTMLAudioElement | null>) => {
      if (ref.current?.src === url) return
      ref.current?.pause()
      if (!url) { ref.current = null; return }
      const a = new Audio(url)
      a.preload = "auto"
      a.crossOrigin = "anonymous"
      ref.current = a
    }
    make(hookUrl, hookRef)
    make(ctaUrl, ctaRef)
  }, [hookUrl, ctaUrl])

  useEffect(() => {
    if (!video) return
    const hook = () => hookRef.current
    const cta = () => ctaRef.current

    /** Put one clip where it belongs for the current playhead, and only there. */
    const sync = (el: HTMLAudioElement | null, w: VoiceWindow | null, playing: boolean) => {
      if (!el) return
      const t = video.currentTime
      const inside = w !== null && t >= w.startSeconds && t < w.endSeconds
      if (!inside || !playing) {
        if (!el.paused) el.pause()
        return
      }
      const want = t - w!.startSeconds
      // Only correct when it has actually drifted: writing currentTime every frame is what makes
      // browser audio stutter.
      if (Math.abs(el.currentTime - want) > 0.08) el.currentTime = want
      if (el.playbackRate !== video.playbackRate) el.playbackRate = video.playbackRate
      if (el.paused) void el.play().catch(() => { /* a blocked autoplay is not an error worth showing */ })
    }

    const frame = () => {
      const { hookSeconds: h, ctaSeconds: c, playBed: bed, overlapping: over } = cfg.current
      const d = Number.isFinite(video.duration) ? video.duration : 0
      // THE RENDERER'S OWN PLACEMENT, not a second set of rules.
      const w = computeVoiceWindows(d, h, over ? null : c)
      const playing = !video.paused && !video.ended
      sync(hook(), w.hook, playing)
      sync(cta(), w.cta, playing)
      // "No Music" silences the bed and nothing else; otherwise duck it under whatever is speaking.
      video.volume = bed ? duckGain(video.currentTime, [w.hook, w.cta]) : 0
      rafRef.current = requestAnimationFrame(frame)
    }

    const start = () => { if (rafRef.current === null) rafRef.current = requestAnimationFrame(frame) }
    const stop = () => {
      if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      hook()?.pause()
      cta()?.pause()
      video.volume = 1
    }

    // One frame on mount puts the volume where it belongs before anyone presses anything.
    frame()
    video.addEventListener("play", start)
    video.addEventListener("playing", start)
    video.addEventListener("pause", stop)
    video.addEventListener("ended", stop)
    video.addEventListener("emptied", stop)
    return () => {
      video.removeEventListener("play", start)
      video.removeEventListener("playing", start)
      video.removeEventListener("pause", stop)
      video.removeEventListener("ended", stop)
      video.removeEventListener("emptied", stop)
      stop()
    }
  }, [video])
}

export const VOICE_PREVIEW_DUCK = VOICE_MIX.duckLevel
