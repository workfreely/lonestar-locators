import type { Metadata } from "next";
import PageHero from "../_components/PageHero";
import FeatureDetailSection from "../_components/FeatureDetailSection";
import ComingSoonSection from "../_components/ComingSoonSection";
import ClosingCTA from "../_components/ClosingCTA";
import { FEATURE_SECTIONS } from "../_lib/features-data";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Everything Locator Beast includes: the Workflow Engine, CRM, AI Client Insights, Landing Pages, Phone Sync, Google integrations, and more — built exclusively for apartment locators.",
  alternates: { canonical: "https://locatorbeast.com/features" },
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        title={
          <>
            Everything You Need.
            <br />
            Nothing You Don&apos;t.
          </>
        }
        subtitle="Built exclusively for apartment locators."
      />

      {FEATURE_SECTIONS.map((section, i) => (
        <FeatureDetailSection
          key={section.title}
          title={section.title}
          description={section.description}
          bullets={[...section.bullets]}
          imageSide={i % 2 === 0 ? "right" : "left"}
          tone={i % 2 === 0 ? "tint" : "white"}
        />
      ))}

      <ComingSoonSection />

      <ClosingCTA
        title="Ready to become a Beast?"
        subtitle="Start your 30-Day Free Trial."
      />
    </>
  );
}
