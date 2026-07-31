import type { Metadata } from "next";
import Script from "next/script";
import NavigationBar from "@/app/components/NavigationBar";
import Footer from "@/app/components/Footer";
import ClientPopups from "@/app/components/ClientPopups";
import ClientSecurity from "@/app/components/ClientSecurity";
import MobileStickyCTA from "@/app/components/MobileStickyCTA";
import VapiScript from "@/app/components/VapiScript";

// Lone Star Locators — the marketing site. This route group OWNS all Lone Star
// chrome (navbar, footer, marketing widgets, SEO metadata). Locator Beast pages
// live outside this group and structurally cannot inherit any of it.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

export const metadata: Metadata = {
  title: "Lone Star Locators | Free Apartment Locator in Texas",
  description:
    "Free apartment locator in Texas. We help you find, tour and lease luxury apartments, townhomes and penthouses with the best move-in specials.",
  openGraph: {
    title: "Lone Star Locators | Free Apartment Locator in Texas",
    description:
      "Free apartment locator in Texas helping renters find luxury apartments, townhomes and penthouses with the best move-in specials.",
    url: "https://www.lonestarlocators.app",
    siteName: "Lone Star Locators",
    type: "website",
  },
  alternates: {
    canonical: "https://www.lonestarlocators.app",
  },
};

export default function LoneStarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Flex column so the footer sticks to the bottom (previously on <body> in
    // the root layout; scoped here now that the root is brand-neutral).
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Meta Pixel — base install, PageView only. Lone Star's marketing pixel;
          scoped to this group so it never fires on Locator Beast pages. */}
      {META_PIXEL_ID && (
        <>
          <Script id="meta-pixel-base" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${META_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
          <noscript>
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        </>
      )}

      {/* Top Navigation */}
      <NavigationBar />

      {/* Main Page Content */}
      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: "1200px",
          marginLeft: "auto",
          marginRight: "auto",
          padding: "2.5rem 1rem 4rem",
          boxSizing: "border-box",
        }}
      >
        {children}
      </main>

      {/* Global Footer */}
      <Footer />

      {/* Client-only marketing logic */}
      <ClientPopups />
      <ClientSecurity />
      <MobileStickyCTA />
      <VapiScript />
    </div>
  );
}
