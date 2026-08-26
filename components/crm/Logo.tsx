import Link from "next/link"
import LocatorBeastWordmark, {
  HEADER_LOGO_HEIGHT,
  HEADER_LOGO_OFFSET,
  NAV_LOGO_HEIGHT,
} from "@/components/brand/LocatorBeastWordmark"

// Shared CRM brand mark — was previously duplicated byte-for-byte in
// DashboardClient's and PerformanceClient's headers (one said "Locator
// Beast AI", the other said "Performance"). Centralized here so the
// product name only needs to be right in one place, and so the wordmark
// automatically follows the active theme via the CSS var instead of a
// hardcoded gray.
//
// `tone` describes the SURFACE, not the ink: it drives the wordmark color so
// the same lockup can sit on the dark CRM header (theme token → light text)
// and on the white Business Settings header (dark ink), and it picks which
// Beast head reads against that background.
//
// `mark` exists because this component is shared with the public marketing
// nav, whose logo treatment is being decided separately — it keeps the old
// blue square + chevron by default, and the authenticated app opts in to the
// Beast head. Temporary: once the real logo system lands, both collapse back
// to one mark and this prop goes away.
export default function Logo({
  tone = "dark",
  mark = "chevron",
}: {
  tone?: "dark" | "light"
  mark?: "chevron" | "beast"
}) {
  // The wordmark image is WHITE, so it is used only where the surface is dark
  // AND this is the app header (mark="beast"). tone="light" is the white
  // Business Settings / Smart Lead Form header, and the marketing nav passes the
  // default mark="chevron" — both keep the existing lockup untouched.
  // `mark` is what distinguishes the two header FAMILIES, and each keeps its own
  // approved size:
  //   "beast"   — the AppHeader family (CRM, Profile, Sales Goals, Integrations,
  //               Import Leads, Billing settings, Smart Lead Form). 28px, and the
  //               8px HEADER_LOGO_OFFSET off the shell's px-5 edge.
  //   "chevron" — the shared public marketing nav. 40px, because that bar is
  //               h-16/h-20 rather than h-14 and 28px reads far too small in it.
  //               No offset: it sits inside beast-container and keeps its own
  //               alignment.
  //
  // `tone` now only picks the ASSET COLOUR. Every navigation surface is dark, so
  // this resolves to the white wordmark in practice; the black variant survives
  // for a light caller and is otherwise reserved for /login and /signup, which
  // render it directly rather than through this component.
  const isAppHeader = mark === "beast"
  const height = isAppHeader ? HEADER_LOGO_HEIGHT : NAV_LOGO_HEIGHT
  const wordmark = (
    <LocatorBeastWordmark
      variant={tone === "dark" ? "white" : "black"}
      height={height}
      priority={isAppHeader}
    />
  )

  return (
    <div className={`flex items-center gap-2.5 mr-4 ${isAppHeader ? HEADER_LOGO_OFFSET : ""}`}>
      {isAppHeader ? (
        /* Only the app header owns a link. The marketing nav already wraps
           <Logo> in its own <Link href="/">, and nesting anchors is invalid
           HTML. inline-flex so the link box hugs the image exactly — the
           clickable area is the visible logo and nothing more. /admin/leads is
           the app's canonical home. */
        <Link href="/admin/leads" aria-label="Locator Beast — go to dashboard" className="inline-flex">
          {wordmark}
        </Link>
      ) : (
        wordmark
      )}
    </div>
  )
}
