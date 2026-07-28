import Link from "next/link";
import { FAQ_URL, MARKETS, NAV_LINKS } from "../_lib/site";

type FooterLinkItem = { label: string; href: string };

const NAV_ITEMS: FooterLinkItem[] = [
  { label: "Features", href: NAV_LINKS[0].href },
  { label: "Pricing", href: NAV_LINKS[1].href },
  { label: "FAQ", href: FAQ_URL },
  { label: "Contact", href: "/contact" },
  { label: "Privacy Policy", href: "/locator-beast/privacy" },
  { label: "Terms of Service", href: "/locator-beast/terms" },
];

const EQUAL_HOUSING_LOGO =
  "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748218746/Lone_Star_Locators_Equal_Housing_Logo_h4dmr4.png";

const headingCls = "text-[12px] font-semibold uppercase tracking-wider text-white/80";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-[var(--beast-bg-dark)] text-[var(--beast-ink-inverse)]">
      <div className="beast-container py-8 md:py-9">
        <div className="flex flex-col gap-8 md:flex-row md:gap-16">
          {/* Single merged navigation column */}
          <div className="flex-none md:w-40">
            <p className={headingCls}>Navigation</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {NAV_ITEMS.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-[13px] text-[var(--beast-ink-inverse-soft)] transition-colors hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Supported Markets — beside the nav, dense: one line per state */}
          <div className="min-w-0 flex-1">
            <p className={headingCls}>Supported Markets</p>
            <div className="mt-2.5 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {MARKETS.map((market) => (
                <p key={market.state} className="text-[12.5px] leading-relaxed">
                  <span className="font-semibold text-white/80">{market.state}:</span>{" "}
                  <span className="text-white/40">{market.cities.join(", ")}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar: Equal Housing logo + copyright */}
      <div className="border-t border-[var(--beast-border-dark)]">
        <div className="beast-container flex flex-col gap-3 py-4 text-[12.5px] text-[var(--beast-ink-inverse-soft)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={EQUAL_HOUSING_LOGO} alt="Equal Housing Opportunity" style={{ height: 26, width: "auto" }} />
            <p>&copy; {year} Locator Beast. All rights reserved.</p>
          </div>
          <p>The Operating System for Apartment Locators.</p>
        </div>
      </div>
    </footer>
  );
}
