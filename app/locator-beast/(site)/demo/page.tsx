import type { Metadata } from "next";
import HomepageDemo from "@/app/locator-beast/(site)/demo/_components/HomepageDemo";

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
      <section className="beast-glow relative overflow-hidden bg-[var(--beast-bg-dark)] pb-14 pt-6 text-white md:pb-16 md:pt-8">
        <div className="beast-container relative">
          <h1 className="beast-fade-up mx-auto max-w-3xl text-center text-[26px] font-semibold leading-[1.1] tracking-tight sm:text-[32px] md:text-[36px]">
            See Locator Beast in Action
          </h1>
          <div className="mt-6">
            <HomepageDemo />
          </div>
        </div>
      </section>
    </>
  );
}
