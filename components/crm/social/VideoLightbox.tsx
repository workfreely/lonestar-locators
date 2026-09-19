"use client"

import { useEffect } from "react"
import type { ReactNode } from "react"

// SHARED enlarged 9:16 video preview (lightbox) — the ONE preview/player experience across Social
// Beast (Post Editor "Enlarge", History thumbnails). Extracted verbatim from the Post Editor's
// inline modal so the two can never drift and History does not grow a second video modal.
//
// Shows the vertical video at its true aspect (object-contain, never cropped/zoomed), sized to ~88vh
// (width derived 9:16), centered over a blurred dark backdrop. Closes via X, Escape, or backdrop
// click. `fixed` overlay → no page layout shift. Native fullscreen is disabled (controlsList) since
// it zoomed/cropped the vertical video.
//
// `overlay` is an optional absolutely-positioned layer rendered over the video — the Post Editor
// passes its pre-render text approximation (PreviewOverlay) there; History passes nothing because a
// published/rendered artifact already has its text burned in.
export default function VideoLightbox({
  src,
  onClose,
  overlay,
}: {
  src: string
  onClose: () => void
  overlay?: ReactNode
}) {
  // Close on Escape (backdrop click + X handled inline).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-8 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative overflow-hidden rounded-xl" style={{ height: "88vh", aspectRatio: "9 / 16", maxWidth: "calc(100vw - 2rem)" }} onClick={(e) => e.stopPropagation()}>
        <video src={src} controls autoPlay playsInline controlsList="nofullscreen" disablePictureInPicture className="w-full h-full object-contain rounded-xl bg-black" />
        {overlay}
        <button
          type="button"
          aria-label="Close preview"
          onClick={onClose}
          className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-white text-black shadow-lg flex items-center justify-center hover:bg-white/90"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  )
}
