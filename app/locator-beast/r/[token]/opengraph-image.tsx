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
// Regenerate per request so the preview reflects the current share (agent photo/name/
// title, client city) and any scrim/layout updates rather than a stale cached image.
export const dynamic = "force-dynamic"
export const size = PREVIEW_SIZE
export const contentType = PREVIEW_CONTENT_TYPE
export const alt = "Your Custom List"

// The headline is `nowrap` inside a 1200px canvas with 80px of padding each side, so
// 1040px is the hard budget and anything wider is CROPPED, not wrapped. These two
// steps were measured by rendering through this same renderer and reading the ink
// bounding box back out of the pixels — not estimated from character metrics:
//
//   26 chars  "Michelangelo’s Custom List"     74px →  898px (86%)
//   25 chars  "Bartholomew’s Custom List"      74px →  904px (87%)
//   29 chars  "Alexandria-Rose’s Custom List"  74px →  996px (96%) ← too tight
//   29 chars  "Alexandria-Rose’s Custom List"  68px →  912px (88%)
//
// So 74px up to 26 characters, then step down. Both branches land near 87% of the
// budget, leaving real headroom for a name the measurements never saw.
const HEADLINE_PX = [
  { maxChars: 26, size: 74 },
  { maxChars: 30, size: 68 },
  { maxChars: Infinity, size: 62 },
]
// Same-colour outline = faux-bold. The bundled Satori face is Noto Sans REGULAR, its
// only weight, so `fontWeight` alone changes nothing (verified: 800 and 900 render
// pixel-identical). 2px adds 36% ink for 2px of width.
const HEADLINE_STROKE = 2

export function headlineSizeFor(headline: string): number {
  return (HEADLINE_PX.find((s) => headline.length <= s.maxChars) ?? HEADLINE_PX.at(-1)!).size
}

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let agentName = "Your Local Locator"
  let agentTitle = "Licensed Apartment Locator"
  let photoUrl: string | null = null
  let backgroundUrl: string | null = null
  let clientFirst: string | null = null
  if (looksLikeShareToken(token)) {
    try {
      const supabase = await createClient()
      const { data } = await supabase.rpc("lb_resolve_client_recommendations", { p_token_hash: hashShareToken(token) })
      const share = (Array.isArray(data) ? data[0] : data) as
        | { agent_name?: string | null; agent_photo_url?: string | null; agent_title?: string | null; client_city?: string | null; client_first_name?: string | null }
        | undefined
      if (share) {
        agentName = share.agent_name?.trim() || agentName
        agentTitle = share.agent_title?.trim() || agentTitle
        photoUrl = share.agent_photo_url?.trim() || null
        // FIRST NAME ONLY (never any other client data) — personalizes the headline.
        clientFirst = share.client_first_name?.trim() || null
        // Same hero the /r page renders: the client's SEARCH-city skyline via the
        // canonical resolver (generic SKYLINE_PATH fallback — never an arbitrary path).
        backgroundUrl = clientHeroImage(share.client_city)
      }
    } catch {
      /* preview must never throw — fall through to the safe fallback background */
    }
  }

  // Client-focused headline, personalized by first name; generic fallback when absent.
  // Shorter than "…Custom Property List" so the NAME — the part that has to land in a
  // thumbnail-sized iMessage preview — gets the width, and can be set larger.
  const headline = clientFirst ? `${clientFirst}’s Custom List` : "Your Custom List"
  return renderPreviewImage({
    headline,
    agentName,
    agentTitle,
    backgroundUrl,
    photoUrl,
    headlineSize: headlineSizeFor(headline),
    headlineStrokeWidth: HEADLINE_STROKE,
  })
}
