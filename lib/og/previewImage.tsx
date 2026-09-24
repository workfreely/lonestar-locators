import { ImageResponse } from "next/og"
import sharp from "sharp"
import fs from "node:fs/promises"
import path from "node:path"

// Shared renderer for the client-facing OG / link-preview images so the Smart Form
// preview and the Recommendations preview are literally the SAME design family:
// the page's own theme/hero background (webp-safe via sharp), a darker left-weighted
// scrim, a small circular agent headshot on the left, the headline + agent identity
// (name + title), and subtle Locator Beast branding. Only the headline differs.
//
// Node runtime only (sharp decodes the theme .webp — Satori's <img> cannot).

export const PREVIEW_SIZE = { width: 1200, height: 630 }
export const PREVIEW_CONTENT_TYPE = "image/png"

// Safe fallback theme asset (an existing bundled theme) — never invent a new visual.
const FALLBACK_THEME_FILE = "public/themes/texas/austin.webp"

// Decode any source (webp/jpg/png, local /public path or remote URL) → a cover-cropped
// PNG data URL at the preview box, so Satori can render it. Falls back to the bundled
// theme, then flat navy, so a preview is never broken.
async function bgDataUrl(backgroundUrl: string | null): Promise<string> {
  const toPng = async (buf: Buffer) =>
    `data:image/png;base64,${(await sharp(buf).resize(PREVIEW_SIZE.width, PREVIEW_SIZE.height, { fit: "cover" }).png().toBuffer()).toString("base64")}`
  try {
    if (backgroundUrl && /^https?:\/\//i.test(backgroundUrl)) {
      const r = await fetch(backgroundUrl)
      if (!r.ok) throw new Error("bg fetch failed")
      return await toPng(Buffer.from(await r.arrayBuffer()))
    }
    const rel = backgroundUrl && backgroundUrl.startsWith("/") ? backgroundUrl : `/${FALLBACK_THEME_FILE.replace(/^public\//, "")}`
    return await toPng(await fs.readFile(path.join(process.cwd(), "public", rel)))
  } catch {
    try {
      return await toPng(await fs.readFile(path.join(process.cwd(), FALLBACK_THEME_FILE)))
    } catch {
      const flat = await sharp({ create: { width: PREVIEW_SIZE.width, height: PREVIEW_SIZE.height, channels: 3, background: "#12233f" } }).png().toBuffer()
      return `data:image/png;base64,${flat.toString("base64")}`
    }
  }
}

// Circle-cropped headshot → PNG data URL, or null (caller shows an initials circle).
async function headshotDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const D = 260 // 2× the rendered 130px for crispness
    const circle = Buffer.from(`<svg width="${D}" height="${D}"><circle cx="${D / 2}" cy="${D / 2}" r="${D / 2}" fill="#fff"/></svg>`)
    const out = await sharp(Buffer.from(await r.arrayBuffer()))
      .resize(D, D, { fit: "cover" })
      .composite([{ input: circle, blend: "dest-in" }])
      .png()
      .toBuffer()
    return `data:image/png;base64,${out.toString("base64")}`
  } catch {
    return null
  }
}

export async function renderPreviewImage(opts: {
  headline: string
  agentName: string
  agentTitle: string
  backgroundUrl: string | null
  photoUrl: string | null
}): Promise<ImageResponse> {
  const [bg, headshot] = await Promise.all([bgDataUrl(opts.backgroundUrl), headshotDataUrl(opts.photoUrl)])
  const initial = (opts.agentName.trim().charAt(0) || "•").toUpperCase()

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bg} width={PREVIEW_SIZE.width} height={PREVIEW_SIZE.height} style={{ position: "absolute", inset: 0, objectFit: "cover" }} alt="" />
        {/* Uniform darkening across the whole theme image, then a stronger left-weighted
            scrim where the headshot + text sit — so both stand out more. */}
        {/* NOTE: Satori does not apply the `inset` shorthand — overlays MUST be sized with
            explicit width/height (top/left), or they render zero-sized and never darken. */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", background: "rgba(6,12,22,0.55)" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            display: "flex",
            background:
              "linear-gradient(90deg, rgba(6,12,22,0.92) 0%, rgba(6,12,22,0.82) 45%, rgba(6,12,22,0.55) 75%, rgba(6,12,22,0.28) 100%)",
          }}
        />
        {/* Foreground: the headshot + headline read as ONE horizontal row — the headline is
            centered against the MIDDLE of the photo (the row aligns to the fixed-height
            headshot wrapper). The agent identity is stacked directly UNDER the photo via
            absolute positioning, so it never shifts the headline's vertical alignment. */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 48, padding: "0 64px", height: "100%" }}>
          <div style={{ position: "relative", display: "flex", flexShrink: 0, width: 168, height: 168 }}>
            {headshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={headshot} width={168} height={168} style={{ borderRadius: 168, border: "6px solid rgba(255,255,255,0.92)" }} alt="" />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 168,
                  height: 168,
                  borderRadius: 168,
                  border: "6px solid rgba(255,255,255,0.92)",
                  background: "linear-gradient(135deg,#22406e,#16305a)",
                  color: "#fff",
                  fontSize: 76,
                  fontWeight: 800,
                }}
              >
                {initial}
              </div>
            )}
            {/* Agent identity — centered directly under the profile image (absolute, so it
                does not change where the headline centers). */}
            <div style={{ position: "absolute", top: 184, left: -60, width: 288, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", whiteSpace: "nowrap", fontSize: 28, fontWeight: 600, color: "#ffffff" }}>{opts.agentName}</div>
              <div style={{ display: "flex", whiteSpace: "nowrap", marginTop: 2, fontSize: 19, fontWeight: 500, color: "rgba(255,255,255,0.82)" }}>{opts.agentTitle}</div>
            </div>
          </div>
          <div style={{ display: "flex", whiteSpace: "nowrap", fontSize: 60, fontWeight: 800, color: "#ffffff", letterSpacing: -1.5, lineHeight: 1.04 }}>
            {opts.headline}
          </div>
        </div>
        {/* Subtle branding. */}
        <div style={{ position: "absolute", right: 44, bottom: 34, display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: 0.5, color: "rgba(255,255,255,0.62)" }}>
          Locator Beast
        </div>
      </div>
    ),
    { ...PREVIEW_SIZE },
  )
}
