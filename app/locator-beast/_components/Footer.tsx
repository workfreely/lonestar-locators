import Image from "next/image";
import Link from "next/link";
import { FAQ_URL, LOGO_FOR_DARK_BG, MARKETS, NAV_LINKS, SITE_TAGLINE } from "../_lib/site";

type FooterLinkItem = { label: string; href?: string };

const PRODUCT_LINKS: FooterLinkItem[] = [
  { label: "Features", href: NAV_LINKS[0].href },
  { label: "Pricing", href: NAV_LINKS[1].href },
  { label: "FAQ", href: FAQ_URL },
  { label: "Contact", href: "/contact" },
];

const COMPANY_LINKS: FooterLinkItem[] = [{ label: "About" }, { label: "Careers" }];

const RESOURCES_LINKS: FooterLinkItem[] = [
  { label: "Documentation" },
  { label: "Blog" },
  { label: "Roadmap" },
];

const LEGAL_LINKS: FooterLinkItem[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

// A link renders only when a page actually exists; everything else renders
// as plain (non-interactive) text so the footer never ships a dead link.
function FooterLink({ label, href }: FooterLinkItem) {
  if (href) {
    return (
      <Link
        href={href}
        className="text-[14px] text-[var(--beast-ink-inverse-soft)] transition-colors hover:text-white"
      >
        {label}
      </Link>
    );
  }
  return <span className="text-[14px] text-white/35">{label}</span>;
}

function FooterColumn({ title, links }: { title: string; links: FooterLinkItem[] }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-white">{title}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.label}>
            <FooterLink {...link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-[var(--beast-bg-dark)] text-[var(--beast-ink-inverse)]">
      <div className="beast-container py-16 md:py-20">
        <div className="max-w-xs">
          <Image
            src={LOGO_FOR_DARK_BG}
            alt="Locator Beast"
            width={172}
            height={40}
            style={{ height: "28px", width: "auto" }}
          />
          <p className="mt-4 text-[13px] uppercase tracking-[0.2em] text-[var(--beast-ink-inverse-soft)]">
            {SITE_TAGLINE}
          </p>
          <p className="mt-6 text-[14px] leading-relaxed text-[var(--beast-ink-inverse-soft)]">
            The operating system built exclusively for apartment locators.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-x-8 gap-y-10 border-t border-[var(--beast-border-dark)] pt-14 sm:grid-cols-4">
          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />
          <FooterColumn title="Resources" links={RESOURCES_LINKS} />
          <FooterColumn title="Legal" links={LEGAL_LINKS} />
        </div>

        <div className="mt-14 border-t border-[var(--beast-border-dark)] pt-14">
          <p className="text-[13px] font-semibold text-white">Supported Markets</p>
          <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {MARKETS.map((market) => (
              <div key={market.state}>
                <p className="text-[13px] font-semibold text-white/80">{market.state}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {market.cities.map((city) => (
                    <li key={city} className="text-[13px] leading-relaxed text-white/40">
                      {city}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--beast-border-dark)]">
        <div className="beast-container flex flex-col gap-2 py-6 text-[13px] text-[var(--beast-ink-inverse-soft)] sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year} Locator Beast. All rights reserved.</p>
          <p>Built by locators, for locators.</p>
        </div>
      </div>
    </footer>
  );
}
