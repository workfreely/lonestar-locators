import Image from "next/image"
import Link from "next/link"
import LocatorBeastWordmark from "@/components/brand/LocatorBeastWordmark"

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
  const isDarkCrmHeader = tone === "dark" && mark === "beast"

  return (
    /* ml-2 nudges the lockup 8px off the header's px-5 edge, applied HERE
       rather than per page so every AppHeader surface inherits it from one
       place — dark (/admin/leads, /admin/analytics, /admin/network,
       /admin/license-verification) and light (SettingsShell: /admin/profile,
       Sales Goals, Integrations, Import Leads, Billing settings) alike, since
       both use the same px-5 shell.

       Gated on mark="beast", which distinguishes the AppHeader family from the
       marketing nav. The nav sits inside beast-container and keeps its own
       alignment, so it must NOT take this nudge. Margin, not padding — any
       clickable area stays exactly the visible logo. */
    <div className={`flex items-center gap-2.5 mr-4 ${mark === "beast" ? "ml-2" : ""}`}>
      {isDarkCrmHeader ? (
        /* The real white wordmark — ONE surface only: the dark CRM header.
           It is a full lockup (beast head + "Locator Beast"), so it replaces
           BOTH the BeastMark and the text span rather than sitting beside them.
           The intrinsic 2141x734 is handed to next/image so it emits a srcset
           and stays crisp at 2x/3x; `h-7 w-auto` pins the height and lets width
           follow the 5.45 ratio, so it can never stretch.

           Every other caller is untouched: the light Business Settings header
           and the marketing nav keep the existing composition below. */
        /* inline-flex so the link box hugs the image exactly — the clickable
           area is the visible logo and nothing more. /admin/leads is the app's
           canonical home: it is where login, onboarding completion, and the
           existing BackToDashboard link all send users. */
        <Link href="/admin/leads" aria-label="Locator Beast — go to dashboard" className="inline-flex">
          <Image
            src="/locator-beast/locator-beast-white-logo-transparent.png"
            alt="Locator Beast"
            width={1794}
            height={329}
            /* Intrinsic dimensions match the TRIMMED asset (1794x329, ratio 5.45).
               The source shipped on a 2141x734 canvas whose solid ink occupied
               only 329px of height — the rest was transparent margin plus a
               near-invisible halo (469 stray pixels, max alpha 8/255). At a
               40px-tall box that rendered just 17.9px of actual logo. Cropping
               to the ink makes the same box show the full artwork, 2.23x
               larger, with no CSS change. These values must track the file: a
               stale pair reserves a wrong-ratio box and causes layout shift.

               `sizes` tells next/image the real DISPLAY width; without it Next
               assumed the declared intrinsic width and emitted a single 3840w
               candidate, shipping the full-resolution source for a ~200px
               logo. This must track the
               rendered width: at ratio 5.45 a 28px-tall logo is ~153px wide,
               so Retina needs 305px of source. 176px selects the 256w
               candidate at 1x and 384w at 2x — both above the element's real
               pixel width, so Retina stays sharp. It is deliberately a little
               wider than the 153px element: the next step down, 128px, would
               serve 256w at 2x, under the 305px needed, and render soft. */
            sizes="176px"
            priority
            className="h-7 w-auto"
          />
        </Link>
      ) : (
        /* LIGHT SURFACES — the full black wordmark, one mark everywhere.
           This replaced two different lockups that used to live here: the blue
           square + chevron (marketing nav) and the bare Beast head + text
           (light Business Settings header). Both are gone, so the app no longer
           shows three different brand marks depending on which header you are
           looking at.

           Heights are the ALREADY-APPROVED values, not new ones:
             28px in the AppHeader family — the same 56px px-5 shell as the
                  dark CRM header, whose approved treatment is 28px.
             40px in the marketing nav — the approved black-wordmark height
                  from /login, /signup, and billing. The nav shell is taller
                  (h-16/h-20), so the 28px CRM figure read far too small there.

           Deliberately NOT wrapped in a Link. The marketing nav already wraps
           <Logo> in its own <Link href="/">, and nesting anchors is invalid
           HTML. The light AppHeader was not clickable before this change and
           still is not — it has its own "Back to Dashboard" control. Only the
           dark CRM header carries a link, exactly as it did before. */
        <LocatorBeastWordmark height={mark === "beast" ? 28 : 40} />
      )}
    </div>
  )
}
