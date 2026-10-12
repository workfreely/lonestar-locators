// VIDEO LIBRARY THUMBNAILS — the one definition of what a library preview IS.
//
// The grid used to draw its poster by mounting a <video> per card and seeking it to 0.6s, which
// decodes real media for every tile. This replaces that with a small JPEG so the grid never
// touches video to draw itself.
//
// ── THIS IS NOT A SOCIAL COVER ───────────────────────────────────────────────────────────────
// social_posts.cover_storage_path is the Instagram Reel / TikTok cover an operator CHOOSES for a
// published post. This is an internal admin preview. They live in different tables, at different
// paths, are produced by different code, and nothing here is ever published. The separation is
// asserted in scripts/social/libraryThumb.test.ts, not merely intended.
//
// ── IT NEVER TOUCHES THE ORIGINAL ────────────────────────────────────────────────────────────
// A thumbnail is a NEW object beside the source — <owner>/<id>/thumb.jpg next to
// <owner>/<id>/source.<ext>. Nothing renames, re-encodes, replaces or deletes an original, and a
// missing thumbnail is a normal state the UI falls back from.

/** The frame we want: far enough in to clear a black first frame, early enough to be cheap. */
export const THUMB_SEEK_SECONDS = 0.6
/** Longest side, in pixels. The grid tile is ~200px wide, so this is comfortably retina. */
export const THUMB_MAX_PX = 640
export const THUMB_QUALITY = 0.72
export const THUMB_CONTENT_TYPE = "image/jpeg"

/** The ONLY path a library thumbnail may occupy. Derived, never accepted from a caller — which is
 *  what stops this column from ever being pointed at a source video or a social cover. */
export function thumbStoragePath(ownerUserId: string, contentId: string): string {
  return `${ownerUserId}/${contentId}/thumb.jpg`
}

/** Is this exactly the canonical thumbnail path for that owner + content row? */
export function isThumbStoragePath(path: string | null | undefined, ownerUserId: string, contentId: string): boolean {
  return !!path && path === thumbStoragePath(ownerUserId, contentId)
}

/** Fit (w,h) inside a THUMB_MAX_PX box, preserving aspect. Portrait clips stay portrait, so the
 *  grid's object-cover crops exactly as it did when the tile held a video. */
export function thumbSize(w: number, h: number, max = THUMB_MAX_PX): { w: number; h: number } {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { w: max, h: max }
  const s = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

/**
 * Capture one JPEG frame in the BROWSER, from a local File (new upload) or a URL.
 *
 * Returns null rather than throwing on ANY failure — an unseekable clip, a codec the browser
 * cannot decode, a tainted canvas, a missing object. The caller treats null as "no thumbnail",
 * which is a supported state: the upload still succeeded and the grid still works.
 */
export async function captureLibraryThumb(source: File | string): Promise<Blob | null> {
  if (typeof document === "undefined") return null
  const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source)
  const src = objectUrl ?? (source as string)
  const v = document.createElement("video")
  v.muted = true
  v.playsInline = true
  v.preload = "metadata"
  // Needed for a cross-origin signed URL, or the canvas is tainted and toBlob throws.
  if (!objectUrl) v.crossOrigin = "anonymous"
  v.src = src
  try {
    return await new Promise<Blob | null>((resolve) => {
      // Never hang a caller: a clip that will not decode resolves null like any other failure.
      const timer = setTimeout(() => finish(null), 20_000)
      let settled = false
      const finish = (b: Blob | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        v.removeAttribute("src")
        v.load()
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        resolve(b)
      }
      v.onerror = () => finish(null)
      v.onloadeddata = () => {
        try {
          v.currentTime = Math.min(THUMB_SEEK_SECONDS, (Number.isFinite(v.duration) ? v.duration : 2) / 2)
        } catch {
          finish(null)
        }
      }
      v.onseeked = () => {
        try {
          const { w, h } = thumbSize(v.videoWidth, v.videoHeight)
          const c = document.createElement("canvas")
          c.width = w
          c.height = h
          const ctx = c.getContext("2d")
          if (!ctx) return finish(null)
          ctx.drawImage(v, 0, 0, w, h)
          c.toBlob((b) => finish(b), THUMB_CONTENT_TYPE, THUMB_QUALITY)
        } catch {
          finish(null)
        }
      }
    })
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    return null
  }
}
