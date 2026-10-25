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
