import type { Metadata } from "next"

// SCOPED metadata for the Beast Social Instagram authorization link ONLY (/authorize/instagram/*).
// The link is texted to recipients, so its iMessage/social preview matters. With no route-level
// OG image, previews fell back to the site favicon (a small, washed-out mark on light backgrounds).
// This overrides ONLY this subtree with a clean title/description + the BLACK Locator Beast logo,
// which reads well on the light card iMessage renders. Absolute URL so the preview crawler resolves
// it without a global metadataBase. Does NOT affect global metadata or the apartment
// recommendation / client-share previews (which set their own opengraph-image).
//
// STATIC FOR THE WHOLE SUBTREE, which is what keeps the token out of the preview: this metadata is
// a constant, so it cannot interpolate the [token] segment, and there is no generateMetadata here
// to read one. A crawler that unfurls the link sees the product name and nothing else — not the
// token, not the owner, not the invited account, not the invitation label.
const TITLE = "Social Beast Auto Posting"
const DESCRIPTION = "Connect your Instagram account to get started."
const OG_IMAGE = "https://locatorbeast.com/locator-beast/locator-beast-black-logo-transparent.png"

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // A private, single-use invitation has no business in a search index. Separate from the preview
  // above: iMessage and the like render og:* regardless of robots, which is the point — the link
  // should unfurl nicely for the person it was sent to, and be findable by nobody else.
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Locator Beast",
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
