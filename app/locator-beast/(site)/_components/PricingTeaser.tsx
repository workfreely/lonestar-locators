import Link from "next/link";
import Reveal from "./Reveal";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";
import { MONTHLY_PRICE_USD, STANDARD_PRICE_USD } from "@/lib/billing/trial";

const INCLUDED = [
  "Everything included",
  "No feature restrictions",
  "No confusing pricing",
  "Every future feature included",
];

export default function PricingTeaser() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="beast-container flex justify-center">
        <Reveal className="w-full max-w-xl">
          <div className="beast-hover-lift rounded-3xl border border-[var(--beast-border)] bg-[#f7f8fa] p-10 text-center md:p-14">
            <p className="text-[13px] font-semibold uppercase tracking-[0.3em] text-[var(--beast-blue)]">
              Founding Membership
            </p>
            <p className="mt-6 text-[20px] font-medium text-[var(--beast-ink-soft)] line-through">
              ${STANDARD_PRICE_USD}/month
            </p>
            <p className="mt-1 text-[56px] font-semibold leading-none tracking-tight text-[var(--beast-ink)]">
              ${MONTHLY_PRICE_USD}
              <span className="text-[18px] font-medium text-[var(--beast-ink-soft)]">/month</span>
            </p>
            <p className="mx-auto mt-4 max-w-sm text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
              Lock in the ${MONTHLY_PRICE_USD} Founding Member Rate for as long as your membership remains active.
            </p>
            <p className="mt-3 text-[13px] text-[var(--beast-ink-soft)]">30 days free • No credit card required • Cancel anytime</p>

            <ul className="mx-auto mt-8 flex max-w-xs flex-col gap-3 text-left">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[14px] font-medium text-[var(--beast-ink)]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--beast-blue)]" />
                  {item}
                </li>
              ))}
            </ul>

            <Link
              href={TRIAL_URL}
              className="mt-10 inline-block rounded-full bg-[var(--beast-ink)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue)]"
            >
              Start Your 30-Day Free Trial
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
