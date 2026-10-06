import Image from "next/image"
import type { SmartLeadFormConfig } from "../../../_lib/types"
import { AGENT_PHOTO_SIZES } from "../../../_lib/agentPhotoSizes"

// Just the photo/initials box — no positioning of its own. AgentProfile.tsx
// wraps this with a negative margin for the overlapping placement; Hero.tsx
// wraps it plainly for the under-headline placement.
//
// WHY next/image AND NOT A PLAIN <img>. The photo is a Supabase Storage object
// on a SECOND origin, and that — not its file size — was what made it appear
// late. Measured on production: the browser spent ~165ms on a fresh DNS + TCP +
// TLS handshake to *.supabase.co before the request was even sent, then pulled a
// 500×500 PNG (149KB) to fill a circle rendered at 96–208px. The hero background
// is BIGGER (240KB) yet appeared instantly purely because it is same-origin on a
// connection already open from the HTML fetch. Routing through next/image moves
// the photo to the Locator Beast origin (handshake gone), re-encodes it to
// AVIF/WebP at the size actually rendered, and lets Vercel cache the result
// immutably instead of Supabase's one-hour max-age.
//
// `priority` is correct here and not a micro-optimisation: this is the hero's
// above-the-fold focal point, so it must be eager + fetchPriority=high + preloaded
// rather than left to the browser's default low image priority.

/**
 * Can next/image's optimizer fetch this URL?
 *
 * A relative path is same-origin; remote hosts must match next.config.mjs
 * `images.remotePatterns`, which today is *.supabase.co (every uploaded avatar)
 * plus res.cloudinary.com. An unlisted host makes next/image THROW at render —
 * and this component sits on the public lead-capture form, where that would be a
 * 500 on the page the whole funnel depends on. So an unrecognised host degrades
 * to an unoptimized (plain) load instead: slower, but it still shows the photo.
 */
function canOptimize(url: string): boolean {
  if (url.startsWith("/")) return true
  try {
    const { hostname } = new URL(url)
    return hostname.endsWith(".supabase.co") || hostname === "res.cloudinary.com"
  } catch {
    return false
  }
}

export default function AgentPhoto({ config }: { config: SmartLeadFormConfig }) {
  const { agentPhotoUrl, agentPhotoSize } = config.branding
  const { agentName } = config.copy
  const size = AGENT_PHOTO_SIZES[agentPhotoSize]

  return (
    // `relative` is what lets the Image use `fill`; the box keeps its fixed
    // responsive height/width, so there is no layout shift while the photo loads.
    // The box itself is deliberately UNPAINTED — the old bg-[#f0f1f5] was the grey
    // disc that flashed before the photo arrived. It now belongs to the initials
    // fallback, which actually needs a surface; an empty photo box stays
    // transparent and simply shows the hero behind it.
    <div
      className={`relative ${size.boxClass} overflow-hidden rounded-full border-4 border-white shadow-[0_8px_24px_rgba(15,23,42,0.15)]`}
    >
      {agentPhotoUrl ? (
        <Image
          src={agentPhotoUrl}
          alt={agentName}
          fill
          sizes={size.sizes}
          priority
          // Stated explicitly rather than left to `priority`. `priority` reliably
          // emits the responsive <link rel=preload imagesrcset> and drops the lazy
          // attribute, but it did NOT stamp fetchpriority on the <img> itself here —
          // verified in the rendered DOM. A preloaded image usually gets high
          // priority anyway; this makes it a guarantee instead of a side effect.
          fetchPriority="high"
          unoptimized={!canOptimize(agentPhotoUrl)}
          className="object-cover"
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center bg-[#f0f1f5] font-semibold text-[#a1a8b8] ${size.initialsClass}`}
        >
          {agentName
            .split(" ")
            .map((n) => n[0])
            .join("")}
        </div>
      )}
    </div>
  )
}
