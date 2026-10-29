/**
 * DO A HOOK AND A CTA FIT IN ONE VIDEO WITHOUT TALKING OVER EACH OTHER?
 *
 * Its own module, with NO imports, because both sides of the app need this rule and they run in
 * different places: the renderer checks it on the server against a probed duration, and the
 * editor checks it in the browser against the duration the preview player already loaded.
 * renderVideo.ts cannot be the home for it — that module imports node:child_process, and pulling
 * it into a client component breaks the build.
 */

/**
 * The hook is anchored to the START and the CTA to the END (see computeVoiceWindows), so the only
 * thing that decides a collision is whether their combined length exceeds the video. On the real
 * 7.09s render that prompted this, a 4.0s hook and a 5.3s CTA played together for 2.2 seconds —
 * two voices at once, which no amount of ducking rescues.
 *
 * DELIBERATELY NO MINIMUM GAP. Requiring breathing room would newly refuse pairs that fit today
 * and play fine. The rule is only "they must not collide", so a pair that exactly fills the video
 * is a fit. Nothing is ever trimmed, sped up or shortened to make a pair fit: a pair that does
 * not fit is refused, and the person picks a shorter clip or longer footage.
 */
export function voiceClipsFit(
  videoDurationSeconds: number,
  hookDurationSeconds: number | null,
  ctaDurationSeconds: number | null,
): boolean {
  if (hookDurationSeconds === null || ctaDurationSeconds === null) return true  // one clip always fits
  if (!(videoDurationSeconds > 0)) return true                                  // unknown length decides nothing
  return hookDurationSeconds + ctaDurationSeconds <= videoDurationSeconds
}

/**
 * THE MIX NUMBERS, in the one module both the renderer and the browser can import.
 *
 * They used to live in renderVideo.ts, which imports node:child_process and therefore cannot be
 * pulled into a client bundle. renderVideo re-exports them, so every existing caller is unchanged.
 */
export const VOICE_MIX = { duckLevel: 0.2, rampSeconds: 0.25, sampleRate: 48000, channelLayout: "stereo" } as const

export type VoiceWindow = { startSeconds: number; endSeconds: number }

/**
 * Where each selected clip sits on the timeline. Hook is anchored at 0; CTA is anchored to the END
 * (`videoDuration - ctaDuration`, floored at 0). Both windows are clamped INTO the video, so a clip
 * longer than the footage plays as much of itself as fits rather than running past the last frame.
 */
export function computeVoiceWindows(videoDurationSeconds: number, hookDurationSeconds: number | null, ctaDurationSeconds: number | null): { hook: VoiceWindow | null; cta: VoiceWindow | null } {
  const D = Math.max(0, videoDurationSeconds)
  const hook = hookDurationSeconds === null ? null : { startSeconds: 0, endSeconds: Math.min(hookDurationSeconds, D) }
  const cta = ctaDurationSeconds === null ? null : { startSeconds: Math.max(0, D - ctaDurationSeconds), endSeconds: D }
  return { hook, cta }
}

/**
 * HOW LOUD THE MUSIC BED IS AT TIME t — the numeric twin of the ffmpeg volume expression.
 *
 * ffmpeg is handed a string (see duckVolumeExpr/envelopeExpr in renderVideo) and evaluates it per
 * sample; the browser has no such thing, so the same curve is computed here and written to the
 * player's volume. Identical shape by construction: ramp up over `rampSeconds` from the clip's
 * start, hold, then ramp down over `rampSeconds` ending `rampSeconds` AFTER the clip finishes —
 * the release that stops the bed jumping back the instant a sentence ends.
 *
 * 1 = untouched, 0.2 = fully ducked.
 */
export function duckGain(t: number, windows: (VoiceWindow | null)[]): number {
  const R = VOICE_MIX.rampSeconds
  const clip01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
  let env = 0
  for (const w of windows) {
    if (!w) continue
    env = Math.max(env, Math.min(clip01((t - w.startSeconds) / R), clip01((w.endSeconds + R - t) / R)))
  }
  return 1 - (1 - VOICE_MIX.duckLevel) * env
}
