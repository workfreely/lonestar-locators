import { ImageResponse } from "next/og"
import sharp from "sharp"
import fs from "node:fs/promises"
import path from "node:path"
import { createClient } from "@/lib/supabase/server"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import { getHeroTheme } from "@/app/smart-lead-form/_lib/heroThemes"

// Per-agent link-preview image for the public Smart Form (locatorbeast.com/{username}).
// Image-first, minimal: the locator's OWN Smart Form theme background (inherited for
// visual consistency — never a separate generic apartment/city photo), a subtle dark
// scrim, a small circular agent headshot on the far left, and the text block
// "Start Your Apartment Search" / "with {Agent Name}", plus subtle Locator Beast branding.
//
// Runs on the Node runtime because it uses sharp to decode the theme .webp (Satori's
// <img> cannot read webp) and to circle-crop the headshot. Everything is public data.

export const runtime = "nodejs"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Start Your Apartment Search"

// Safe fallback theme asset (an existing bundled theme) when a form has no resolvable
// theme image — never invent a new visual.
const FALLBACK_THEME_FILE = "public/themes/texas/austin.webp"

// Decode any source (webp/jpg/png, local or remote) → a cover-cropped PNG data URL at the
// requested box, so Satori can render it. Falls back to the bundled theme on any failure.
async function bgDataUrl(backgroundUrl: string | null): Promise<string> {
  const toPng = async (buf: Buffer) =>
    `data:image/png;base64,${(await sharp(buf).resize(size.width, size.height, { fit: "cover" }).png().toBuffer()).toString("base64")}`
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
      // Absolute last resort: a flat navy, so the route never 500s and breaks previews.
      const flat = await sharp({ create: { width: size.width, height: size.height, channels: 3, background: "#12233f" } }).png().toBuffer()
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

export default async function OgImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params

  let agentName = "Your Local Locator"
  let photoUrl: string | null = null
  let backgroundUrl: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc("lb_resolve_public_form", { p_username: username })
    const form = (Array.isArray(data) ? data[0] : data) as
      | { agent_name?: string | null; photo_url?: string | null; form_config?: unknown }
      | undefined
    if (form) {
      agentName = form.agent_name?.trim() || agentName
      photoUrl = form.photo_url?.trim() || null
      // Same background resolution the public form's Hero uses: custom → heroImageUrl,
      // otherwise the built-in theme's bundled image.
      const cfg = form.form_config ? mergeSmartFormConfig(form.form_config) : null
      const heroTheme = cfg?.branding?.heroTheme ?? ""
      const heroImageUrl = cfg?.branding?.heroImageUrl ?? null
      backgroundUrl = heroTheme === "custom" ? heroImageUrl : getHeroTheme(heroTheme).defaultImageUrl
    }
  } catch {
    /* preview must never throw — fall through to the safe fallback background */
  }

  const [bg, headshot] = await Promise.all([bgDataUrl(backgroundUrl), headshotDataUrl(photoUrl)])
  const initial = (agentName.trim().charAt(0) || "•").toUpperCase()

  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bg} width={size.width} height={size.height} style={{ position: "absolute", inset: 0, objectFit: "cover" }} alt="" />
        {/* Uniform darkening across the whole theme image, then a stronger left-weighted
            scrim where the headshot + text sit — so both stand out more. */}
        <div style={{ position: "absolute", inset: 0, display: "flex", background: "rgba(6,12,22,0.32)" }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(90deg, rgba(6,12,22,0.94) 0%, rgba(6,12,22,0.78) 45%, rgba(6,12,22,0.40) 75%, rgba(6,12,22,0.12) 100%)",
          }}
        />
        {/* Foreground: far-left circular headshot + text block. */}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 44, padding: "0 84px", height: "100%" }}>
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
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", whiteSpace: "nowrap", fontSize: 54, fontWeight: 800, color: "#ffffff", letterSpacing: -1, lineHeight: 1.05 }}>
              Start Your Apartment Search
            </div>
            <div style={{ display: "flex", marginTop: 18, fontSize: 38, fontWeight: 500, color: "rgba(255,255,255,0.92)" }}>
              with {agentName}
            </div>
          </div>
        </div>
        {/* Subtle branding. */}
        <div style={{ position: "absolute", right: 44, bottom: 34, display: "flex", fontSize: 22, fontWeight: 600, letterSpacing: 0.5, color: "rgba(255,255,255,0.62)" }}>
          Locator Beast
        </div>
      </div>
    ),
    { ...size },
  )
}
