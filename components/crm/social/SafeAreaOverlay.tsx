"use client"

import { safeAreaFor, SOCIAL_CANVAS } from "@/lib/social/platformSafeArea"

/**
 * SOCIAL BEAST — the platform safe-area guide, drawn over the editor preview.
 *
 * The preview has always been a faithful 9:16 of the 1080×1920 canvas, but a bare canvas does not
 * tell you that Instagram will put a column of buttons over the right edge and a caption block over
 * the bottom quarter. That is how a published Reel ended up with its headline against the icons.
 *
 * Everything here is positioned as a PERCENTAGE of the canvas, exactly like PreviewOverlay, so the
 * guide lines up with the burned-in result at any preview size. Presentational only: the fitter
 * reads the same safe area from lib/social/platformSafeArea, never from this component.
 */
export default function SafeAreaOverlay({ platform, show }: { platform: string; show: boolean }) {
  if (!show) return null
  const sa = safeAreaFor(platform)
  const pctX = (v: number) => `${(v / SOCIAL_CANVAS.w) * 100}%`
  const pctY = (v: number) => `${(v / SOCIAL_CANVAS.h) * 100}%`
  const tint: Record<string, string> = {
    rail: "rgba(239,68,68,0.28)",
    caption: "rgba(249,115,22,0.26)",
    header: "rgba(56,189,248,0.20)",
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-[5]" aria-hidden>
      {sa.zones.map((z) => (
        <div
          key={z.label}
          title={z.label}
          style={{
            position: "absolute",
            left: pctX(z.rect.x),
            top: pctY(z.rect.y),
            width: pctX(z.rect.w),
            height: pctY(z.rect.h),
            background: tint[z.kind],
          }}
        />
      ))}
      {/* The text-safe box itself — the exact rectangle the headline is fitted into. */}
      <div
        style={{
          position: "absolute",
          left: pctX(sa.text.x),
          top: pctY(sa.text.y),
          width: pctX(sa.text.w),
          height: pctY(sa.text.h),
          border: "1.5px solid rgba(34,197,94,0.95)",
          borderRadius: 2,
        }}
      />
      <div className="absolute left-1 bottom-1 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-black/65 text-white">
        {sa.label}
        {/* Say so when the numbers are estimates — the TikTok box is not measured yet. */}
        {!sa.measured && <span className="text-amber-300"> · provisional</span>}
      </div>
    </div>
  )
}
