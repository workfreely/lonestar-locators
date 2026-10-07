"use client"

import { useState } from "react"
import { DELIVERY_SIZE } from "@/lib/social/deliverySize"

// Flags a source clip that is SMALLER than the 1080×1920 delivery canvas.
//
// The practical source library is TikTok-downloaded files, which the platform has already
// re-encoded and usually downscaled. Those are the masters we have and they render normally — this
// is INFORMATIONAL ONLY and never blocks anything. It exists so a soft-looking render is
// immediately attributable to the source rather than to the renderer, which is otherwise an
// expensive thing to re-diagnose each time.
//
// Dimensions are read from the <video> element's own metadata rather than stored on the row: it
// needs no column, no backfill, and no upload-time probe, and it is exact for the file actually
// being shown.
export default function SourceQualityBadge({ videoUrl, className = "" }: { videoUrl: string; className?: string }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  const below = dims !== null && (dims.w < DELIVERY_SIZE.w || dims.h < DELIVERY_SIZE.h)

  return (
    <>
      {/* A metadata-only load: no poster, no playback, no bandwidth beyond the header. */}
      <video
        src={videoUrl}
        preload="metadata"
        muted
        playsInline
        aria-hidden
        className="pointer-events-none absolute h-px w-px opacity-0"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          if (v.videoWidth > 0 && v.videoHeight > 0) setDims({ w: v.videoWidth, h: v.videoHeight })
        }}
      />
      {below && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border border-[#e3d6b0] bg-[#fbf6e7] px-2 py-0.5 text-[11px] font-medium text-[#7a6320] ${className}`}
          title={`Source is ${dims!.w}×${dims!.h}, below the ${DELIVERY_SIZE.w}×${DELIVERY_SIZE.h} delivery size. It was already compressed by the platform it came from, so the render upscales it — detail cannot be recovered. This does not block rendering.`}
        >
          {dims!.w}×{dims!.h} source
        </span>
      )}
    </>
  )
}
