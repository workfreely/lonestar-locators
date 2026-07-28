import type { Metadata } from "next";
import PricingHero from "../_components/PricingHero";
import IncludedChecklist from "../_components/IncludedChecklist";
import NoConfusingPricing from "../_components/NoConfusingPricing";
import FAQList from "../_components/FAQList";
import ClosingCTA from "../_components/ClosingCTA";
import Reveal from "../_components/Reveal";
import { PRICING_FAQ } from "../_lib/faq-data";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "One price, everything included. $99/month with a 30-day free trial — no basic plan, no upsells, every future feature included.",
  alternates: { canonical: "https://locatorbeast.com/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <PricingHero />
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
