"use client"

import { presenterPreviewFractions, clampWidthPx } from "@/lib/social/presenterSpec"

/**
 * Where the AI Presenter will land, drawn over the editor's video preview.
 *
 * An APPROXIMATION of placement, not of the avatar — the real clip is generated at render time, so
 * this shows the box it will occupy rather than pretending to show a person. Same honesty as the
 * CSS text overlay, which approximates the burned-in type.
 *
 * ── PARITY ──────────────────────────────────────────────────────────────────────────────────
 * Every number comes from presenterPreviewFractions(), which divides the RENDERER'S OWN canvas
 * units by the canvas. There is no second geometry here to drift: change the spec and both the
 * MP4 and this box move together. That is the rule the overlay work established after a
 * hand-rolled second copy silently defeated a correct fix for a release.
 *
 * The aspect ratio is the one unavoidable guess — the avatar's height depends on the clip, which
 * does not exist yet. 3:4 is typical of a waist-up framing, and because the renderer anchors by
 * the BOTTOM edge, a wrong guess moves only the top of this box, never its footing.
 */
const WAIST_UP_ASPECT = 4 / 3 // height / width

export default function PresenterPreviewBox({
  side,
  widthPx,
  platform = "instagram",
}: {
  side?: string | null
  widthPx?: number | null
  platform?: string
}) {
  const { leftFrac, widthFrac, bottomFrac } = presenterPreviewFractions({ side, widthPx, platform })
  // Height as a fraction of the CANVAS, derived from the width fraction and the canvas aspect
  // (1080x1920 ⇒ 9:16), so the box keeps a plausible figure shape at any preview size.
  const heightFrac = widthFrac * WAIST_UP_ASPECT * (1080 / 1920)

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute rounded-lg border-2 border-dashed border-emerald-400/70 bg-emerald-400/10"
      style={{
        left: `${leftFrac * 100}%`,
        width: `${widthFrac * 100}%`,
        bottom: `${bottomFrac * 100}%`,
        height: `${heightFrac * 100}%`,
      }}
    >
      <span className="absolute inset-x-0 bottom-1 text-center text-[9px] font-semibold uppercase tracking-wide text-emerald-200 drop-shadow">
        Presenter {clampWidthPx(widthPx)}px
      </span>
    </div>
  )
}
