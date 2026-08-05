import Hero from "@/app/locator-beast/(site)/_components/Hero";
import WhySection from "@/app/locator-beast/(site)/_components/WhySection";
import FeatureGrid from "@/app/locator-beast/(site)/_components/FeatureGrid";
import BuiltByLocators from "@/app/locator-beast/(site)/_components/BuiltByLocators";
import HowItWorks from "@/app/locator-beast/(site)/_components/HowItWorks";
import PricingSection from "@/app/locator-beast/(site)/_components/PricingSection";

export default function LocatorBeastHome() {
  return (
    <>
      <Hero />
      <WhySection />
      <FeatureGrid />
      <BuiltByLocators />
      <HowItWorks />
      <PricingSection />
    </>
  );
}
