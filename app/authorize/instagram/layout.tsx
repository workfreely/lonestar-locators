import type { Metadata } from "next"

// SCOPED metadata for the Beast Social Instagram authorization link ONLY (/authorize/instagram/*).
// The link is texted to recipients, so its iMessage/social preview matters.
//
// THE IMAGE IS NOT DECLARED HERE. ./opengraph-image.tsx supplies it, exactly as the apartment
// recommendation link does, and Next derives og:image / twitter:image from that file. An earlier
// version named the wordmark PNG here instead — 1821x343 and transparent, a letterbox strip that a
// ~1.91:1 preview card cannot fill, which is why iMessage drew a plain grey bubble. An explicit
// `images` entry would take precedence over the file route, so there must not be one.
//
// metadataBase is set because the generated image URL must be absolute and must point at the
// CANONICAL host: without it Next resolves against VERCEL_URL, so a preview deployment would
// advertise its own throwaway hostname. Scoped to this subtree; nothing global changes.
//
// STATIC FOR THE WHOLE SUBTREE, which is what keeps the token out of the preview: this metadata is
// a constant, so it cannot interpolate the [token] segment, and there is no generateMetadata here
// to read one. A crawler that unfurls the link sees the product name and nothing else — not the
// token, not the owner, not the invited account, not the invitation label.
const TITLE = "Social Beast Auto Posting"
const DESCRIPTION = "Connect your Instagram account to get started."
const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://locatorbeast.com"

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
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
  },
  // summary_large_image, not summary: the card is 1200x630 and should fill the bubble rather
  // than sit in a small square thumbnail beside the text.
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function AuthorizeInstagramLayout({ children }: { children: React.ReactNode }) {
  return children
}
