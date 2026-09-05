import type { ReactNode } from "react"
import type { SmartLeadFormConfig } from "../../../_lib/types"
import { SITE_URL } from "@/app/locator-beast/_lib/site"

// Reuses the repo's existing official Equal Housing asset (same one the Locator
// Beast marketing footer uses) — not redrawn or approximated.
const EQUAL_HOUSING_LOGO =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748218746/Lone_Star_Locators_Equal_Housing_Logo_h4dmr4.png"

// Legal links: ~14px medium, darker-but-secondary, with a comfortable tap height.
const linkCls =
  "inline-block py-1.5 text-[14px] font-medium text-[#4b5563] transition-colors hover:text-[#2f6bff]"

// Separator dot with symmetric breathing room. Rendered as a TRAILING element on
// each item except the last (see DotJoin), so a wrapped line never STARTS with a
// stray dot — the dot always stays glued to the end of the item it follows.
function Dot({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`mx-1.5 text-[#cbd0da] ${className}`}>
      ·
    </span>
  )
}

// Lays out a row of items separated by dots. Each item + its trailing dot is one
// atomic inline-flex unit, so the group wraps naturally (long disclosure names
// included) without ever orphaning a separator at the start of a line. Spacing is
// uniform across every group because the dot owns its own margin.
function DotJoin({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <div className={className}>
      {items.map((node, i) => (
        <span key={i} className="inline-flex items-center">
          {node}
          {i < items.length - 1 && <Dot />}
        </span>
      ))}
    </div>
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

// Visible footer labels for the two Texas TREC disclosure presets. DISPLAY ONLY —
// the underlying fields, URLs, stored config, and disclosure detection are the
// full TREC notices; only the rendered footer text is shortened here.
const TX_IABS_LABEL = "Information About Brokerage Services"
const TX_CPN_LABEL = "Consumer Protection Notice"

export default function Footer({
  config,
  compact = false,
}: {
  config: SmartLeadFormConfig
  /**
   * Opt-in denser rendering for the client Recommendation page, where the legal
   * block must remain complete but must not compete with the recommendations.
   * Additive and defaulted off, so the public Smart Lead Form is byte-identical.
   * The LINKS and their behaviour are unchanged — only type scale and padding.
   */
  compact?: boolean
}) {
  const { footerBrokerageWebsite, footerOfficePhone } = config.sections.visibility
  const { brokerageWebsiteUrl, officePhone, iabsUrl, consumerProtectionNoticeUrl } = config.footer

  // Legal & disclosure links — rendered ONLY when a URL is configured (URL-gated,
  // so a required disclosure can't be accidentally hidden by a toggle). Texas
  // presets use their full visible names; custom disclosures use the locator's
  // saved title. Empty/incomplete rows (missing title or url) are skipped.
  const disclosureLinks: { href: string; label: string }[] = [
    ...(iabsUrl ? [{ href: iabsUrl, label: TX_IABS_LABEL }] : []),
    ...(consumerProtectionNoticeUrl ? [{ href: consumerProtectionNoticeUrl, label: TX_CPN_LABEL }] : []),
    ...(config.footer.customDisclosures ?? [])
      .filter((d) => d && String(d.title ?? "").trim() && String(d.url ?? "").trim())
      .map((d) => ({ href: d.url.trim(), label: d.title.trim() })),
  ]

  // Brokerage in the identity row comes from the CANONICAL profile brokerage: the
  // public pages override config.copy.brokerageName with the live profiles.brokerage
  // (via lb_resolve_public_form / lb_resolve_public_join) at render, so this always
  // reflects the locator's current saved brokerage — no duplicated/stored value.
  // Shown automatically whenever a brokerage is present (no separate toggle to hide it).
  const brokerageName = (config.copy.brokerageName ?? "").trim()
  const showBrokerage = brokerageName.length > 0

  // ── The agent's CONFIGURED legal/disclosure links (Texas presets use the
  //    shortened labels above; custom disclosures use the exact saved title). Row 2
  //    is rendered ONLY when at least one is configured — never an empty row.
  //    External links open in a new tab. Legacy footer sub-items (brokerage website
  //    / office phone — no editor UI, off by default) fold in for backward-compat. ──
  const disclosureNodes: ReactNode[] = [
    ...disclosureLinks.map((d, i) => (
      <a key={`disc-${i}`} href={d.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
        {d.label}
      </a>
    )),
    ...(footerBrokerageWebsite && brokerageWebsiteUrl
      ? [
          <a key="bw" href={brokerageWebsiteUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
            Brokerage Website
          </a>,
        ]
      : []),
    ...(footerOfficePhone && officePhone
      ? [
          <a key="op" href={`tel:${officePhone.replace(/[^\d+]/g, "")}`} className={`${linkCls} break-words`}>
            {officePhone}
          </a>,
        ]
      : []),
  ]

  const hasDisclosures = disclosureNodes.length > 0

  // ── Identity row: Equal Housing icon · [Brokerage] · Powered by Locator Beast. ──
  const identityNodes: ReactNode[] = [
    <EhoIcon key="eho" />,
    ...(showBrokerage ? [<span key="brokerage" className="break-words">{brokerageName}</span>] : []),
    <span key="powered" className="whitespace-nowrap">
      Powered by{" "}
      <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
        Locator Beast
      </a>
    </span>,
  ]

  return (
    <footer className={compact ? "px-4 py-4" : "border-t border-[#eef0f4] px-5 py-8 sm:px-8"}>
      {/* Scoped override: render the Equal Housing icon black on this light footer.
          `.slf-eho-icon` (class) out-specifies the global `footer img { filter:
          none !important }` without touching that shared rule or other surfaces. */}
      <style>{`.slf-eho-icon{filter:brightness(0)!important}`}</style>
      {/* Compact mode shrinks the type in place rather than duplicating every
          class, so the markup, links and disclosure logic stay identical. */}
      {compact && (
        <style>{`.slf-compact a,.slf-compact span{font-size:11px!important;line-height:1.45!important}.slf-compact .slf-eho-icon{height:14px!important}`}</style>
      )}

      {/* Centered, compact footer. DESKTOP: two rows — (1) Privacy · Terms ·
          [configured disclosures] all on one line, (2) Equal Housing · brokerage ·
          attribution. MOBILE: the disclosures drop to their own middle row via a
          full-width flex break that only exists below `md`, giving three rows. Dots
          are glued trailing separators (never leading), and the Terms→disclosure dot
          is desktop-only so the mobile break never leaves an orphaned separator. */}
      <div className={`mx-auto flex max-w-4xl flex-col items-center ${compact ? "slf-compact gap-1" : "gap-2.5"}`}>
        {/* Legal links row */}
        <div className="flex flex-wrap items-center justify-center gap-y-1">
          <span className="inline-flex items-center">
            <a href="/privacy" className={linkCls}>
              Privacy Policy
            </a>
            <Dot />
          </span>
          <span className="inline-flex items-center">
            <a href="/terms" className={linkCls}>
              Terms of Service
            </a>
            {/* Separator to the disclosures — shown only when they share the row (desktop). */}
            {hasDisclosures && <Dot className="hidden md:inline-block" />}
          </span>
          {/* Mobile-only line break: pushes the configured disclosures to their own row. */}
          {hasDisclosures && <span aria-hidden="true" className="h-0 basis-full md:hidden" />}
          {disclosureNodes.map((node, i) => (
            <span key={i} className="inline-flex items-center">
              {node}
              {i < disclosureNodes.length - 1 && <Dot />}
            </span>
          ))}
        </div>

        {/* Identity row — kept together on one line at desktop widths. */}
        <DotJoin
          className="flex flex-wrap items-center justify-center gap-y-1 text-[13px] font-medium text-[#6b7280] md:flex-nowrap"
          items={identityNodes}
        />
      </div>
    </footer>
  )
}
