import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"
import { clientHeroImage } from "@/lib/clientShare/heroImage"
import { PREVIEW_CONTENT_TYPE, PREVIEW_SIZE, renderPreviewImage } from "@/lib/og/previewImage"

// Link-preview image for the client Recommendations page (/r/{token}). Same design
// family as the Smart Form preview (shared renderer): the CLIENT's search-city theme
// skyline as the background (clientHeroImage — identical to the on-page hero), a darker
// scrim, the agent's circular headshot + identity, and subtle Locator Beast branding.
// Node runtime because the shared renderer uses sharp to decode the theme .webp.
//
// NO client data appears in the image (never the client's name) — only the headline
// and the agent's identity. Unknown/imageless cities fall back to the safe theme asset.

export const runtime = "nodejs"
export const size = PREVIEW_SIZE
export const contentType = PREVIEW_CONTENT_TYPE
export const alt = "Your Custom Property List"

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let agentName = "Your Local Locator"
  let agentTitle = "Licensed Apartment Locator"
  let photoUrl: string | null = null
  let backgroundUrl: string | null = null
  if (looksLikeShareToken(token)) {
    try {
      const supabase = await createClient()
      const { data } = await supabase.rpc("lb_resolve_client_recommendations", { p_token_hash: hashShareToken(token) })
      const share = (Array.isArray(data) ? data[0] : data) as
        | { agent_name?: string | null; agent_photo_url?: string | null; agent_title?: string | null; client_city?: string | null }
        | undefined
      if (share) {
        agentName = share.agent_name?.trim() || agentName
        agentTitle = share.agent_title?.trim() || agentTitle
        photoUrl = share.agent_photo_url?.trim() || null
        // Same hero the /r page renders: the client's SEARCH-city skyline via the
        // canonical resolver (generic SKYLINE_PATH fallback — never an arbitrary path).
        backgroundUrl = clientHeroImage(share.client_city)
      }
    } catch {
      /* preview must never throw — fall through to the safe fallback background */
    }
  }

  return renderPreviewImage({ headline: "Your Custom Property List", agentName, agentTitle, backgroundUrl, photoUrl })
}
