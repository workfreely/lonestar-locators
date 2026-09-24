import { createClient } from "@/lib/supabase/server"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import { getHeroTheme } from "@/app/smart-lead-form/_lib/heroThemes"
import { PREVIEW_CONTENT_TYPE, PREVIEW_SIZE, renderPreviewImage } from "@/lib/og/previewImage"

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
export const alt = "Start Your Apartment Search"

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

  return renderPreviewImage({ headline: "Start Your Apartment Search", agentName, agentTitle, backgroundUrl, photoUrl })
}
