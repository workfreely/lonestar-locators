import Image from "next/image"
import Link from "next/link"
import BeastMark from "./BeastMark"

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
    <div className="flex items-center gap-2.5 mr-4">
      {isDarkCrmHeader ? (
        /* The real white wordmark — ONE surface only: the dark CRM header.
           It is a full lockup (beast head + "Locator Beast"), so it replaces
           BOTH the BeastMark and the text span rather than sitting beside them.
           The intrinsic 2141x734 is handed to next/image so it emits a srcset
           and stays crisp at 2x/3x; `h-8 w-auto` pins the height and lets width
           follow the 2.92 ratio, so it can never stretch.

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
            width={2141}
            height={734}
            /* Intrinsic dimensions stay exact so the 2.92 aspect ratio — and the
               reserved layout box — are correct. `sizes` tells next/image the
               real DISPLAY width; without it Next assumed the declared 2141px
               and emitted a single 3840w candidate, shipping the full-resolution
               source for a ~124px logo. 128px yields small 1x/2x candidates that
               are still comfortably sharp on Retina. */
            sizes="128px"
            priority
            className="h-10 w-auto"
          />
        </Link>
      ) : (
        <>
          {mark === "beast" ? (
            <BeastMark tone={tone} size={48} />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-none">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 10L7 4L12 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          )}
          <span
            className={`font-bold text-[18px] tracking-tight whitespace-nowrap ${
              tone === "light" ? "text-[#111318]" : "text-[var(--crm-text-primary)]"
            }`}
          >
            Locator Beast
          </span>
        </>
      )}
    </div>
  )
}
