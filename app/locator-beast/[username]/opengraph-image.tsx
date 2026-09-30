import { createClient } from "@/lib/supabase/server"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import { getHeroTheme } from "@/app/smart-lead-form/_lib/heroThemes"
import { PREVIEW_CONTENT_TYPE, PREVIEW_IDENTITY_EMPHASIS, PREVIEW_SIZE, renderPreviewImage } from "@/lib/og/previewImage"

// Per-agent link-preview image for the public Smart Form (locatorbeast.com/{username}).
// Uses the shared client-facing preview renderer (same design family as the /r
// Recommendations preview): the locator's OWN Smart Form theme background, a darker
// scrim, a circular headshot, the headline + agent identity, and subtle branding.
// Node runtime because the shared renderer uses sharp to decode the theme .webp.

export const runtime = "nodejs"
// Regenerate per request so the preview reflects the agent's current theme, photo,
// and title (and any scrim/layout updates) rather than a stale cached image.
export const dynamic = "force-dynamic"
export const size = PREVIEW_SIZE
export const contentType = PREVIEW_CONTENT_TYPE
const HEADLINE = "Start Your Apartment Search"
export const alt = HEADLINE

export default async function OgImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params

  let agentName = "Your Local Locator"
  let agentTitle = "Licensed Apartment Locator"
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
      // Agent's configured title (e.g. "Licensed Apartment Locator"); falls back to that.
      agentTitle = (cfg?.copy?.agentTitle ?? "").trim() || agentTitle
    }
  } catch {
    /* preview must never throw — fall through to the safe fallback background */
  }

  return renderPreviewImage({
    headline: HEADLINE,
    agentName,
    agentTitle,
    backgroundUrl,
    photoUrl,
    // Same headline treatment as the recommendation preview, for the same reason:
    // an iMessage bubble renders this image around 300px wide, a quarter scale at
    // which the old 62px thin headline barely read. 74px + a 2px same-colour stroke
    // is the pairing already proven there.
    //
    // The stroke is the only way to add weight: the bundled Satori face is
    // noto-sans-v27-latin-REGULAR, its only weight, so fontWeight alone is inert.
    //
    // 74px measured through this renderer: "Start Your Apartment Search" occupies
    // 950px of the 1040px budget (91%), so it stays on ONE line with 90px to spare.
    // Deliberately NOT the /r size ladder — that is calibrated for "…'s Custom List"
    // strings; this headline is fixed, so its size is measured once, here.
    headlineSize: 74,
    headlineStrokeWidth: 2,
    // The SAME identity preset the recommendation preview uses — spread from one
    // definition rather than three copied numbers, so the two cannot drift apart.
    ...PREVIEW_IDENTITY_EMPHASIS,
  })
}
