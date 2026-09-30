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
async function headshotDataUrl(url: string | null, decodePx: number): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const D = decodePx
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

// Default headline treatment = the Smart Form preview's existing one. Callers that
// need more emphasis opt in; omitting these renders the identical tree as before.
const HEADLINE_SIZE = 62
const HEADLINE_STROKE = 0
const PHOTO_SIZE = 132
const AGENT_NAME_SIZE = 27
const AGENT_TITLE_SIZE = 19

/**
 * The emphasised agent identity, sized for the THUMBNAIL rather than the 1200×630
 * file — an iMessage bubble renders this image around 300px wide, a quarter scale
 * at which the default 19px title came out at ~5px and could not be read.
 *
 * ONE definition, spread by every caller that wants it, so the previews cannot
 * drift apart by someone copying two of the three numbers. The title takes the
 * larger multiplier because it degrades first; the name is 1.7× rather than a
 * token bump because doubling the title while nudging the name put the job title
 * in LARGER type than the person.
 *
 *   photo 132 → 264 (2.0×) · name 27 → 46 (1.7×) · title 19 → 38 (2.0×)
 */
export const PREVIEW_IDENTITY_EMPHASIS = {
  photoSize: 264,
  agentNameSize: 46,
  agentTitleSize: 38,
} as const
// The historical decode for the default photo. Left exactly as it was rather than
// recomputed as 2×132: it would become 264, and a 4px change in the sharp resample
// alters the rendered headshot's pixels (measured: 0.6% of the image, max channel
// delta 22/255) — invisible, but it would still mean an untouched caller's preview
// was no longer byte-identical. A caller that asks for a bigger photo gets a
// correspondingly bigger decode instead of being upscaled from this one.
const DEFAULT_HEADSHOT_DECODE = 260

export async function renderPreviewImage(opts: {
  headline: string
  agentName: string
  agentTitle: string
  backgroundUrl: string | null
  photoUrl: string | null
  /** Headline px. Caller's responsibility to pick one its longest headline fits at. */
  headlineSize?: number
  /**
   * Faux-bold for the headline, in px of outline.
   *
   * The bundled Satori face is noto-sans-v27-latin-REGULAR — the only weight
   * available — so `fontWeight` on these elements is inert: 800 and 900 render
   * pixel-identical. A same-colour text stroke is therefore the only way to add
   * weight without vendoring a second font file, and it is nearly free in a
   * `nowrap` layout: measured at 74px, stroke 2 adds 36% ink for 2px of width.
   */
  headlineStrokeWidth?: number
  /**
   * Agent identity sizing — photo diameter, name px, title px.
   *
   * Separate knobs rather than one scale factor because they do NOT move
   * together: at link-preview thumbnail size the title is the first thing to
   * become unreadable, so it needs the largest multiplier, while the name is
   * already legible and only needs enough growth to stay proportionate.
   */
  photoSize?: number
  agentNameSize?: number
  agentTitleSize?: number
}): Promise<ImageResponse> {
  const photoSize = opts.photoSize ?? PHOTO_SIZE
  const agentNameSize = opts.agentNameSize ?? AGENT_NAME_SIZE
  const agentTitleSize = opts.agentTitleSize ?? AGENT_TITLE_SIZE
  const [bg, headshot] = await Promise.all([
    bgDataUrl(opts.backgroundUrl),
    headshotDataUrl(opts.photoUrl, opts.photoSize ? opts.photoSize * 2 : DEFAULT_HEADSHOT_DECODE),
  ])
  const initial = (opts.agentName.trim().charAt(0) || "•").toUpperCase()
  const headlineSize = opts.headlineSize ?? HEADLINE_SIZE
  const headlineStroke = opts.headlineStrokeWidth ?? HEADLINE_STROKE
  // The ring reads as a hairline if it stays 5px on a photo twice the size, so it
  // scales with the diameter (132 → 5, keeping the default render identical).
  const photoBorder = Math.max(5, Math.round(photoSize / 26.4))

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bg} width={PREVIEW_SIZE.width} height={PREVIEW_SIZE.height} style={{ position: "absolute", inset: 0, objectFit: "cover" }} alt="" />
        {/* Uniform darkening across the whole theme image, then a stronger left-weighted
            scrim where the headshot + text sit — so both stand out more. */}
        {/* Single uniform black scrim so the darkness is one explicit opacity value.
            NOTE: Satori does not apply the `inset` shorthand — the overlay MUST be sized
            with explicit width/height (top/left) or it renders zero-sized and never darkens. */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", background: "rgba(0,0,0,0.35)" }} />
        {/* Foreground — CENTERED, client-focused composition: a medium agent headshot at the
            upper-middle, the agent identity (name + title) directly beneath it as the
            SECONDARY element, breathing room, then the large personalized headline as the
            dominant focal point. */}
        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", padding: "0 80px" }}>
          {headshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headshot} width={photoSize} height={photoSize} style={{ borderRadius: photoSize, border: `${photoBorder}px solid rgba(255,255,255,0.92)` }} alt="" />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: photoSize,
                height: photoSize,
                borderRadius: photoSize,
                border: `${photoBorder}px solid rgba(255,255,255,0.92)`,
                background: "linear-gradient(135deg,#22406e,#16305a)",
                color: "#fff",
                // The initial keeps its proportion within the circle (132 → 60).
                fontSize: Math.round(photoSize * (60 / 132)),
                fontWeight: 800,
              }}
            >
              {initial}
            </div>
          )}
          {/* Agent identity — secondary. */}
          <div style={{ display: "flex", whiteSpace: "nowrap", marginTop: 16, fontSize: agentNameSize, fontWeight: 600, color: "#ffffff" }}>{opts.agentName}</div>
          <div style={{ display: "flex", whiteSpace: "nowrap", marginTop: 2, fontSize: agentTitleSize, fontWeight: 500, color: "rgba(255,255,255,0.82)" }}>{opts.agentTitle}</div>
          {/* Personalized headline — the largest, most prominent element (with breathing room). */}
          <div
            style={{
              display: "flex",
              whiteSpace: "nowrap",
              marginTop: 44,
              fontSize: headlineSize,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: -1.5,
              lineHeight: 1.04,
              ...(headlineStroke > 0
                ? { WebkitTextStrokeWidth: headlineStroke, WebkitTextStrokeColor: "#ffffff" }
                : null),
            }}
          >
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
