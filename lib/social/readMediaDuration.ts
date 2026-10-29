/**
 * HOW LONG IS THIS FILE? — asked of the browser, about a file it already holds.
 *
 * The only moment a media length is free is while the file is still in the page: the element
 * reads its own metadata off an object URL and nothing is fetched. Afterwards it costs a request
 * per file, which is why the library grid paints a ~25KB JPEG instead of mounting 140 players.
 *
 * Its own module with no imports, because both the Social Beast uploader (video) and the voice
 * clip uploader (audio) need exactly this, and two copies of it would eventually disagree about
 * rounding.
 *
 * Returns one decimal, or null when the browser cannot decode the file — null is a real answer
 * here and means "unknown", never zero.
 */
export function readMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const el = document.createElement(file.type.startsWith("audio/") ? "audio" : "video")
      el.preload = "metadata"
      const done = (v: number | null) => { URL.revokeObjectURL(el.src); resolve(v) }
      el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 10) / 10 : null)
      el.onerror = () => done(null)
      el.src = URL.createObjectURL(file)
    } catch { resolve(null) }
  })
}
