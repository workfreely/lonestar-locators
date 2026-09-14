import type { Metadata } from "next"

// SCOPED metadata for the Beast Social Instagram authorization link ONLY (/authorize/instagram/*).
// The link is texted to recipients, so its iMessage/social preview matters. With no route-level
// OG image, previews fell back to the site favicon (a small, washed-out mark on light backgrounds).
// This overrides ONLY this subtree with a clean title/description + the BLACK Locator Beast logo,
// which reads well on the light card iMessage renders. Absolute URL so the preview crawler resolves
// it without a global metadataBase. Does NOT affect global metadata or the apartment
// recommendation / client-share previews (which set their own opengraph-image).
const TITLE = "Connect your Instagram — Beast Social"
const DESCRIPTION = "You've been invited to connect an Instagram account for scheduled posting."
const OG_IMAGE = "https://locatorbeast.com/locator-beast/locator-beast-black-logo-transparent.png"

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    images: [{ url: OG_IMAGE, alt: "Locator Beast" }],
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
}

export default function AuthorizeInstagramLayout({ children }: { children: React.ReactNode }) {
  return children
}
