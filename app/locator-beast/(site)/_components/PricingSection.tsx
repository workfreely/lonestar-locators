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

        {/* The future standard price, EXPLICITLY LABELLED. A bare struck-through figure beside a
            live price reads as a discount off a price that was once charged — which would not be
            true, since nothing has ever billed at this amount. The label is what makes the framing
            honest, so it travels with the number rather than being styling. */}
        <p
          className="beast-fade-up mt-8 text-[15px] font-medium text-[var(--beast-ink-inverse-soft)]"
          style={{ animationDelay: "80ms" }}
        >
          Future standard price{" "}
          <span className="line-through">${STANDARD_PRICE_USD}/month</span>
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
          Founding member rate — lock in ${MONTHLY_PRICE_USD}/month for as long as your subscription stays active.
        </p>

        <div className="beast-fade-up mt-8 flex flex-col items-center" style={{ animationDelay: "190ms" }}>
          <Link
            href={TRIAL_URL}
            className="inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue-bright)]"
          >
            Start Your 7-Day Free Trial
          </Link>
          <p className="mt-3 text-[13px] text-[var(--beast-ink-inverse-soft)]">No credit card required</p>
        </div>
      </div>
    </section>
  );
}
