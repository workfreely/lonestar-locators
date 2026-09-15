// Resolve an agent's optional thank-you video URL into a safe YouTube embed
// URL. Returns null for an empty value or any URL we don't recognize as
// YouTube, so the thank-you page can fall back to the agent card and never
// render a broken iframe. No autoplay; rel=0 keeps related videos to the same
// channel. YouTube is the only supported provider for now.
export function youtubeEmbedUrl(raw: string | null | undefined): string | null {
  const url = (raw ?? "").trim()
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?(?:[^#]*&)?v=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return `https://www.youtube.com/embed/${m[1]}?rel=0`
  }
  return null
}
