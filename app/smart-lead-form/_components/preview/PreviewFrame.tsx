"use client"

import { useLayoutEffect, useRef, useState } from "react"

// ONE preview, not two. Agents configure a single responsive Smart Lead Form, so
// a Desktop/Mobile toggle asked them to maintain a distinction the product does
// not have — and the phone mockup hid most of the form behind a 405px column.
//
// This is the EXISTING desktop preview, unchanged in proportion and internal
// layout: same 960px content width, same chrome bar. The only addition is a
// uniform CSS transform that scales the whole frame down, so a hero with 4–5
// Service Areas fits without the agent scrolling to judge it.
//
// Why `transform: scale` and not smaller widths: scaling is uniform and purely
// visual, so the form still lays out at its true 960px and remains an accurate
// picture of the real page. Narrowing the container would instead trip the
// form's own responsive breakpoints and show a layout the public page never
// renders at that size. Nothing inside SmartLeadForm changes — no font sizes,
// no spacing, no component layout, and the public form is untouched.
//
// Height is MEASURED, never assumed. The frame used to declare a fixed 760px
// and nest the form inside its own 715px scroller, which cropped a page
// thousands of pixels tall into a short window — a second vertical scrollbar
// inside a pane that already scrolls. The frame now takes the form's real
// height, so the editor's preview pane is the single scroll container.

const CONTENT_W = 960
/**
 * First-paint seed for the measured height, so the frame does not pop in from
 * zero before the observer below reports. It is NOT a cap: `contentH` replaces
 * it in the same layout pass, and nothing clamps the frame to it.
 */
const CONTENT_H = 760
/** Preferred scale. The preview is NEVER drawn larger than this. */
const MAX_SCALE = 0.82
/** Floor, so a very narrow pane shrinks the preview rather than erasing it. */
const MIN_SCALE = 0.45
/** Breathing room kept on each side, on top of the pane's own padding. */
const SIDE_MARGIN = 24

/** Widest scale (never above MAX_SCALE) that fits 960px plus both margins. */
export function scaleForWidth(available: number): number {
  if (!Number.isFinite(available) || available <= 0) return MAX_SCALE
  const usable = available - SIDE_MARGIN * 2
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, usable / CONTENT_W))
}

export default function PreviewFrame({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(MAX_SCALE)
  const [contentH, setContentH] = useState(CONTENT_H)

  // Measured from the pane itself rather than a media query, because the pane's
  // width depends on the fixed 560px settings column, not on the viewport alone.
  // useLayoutEffect + ResizeObserver means the first measurement lands before
  // paint, so a narrow editor never shows an oversized frame for a frame or two.
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const apply = () => setScale(scaleForWidth(host.clientWidth))
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  // The frame has no height of its own any more, so it lays out at the form's
  // natural length and offsetHeight is that length UNSCALED — CSS transforms do
  // not affect offsetHeight, which is exactly why it is the right input here
  // (multiplying by `scale` ourselves is what keeps painted and reserved equal).
  //
  // No feedback loop: the wrapper's height is an output we write, while the
  // frame's height is auto and driven only by its content, so measuring the
  // frame can never read back the number we just set.
  //
  // Observing the frame — not `children` — means a section toggled on or off,
  // a swapped hero, a longer FAQ, or an image that finishes decoding all
  // re-report on their own.
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const ro = new ResizeObserver(() => setContentH(frame.offsetHeight))
    ro.observe(frame)
    return () => ro.disconnect()
  }, [])

  // Deliberately no dependency array: this re-measures after EVERY render.
  //
  // The observer alone is not enough, and the failure is not subtle. At mount
  // the frame holds PreviewSkeleton (~749px); the real form arrives a beat
  // later at ~3500px. If that correction is missed the wrapper reserves a
  // sliver, and the form overlaps whatever follows it — so the one measurement
  // that matters most is the one React itself triggers, not the observer.
  //
  // React renders are in fact the FIRST signal for everything the agent does:
  // the config loading, a section toggled on or off, a longer FAQ. The observer
  // above is kept for the changes React never sees — an image finishing decode,
  // a webfont swapping in — where no render accompanies the reflow.
  //
  // This cannot loop: setContentH bails out when the height is unchanged, so a
  // render that does not move the frame schedules nothing.
  useLayoutEffect(() => {
    const frame = frameRef.current
    if (frame) setContentH(frame.offsetHeight)
  })

  return (
    // Full-width measuring host. It centres the frame itself, so centring no
    // longer depends on the parent and holds at every scale.
    //
    // `min-w-0` is essential. As a flex item this host defaults to
    // min-width:auto, which lets it grow to its CONTENT width — the very box
    // whose size we are computing. Measuring that produced two bugs at once: the
    // available width read as 787px instead of 656px (so the pane never appeared
    // narrow and the scale stayed at 0.82), and the measurement fed back into
    // itself. min-w-0 pins the host to the space the pane actually offers, so
    // clientWidth is an input, never an echo of the output.
    <div ref={hostRef} className="flex w-full min-w-0 justify-center">
      {/* The wrapper reserves the SCALED footprint. A transform does not affect
          layout, so without this the parent would still reserve the full unscaled
          size — and with a measured height, that gap would now be thousands of
          pixels rather than a few hundred.

          transformOrigin MUST be "top left", not "top center". With a centre
          origin the 960px box scales about its own midpoint, so the painted
          result lands 86px right of the wrapper — dead space on the left and
          spill into the settings divider on the right. Anchoring at the left
          corner makes painted width equal reserved width, which is what lets the
          flex centring above actually centre it. A top-left origin is also what
          keeps the vertical maths honest: the frame grows downward from a fixed
          top edge, so reserved height is simply contentH * scale. */}
      <div style={{ width: CONTENT_W * scale, height: contentH * scale }} className="shrink-0">
        <div
          ref={frameRef}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            width: CONTENT_W,
          }}
          // overflow-hidden stays for the rounded corners and the chrome bar's
          // top edge only. It no longer crops the form: the frame is as tall as
          // its content, so there is nothing outside the box to clip.
          className="overflow-hidden rounded-2xl border border-[#e2e4ea] bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)]"
        >
          <div className="flex items-center gap-1.5 border-b border-[#e2e4ea] bg-[#f7f8fa] px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          {/* No inner scroller. The editor's preview pane scrolls the whole
              frame, so the agent reads the form top-to-footer in one motion. */}
          {children}
        </div>
      </div>
    </div>
  )
}
