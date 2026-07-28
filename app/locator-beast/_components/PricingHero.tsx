import Link from "next/link";
import { TRIAL_URL } from "../_lib/site";

export default function PricingHero() {
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

        <p
          className="beast-fade-up mt-9 text-[56px] font-semibold leading-none tracking-tight md:text-[64px]"
          style={{ animationDelay: "100ms" }}
        >
          $99
          <span className="text-[18px] font-medium text-[var(--beast-ink-inverse-soft)]">/month</span>
        </p>

        <ul
          className="beast-fade-up mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[13px] text-[var(--beast-ink-inverse-soft)]"
          style={{ animationDelay: "160ms" }}
        >
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-[var(--beast-blue-bright)]" />
            30-Day Free Trial
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-[var(--beast-blue-bright)]" />
            No credit card required
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
