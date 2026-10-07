import type { Metadata } from "next";
import PageHero from "@/app/locator-beast/(site)/_components/PageHero";
import FeatureDetailSection from "@/app/locator-beast/(site)/_components/FeatureDetailSection";
// Coming Soon section hidden for now — restore this import when re-enabling it.
// import ComingSoonSection from "@/app/locator-beast/(site)/_components/ComingSoonSection";
import ClosingCTA from "@/app/locator-beast/(site)/_components/ClosingCTA";
import { FEATURES } from "@/app/locator-beast/_lib/features-data";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Everything Locator Beast includes: the Workflow Engine, AI-powered CRM, AI Client Insights, Smart Lead Forms, Beast Sync, Google Calendar and Contacts, and more — built exclusively for apartment locators.",
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

      {FEATURES.map((section, i) => (
        <FeatureDetailSection
          key={section.title}
          title={section.title}
          description={section.body}
          bullets={[...section.bullets]}
          imageSide={i % 2 === 0 ? "right" : "left"}
          tone={i % 2 === 0 ? "tint" : "white"}
        />
      ))}

      {/* Coming Soon section hidden for now — restore when re-enabling.
      <ComingSoonSection /> */}

      <ClosingCTA
        title="Ready to become a Beast?"
        subtitle="Start your 7-Day Free Trial."
      />
    </>
  );
}
