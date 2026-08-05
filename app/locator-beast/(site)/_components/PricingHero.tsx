import Link from "next/link";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";
import { MONTHLY_PRICE_USD, STANDARD_PRICE_USD } from "@/lib/billing/trial";

export default function PricingHero() {
  return (
    <section className="beast-glow relative overflow-hidden bg-[var(--beast-bg-dark)] pb-16 pt-14 text-white md:pb-20 md:pt-20">
      <div className="beast-container relative flex flex-col items-center text-center">
        <p
          className="beast-fade-up text-[13px] font-semibold uppercase tracking-[0.3em] text-[var(--beast-blue-bright)]"
        >
          Founding Membership
        </p>

        <h1
          className="beast-fade-up mt-4 max-w-2xl text-[36px] font-semibold leading-[1.1] tracking-tight sm:text-[46px] md:text-[54px]"
          style={{ animationDelay: "60ms" }}
        >
          One Price.
          <br />
          Everything Included.
        </h1>

        {/* Future standard price, struck through, above the founding rate. */}
        <p
          className="beast-fade-up mt-8 text-[20px] font-medium text-[var(--beast-ink-inverse-soft)] line-through"
          style={{ animationDelay: "100ms" }}
        >
          ${STANDARD_PRICE_USD}/month
        </p>
        <p
          className="beast-fade-up mt-1 text-[56px] font-semibold leading-none tracking-tight md:text-[64px]"
          style={{ animationDelay: "130ms" }}
        >
          ${MONTHLY_PRICE_USD}
          <span className="text-[18px] font-medium text-[var(--beast-ink-inverse-soft)]">/month</span>
        </p>

        <p
          className="beast-fade-up mt-5 max-w-md text-[15px] leading-relaxed text-[var(--beast-ink-inverse-soft)]"
          style={{ animationDelay: "160ms" }}
        >
          Lock in the ${MONTHLY_PRICE_USD} Founding Member Rate for as long as your membership remains active.
        </p>

        <ul
          className="beast-fade-up mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[13px] text-[var(--beast-ink-inverse-soft)]"
          style={{ animationDelay: "190ms" }}
        >
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-[var(--beast-blue-bright)]" />
            30 days free
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-[var(--beast-blue-bright)]" />
            No credit card required
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-[var(--beast-blue-bright)]" />
            Cancel anytime
          </li>
        </ul>

        <div className="beast-fade-up mt-9" style={{ animationDelay: "220ms" }}>
          <Link
            href={TRIAL_URL}
            className="inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue-bright)]"
          >
            Start Your Free Trial
          </Link>
        </div>
      </div>
    </section>
  );
}
