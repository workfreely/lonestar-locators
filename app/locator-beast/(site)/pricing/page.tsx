import type { Metadata } from "next";
import PricingSection from "@/app/locator-beast/(site)/_components/PricingSection";
import IncludedChecklist from "@/app/locator-beast/(site)/_components/IncludedChecklist";
import NoConfusingPricing from "@/app/locator-beast/(site)/_components/NoConfusingPricing";
import FAQList from "@/app/locator-beast/(site)/_components/FAQList";
import ClosingCTA from "@/app/locator-beast/(site)/_components/ClosingCTA";
import Reveal from "@/app/locator-beast/(site)/_components/Reveal";
import { PRICING_FAQ } from "@/app/locator-beast/_lib/faq-data";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "One price, everything included. $99/month with a 30-day free trial — no basic plan, no upsells, every future feature included.",
  alternates: { canonical: "https://locatorbeast.com/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <PricingSection />
      <IncludedChecklist />
      <NoConfusingPricing />

      <section className="bg-white py-20 md:py-28">
        <div className="beast-container">
          <Reveal>
            <h2 className="max-w-2xl text-[32px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
              Frequently asked questions
            </h2>
          </Reveal>
          <div className="mt-12">
            <FAQList items={PRICING_FAQ} id="faq" />
          </div>
        </div>
      </section>

      <ClosingCTA title="Become a Beast." subtitle="Start your Free Trial today." />
    </>
  );
}
