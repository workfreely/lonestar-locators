import type { Metadata } from "next";
import PageHero from "../_components/PageHero";
import HomepageDemo from "./_components/HomepageDemo";

export const metadata: Metadata = {
  title: "Live Demo",
  description:
    "See Locator Beast in action — create a lead, watch the workflow automate, and meet your AI Client Insights. No signup required.",
  alternates: { canonical: "https://locatorbeast.com/demo" },
  openGraph: {
    title: "Live Demo | Locator Beast",
    description: "Experience Locator Beast in under a minute — lead form, workflow automation, and AI client insights.",
    url: "https://locatorbeast.com/demo",
    type: "website",
  },
};

// Marketing-appropriate structured data (SoftwareApplication) — describes the
// product this page demonstrates. No application-specific / internal metadata.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Locator Beast",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Windows, macOS",
  url: "https://locatorbeast.com/demo",
  description:
    "The operating system for apartment locators — lead capture, workflow automation, and AI client insights. Try the interactive live demo.",
  featureList: ["Smart Lead Form", "Workflow Automation", "AI Client Insights"],
  offers: { "@type": "Offer", price: "99", priceCurrency: "USD" },
};

export default function DemoPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PageHero
        eyebrow="Live Demo"
        title="See Locator Beast in action"
        subtitle="Create a lead, watch the workflow automate, and meet your AI insights — in under a minute. No signup required."
      />
      <div className="bg-[var(--beast-bg-dark)]">
        <div className="beast-container -mt-8 max-w-5xl pb-20 md:-mt-12 md:pb-28">
          <HomepageDemo />
        </div>
      </div>
    </>
  );
}
