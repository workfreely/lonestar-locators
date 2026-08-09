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

// Compliance links render as plain (non-clickable) text until a URL is provided,
// so the label stays visible even before the locator adds a document link.
function FooterLink({ href, label }: { href?: string; label: string }) {
  if (!href) return <span className="inline-block px-2 py-1.5 text-[14px] font-medium text-[#9aa0ad]">{label}</span>
  return (
    <a href={href} className={linkCls}>
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

  return (
    <footer className="border-t border-[#eef0f4] px-5 py-8 text-center sm:px-8">
      {/* Four clearly separated rows with consistent vertical rhythm. */}
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4">
        {/* 1 — Privacy · Terms (+ optional brokerage website / office phone) */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <a href="/privacy" className={linkCls}>
            Privacy Policy
          </a>
          <Dot />
          <a href="/terms" className={linkCls}>
            Terms of Service
          </a>
          {footerBrokerageWebsite && brokerageWebsiteUrl && (
            <>
              <Dot />
              <a href={brokerageWebsiteUrl} className={linkCls}>
                Brokerage Website
              </a>
            </>
          )}
          {footerOfficePhone && officePhone && (
            <>
              <Dot />
              <a href={`tel:${officePhone.replace(/[^\d+]/g, "")}`} className={`${linkCls} break-words`}>
                {officePhone}
              </a>
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

        {/* 3 — Compact identity row: Equal Housing icon · [Brokerage] · Powered by.
            flex-wrap + intentional gaps so a long brokerage name wraps cleanly at
            320px; each "· label" is kept together so a separator never orphans. */}
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] font-medium text-[#6b7280]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={EQUAL_HOUSING_LOGO} alt="Equal Housing Opportunity" className="h-[19px] w-auto shrink-0" />
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
    </footer>
  )
}
