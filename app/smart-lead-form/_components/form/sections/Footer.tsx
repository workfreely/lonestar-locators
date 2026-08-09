import type { SmartLeadFormConfig } from "../../../_lib/types"

// Reuses the repo's existing official Equal Housing asset (same one the Locator
// Beast marketing footer uses) — not redrawn or approximated.
const EQUAL_HOUSING_LOGO =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748218746/Lone_Star_Locators_Equal_Housing_Logo_h4dmr4.png"

// Footer links: ~14px medium, darker-but-secondary, with comfortable tap area.
const linkCls =
  "inline-block px-2 py-1.5 text-[14px] font-medium text-[#4b5563] transition-colors hover:text-[#2f6bff]"

// A centered separator dot with breathing room (not a cramped divider).
function Dot() {
  return (
    <span aria-hidden="true" className="text-[#cbd0da]">
      ·
    </span>
  )
}

// The shared Equal Housing asset is a WHITE transparent logo (built for the dark
// marketing footer). On this light footer it would be invisible, so — scoped to
// THIS component only via the `.slf-eho-icon` class (see the <style> below) — a
// brightness(0) filter renders it solid black. That scoped rule intentionally
// out-specifies the global `footer img { filter: none !important }` in globals.css
// WITHOUT changing it, so the shared asset, marketing footer, emails, guest
// cards, and every other surface are untouched. Accessible alt text preserved.
function EhoIcon() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={EQUAL_HOUSING_LOGO} alt="Equal Housing Opportunity" className="slf-eho-icon h-[19px] w-auto shrink-0" />
  )
}

// Desktop links use a leaner horizontal padding so all four compliance links plus
// the right-hand group fit on one row at the narrowest desktop width (768px).
// Vertical rhythm/type stay identical to the mobile links.
const linkDesktopCls =
  "inline-block whitespace-nowrap px-0.5 py-1.5 text-[14px] font-medium text-[#4b5563] transition-colors hover:text-[#2f6bff]"

// Compliance links render as plain (non-clickable) text until a URL is provided,
// so the label stays visible even before the locator adds a document link. The
// `desktop` variant swaps in the leaner padding used by the one-row desktop layout.
function FooterLink({ href, label, desktop = false }: { href?: string; label: string; desktop?: boolean }) {
  const base = desktop ? linkDesktopCls : linkCls
  if (!href)
    return (
      <span
        className={`inline-block py-1.5 text-[14px] font-medium text-[#9aa0ad] ${
          desktop ? "whitespace-nowrap px-0.5" : "px-2"
        }`}
      >
        {label}
      </span>
    )
  return (
    <a href={href} className={base}>
      {label}
    </a>
  )
}

export default function Footer({ config }: { config: SmartLeadFormConfig }) {
  const { footerBrokerageWebsite, footerOfficePhone, footerIabs, footerConsumerProtectionNotice, brokerageInfo } =
    config.sections.visibility
  const { brokerageWebsiteUrl, officePhone, iabsUrl, consumerProtectionNoticeUrl } = config.footer
  // Brokerage in the identity row reads the existing config source (copy.brokerageName)
  // and the existing brokerageInfo visibility — no new field. Omitted when blank or hidden.
  const showBrokerage = brokerageInfo && (config.copy.brokerageName ?? "").trim().length > 0

  const brokerageWebsiteLink = footerBrokerageWebsite && brokerageWebsiteUrl && (
    <a href={brokerageWebsiteUrl} className={linkCls}>
      Brokerage Website
    </a>
  )
  const officePhoneLink = footerOfficePhone && officePhone && (
    <a href={`tel:${officePhone.replace(/[^\d+]/g, "")}`} className={`${linkCls} break-words`}>
      {officePhone}
    </a>
  )

  return (
    <footer className="border-t border-[#eef0f4] px-5 py-8 text-center sm:px-8">
      {/* Scoped override: render the Equal Housing icon black on this light footer.
          `.slf-eho-icon` (class) out-specifies the global `footer img { filter:
          none !important }` without touching that shared rule or other surfaces. */}
      <style>{`.slf-eho-icon{filter:brightness(0)!important}`}</style>
      {/* ── Mobile (< md): stacked rows — layout/spacing/typography unchanged. ── */}
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 md:hidden">
        {/* 1 — Privacy · Terms (+ optional brokerage website / office phone) */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <a href="/privacy" className={linkCls}>
            Privacy Policy
          </a>
          <Dot />
          <a href="/terms" className={linkCls}>
            Terms of Service
          </a>
          {brokerageWebsiteLink && (
            <>
              <Dot />
              {brokerageWebsiteLink}
            </>
          )}
          {officePhoneLink && (
            <>
              <Dot />
              {officePhoneLink}
            </>
          )}
        </div>

        {/* 2 — IABS · Consumer Protection Notice */}
        {(footerIabs || footerConsumerProtectionNotice) && (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            {footerIabs && <FooterLink href={iabsUrl || undefined} label="IABS" />}
            {footerIabs && footerConsumerProtectionNotice && <Dot />}
            {footerConsumerProtectionNotice && (
              <FooterLink href={consumerProtectionNoticeUrl || undefined} label="Consumer Protection Notice" />
            )}
          </div>
        )}

        {/* 3 — Compact identity row: Equal Housing icon · [Brokerage] · Powered by. */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] font-medium text-[#6b7280]">
          <EhoIcon />
          {showBrokerage && (
            <span className="inline-flex items-center gap-x-2">
              <Dot />
              <span className="break-words">{config.copy.brokerageName}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-x-2">
            <Dot />
            <span>Powered by Locator Beast</span>
          </span>
        </div>
      </div>

      {/* ── Desktop (≥ md): ONE horizontal, vertically-centered row — two groups
             pushed to the far edges of a wide container (independent of the narrow
             form column). No wrap: leaner link padding + tight internal gaps keep
             both groups on a single line even at the 768px breakpoint. ── */}
      <div className="mx-auto hidden max-w-4xl flex-nowrap items-center justify-between gap-x-4 md:flex">
        {/* Left: Privacy · Terms · IABS · Consumer Protection Notice */}
        <div className="flex items-center gap-x-1">
          <a href="/privacy" className={linkDesktopCls}>
            Privacy Policy
          </a>
          <Dot />
          <a href="/terms" className={linkDesktopCls}>
            Terms of Service
          </a>
          {footerIabs && (
            <>
              <Dot />
              <FooterLink href={iabsUrl || undefined} label="IABS" desktop />
            </>
          )}
          {footerConsumerProtectionNotice && (
            <>
              <Dot />
              <FooterLink href={consumerProtectionNoticeUrl || undefined} label="Consumer Protection Notice" desktop />
            </>
          )}
          {footerBrokerageWebsite && brokerageWebsiteUrl && (
            <>
              <Dot />
              <a href={brokerageWebsiteUrl} className={linkDesktopCls}>
                Brokerage Website
              </a>
            </>
          )}
          {footerOfficePhone && officePhone && (
            <>
              <Dot />
              <a href={`tel:${officePhone.replace(/[^\d+]/g, "")}`} className={`${linkDesktopCls} whitespace-nowrap`}>
                {officePhone}
              </a>
            </>
          )}
        </div>

        {/* Right: Equal Housing icon · Powered by Locator Beast */}
        <div className="flex shrink-0 items-center gap-x-2 whitespace-nowrap text-[13px] font-medium text-[#6b7280]">
          <EhoIcon />
          <Dot />
          <span>Powered by Locator Beast</span>
        </div>
      </div>
    </footer>
  )
}
