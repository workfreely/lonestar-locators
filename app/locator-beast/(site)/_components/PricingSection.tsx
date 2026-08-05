import Link from "next/link";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";
import { MONTHLY_PRICE_USD, STANDARD_PRICE_USD } from "@/lib/billing/trial";

// The ONE pricing section, shared by BOTH the Pricing page (top) and the
// homepage (bottom) so there's a single source of truth — any copy/design edit
// here updates both places. Full-width dark navy-to-black band.
export default function PricingSection() {
  return (
    <section className="beast-glow relative overflow-hidden bg-[var(--beast-bg-dark)] pb-16 pt-14 text-white md:pb-20 md:pt-20">
      <div className="beast-container relative flex flex-col items-center text-center">
        <h1
          className="beast-fade-up max-w-2xl text-[36px] font-semibold leading-[1.1] tracking-tight sm:text-[46px] md:text-[54px]"
        >
          One Price.
          <br />
          Everything Included.
        </h1>

        {/* Future standard price, struck through, above the current price. */}
        <p
          className="beast-fade-up mt-8 text-[20px] font-medium text-[var(--beast-ink-inverse-soft)] line-through"
          style={{ animationDelay: "80ms" }}
        >
          ${STANDARD_PRICE_USD}/month
        </p>
        <p
          className="beast-fade-up mt-1 text-[56px] font-semibold leading-none tracking-tight md:text-[64px]"
          style={{ animationDelay: "110ms" }}
        >
          ${MONTHLY_PRICE_USD}
          <span className="text-[18px] font-medium text-[var(--beast-ink-inverse-soft)]">/month</span>
        </p>

        <p
          className="beast-fade-up mt-4 text-[15px] text-[var(--beast-ink-inverse-soft)]"
          style={{ animationDelay: "150ms" }}
        >
          Lock in the ${MONTHLY_PRICE_USD} new-member rate before pricing goes up.
        </p>

        <div className="beast-fade-up mt-8 flex flex-col items-center" style={{ animationDelay: "190ms" }}>
          <Link
            href={TRIAL_URL}
            className="inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue-bright)]"
          >
            Start Your 30-Day Free Trial
          </Link>
          <p className="mt-3 text-[13px] text-[var(--beast-ink-inverse-soft)]">No credit card required</p>
        </div>
      </div>
    </section>
  );
}
