import type { SmartLeadFormConfig } from "../../../_lib/types"

// Renders as plain (non-clickable) text until a URL is provided — these are
// compliance disclosures, so the label should stay visible even before the
// locator has added a document link, rather than disappearing.
function FooterLink({ href, label }: { href?: string; label: string }) {
  if (!href) return <span className="text-[#c1c4cf]">{label}</span>
  return (
    <a href={href} className="transition-colors hover:text-[#2f6bff]">
      {label}
    </a>
  )
}

export default function Footer({ config }: { config: SmartLeadFormConfig }) {
  const { footerBrokerageWebsite, footerOfficePhone, footerIabs, footerConsumerProtectionNotice } =
    config.sections.visibility
  const { brokerageWebsiteUrl, officePhone, iabsUrl, consumerProtectionNoticeUrl } = config.footer

  return (
    <footer className="border-t border-[#eef0f4] px-5 py-8 text-center sm:px-8">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 text-[12px] font-medium text-[#9098a8]">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          <a href="/privacy" className="transition-colors hover:text-[#2f6bff]">
            Privacy Policy
          </a>
          <span className="text-[#d0d3dc]">·</span>
          <a href="/terms" className="transition-colors hover:text-[#2f6bff]">
            Terms of Service
          </a>

          {footerBrokerageWebsite && brokerageWebsiteUrl && (
            <>
              <span className="text-[#d0d3dc]">·</span>
              <a href={brokerageWebsiteUrl} className="transition-colors hover:text-[#2f6bff]">
                Brokerage Website
              </a>
            </>
          )}

          {footerOfficePhone && officePhone && (
            <>
              <span className="text-[#d0d3dc]">·</span>
              <a
                href={`tel:${officePhone.replace(/[^\d+]/g, "")}`}
                className="break-words transition-colors hover:text-[#2f6bff]"
              >
                {officePhone}
              </a>
            </>
          )}
        </div>

        {(footerIabs || footerConsumerProtectionNotice) && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
            {footerIabs && <FooterLink href={iabsUrl || undefined} label="IABS" />}
            {footerIabs && footerConsumerProtectionNotice && <span className="text-[#d0d3dc]">·</span>}
            {footerConsumerProtectionNotice && (
              <FooterLink href={consumerProtectionNoticeUrl || undefined} label="Consumer Protection Notice" />
            )}
          </div>
        )}

        <p className="text-[11px] text-[#c1c4cf]">Powered by Locator Beast</p>
      </div>
    </footer>
  )
}
