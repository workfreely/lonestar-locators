import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./beast.css";
import Nav from "./_components/Nav";
import Footer from "./_components/Footer";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./_lib/site";

const inter = Inter({
  subsets: ["latin"],
  variable: "--beast-font-sans",
  display: "swap",
});

const TITLE = "Locator Beast | The Operating System for Apartment Locators";

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

export default function LocatorBeastLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`beast-root ${inter.variable}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  );
}
