import type { Metadata } from "next";
import "./globals.css";
import NavigationBar from "./components/NavigationBar";
import Footer from "./components/Footer";
import ClientPopups from "@/app/components/ClientPopups";
import ClientSecurity from "@/app/components/ClientSecurity";
import MobileStickyCTA from "@/app/components/MobileStickyCTA";
import VapiScript from "@/app/components/VapiScript";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
        }}
      >
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
