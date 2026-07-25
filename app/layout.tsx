import type { Metadata } from "next";
import Script from "next/script";
import { headers } from "next/headers";
import "./globals.css";
import NavigationBar from "./components/NavigationBar";
import Footer from "./components/Footer";
import ClientPopups from "@/app/components/ClientPopups";
import ClientSecurity from "@/app/components/ClientSecurity";
import MobileStickyCTA from "@/app/components/MobileStickyCTA";
import VapiScript from "@/app/components/VapiScript";
import { ANTI_FLASH_THEME_SCRIPT } from "@/lib/theme";

// Meta Pixel — base install (fires PageView on every page). Renders nothing
// if NEXT_PUBLIC_META_PIXEL_ID isn't set, so this is a no-op until the real
// Pixel ID from Facebook Business Manager is added to .env.local.
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/* ===============================
   SEO METADATA (SERVER-RENDERED)
================================ */
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

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Locator Beast (locatorbeast.com) is a separate marketing site rewritten
  // in from app/locator-beast/*. It supplies its own nav/footer/metadata via
  // app/locator-beast/layout.tsx, so the Lone Star chrome below is skipped
  // entirely for those requests. See middleware.ts for the x-site header.
  const isLocatorBeast = (await headers()).get("x-site") === "locator-beast";

  if (isLocatorBeast) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* CRM theme anti-flash — reads the saved preference (light by
            default) and applies the `dark` class to <html> before
            anything paints. Marketing-site pages never reference the CRM
            theme tokens this class controls, so this has zero visible
            effect outside /admin. Kept in sync with lib/theme.ts by hand
            (see ANTI_FLASH_THEME_SCRIPT's own comment). */}
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_THEME_SCRIPT }} />
      </head>
      <body
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
        {/* Meta Pixel — base install, PageView only. See app/lib/analytics.ts
            and lib/analytics/metaPixel.ts for the Lead event fired after a
            successful lead submission. */}
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
            width: "100%",              // 🔒 prevents overflow
            maxWidth: "1200px",
            marginLeft: "auto",
            marginRight: "auto",
            padding: "2.5rem 1rem 4rem", // 🔒 safer mobile padding
            boxSizing: "border-box",     // 🔒 critical
          }}
        >
          {children}
        </main>

        {/* Global Footer */}
        <Footer />

        {/* Client-only logic */}
<ClientPopups />
<ClientSecurity />

{/* Mobile Sticky CTA */}
        <MobileStickyCTA />

        <VapiScript />

      </body>
    </html>
  );
}
