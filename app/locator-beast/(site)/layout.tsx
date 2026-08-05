import type { Metadata } from "next";
import Nav from "./_components/Nav";
import Footer from "./_components/Footer";
import AskBeastAI from "@/components/beast-ai/AskBeastAI";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/app/locator-beast/_lib/site";

// Marketing website chrome (Nav + Footer + Ask Beast AI) + marketing SEO. This
// (site) route group wraps ONLY the marketing pages — features, pricing,
// academy, demo, etc. The public per-agent Smart Form at
// app/locator-beast/[username] deliberately sits OUTSIDE this group, so it
// renders standalone with none of this chrome. The shared beast-root wrapper +
// Inter font live in the parent app/locator-beast/layout.tsx (used by both).

const TITLE = "Locator Beast | All-in-One Platform for Apartment Locators";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | Locator Beast",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "apartment locator software",
    "apartment locator CRM",
    "lead management for apartment locators",
    "apartment locating business software",
  ],
  openGraph: {
    title: TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
  alternates: {
    canonical: SITE_URL,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Windows, macOS",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  offers: {
    "@type": "Offer",
    price: "99",
    priceCurrency: "USD",
  },
};

export default function LocatorBeastSiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No beast-root wrapper here — the parent layout provides it (and the font),
  // so both the marketing site and the standalone Smart Form share one shell.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
      <AskBeastAI />
    </>
  );
}
