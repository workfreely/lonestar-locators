"use client"

import { DELIVERY_SIZE } from "@/lib/social/deliverySize"

// Flags a source clip that is SMALLER than the 1080×1920 delivery canvas.
//
// The practical source library is TikTok-downloaded files, which the platform has already
// re-encoded and usually downscaled. Those are the masters we have and they render normally — this
// is INFORMATIONAL ONLY and never blocks anything. It exists so a soft-looking render is
// immediately attributable to the source rather than to the renderer, which is otherwise an
// expensive thing to re-diagnose each time.
//
// Dimensions are read from a <video> element's own metadata rather than stored on the row: it
// needs no column, no backfill, and no upload-time probe, and it is exact for the file actually
// being shown.
//
// THEY ARE NOW PASSED IN. This used to mount its OWN hidden 1px <video> on the same signed URL as
// the editor's visible player, purely to read videoWidth/videoHeight. Measured, that cost one
// extra network request on every open — consistently, every run, every clip (1→2 warm; 3→5 cold on
// a 4K master). The visible player already fires loadedmetadata with the identical values (verified
// side by side: 720x1280 and 2160x3840 from both elements), so the second element was fetching the
// same file to learn something the page already knew.
//
// Accuracy is unchanged because the SOURCE of the numbers is unchanged — the same metadata, from
// the same file, just read once instead of twice. The badge still renders nothing until dimensions
// are known, and its markup, copy and styling are untouched.
export default function SourceQualityBadge({ dims, className = "" }: { dims: { w: number; h: number } | null; className?: string }) {
  const below = dims !== null && (dims.w < DELIVERY_SIZE.w || dims.h < DELIVERY_SIZE.h)

  return (
    <>
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
