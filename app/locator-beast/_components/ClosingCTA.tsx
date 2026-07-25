import Link from "next/link";
import Reveal from "./Reveal";
import { TRIAL_URL } from "../_lib/site";

export default function ClosingCTA({
  title,
  subtitle,
  buttonLabel = "Start Your 30-Day Free Trial",
}: {
  title: React.ReactNode;
  subtitle?: string;
  buttonLabel?: string;
}) {
  return (
    <section className="beast-glow bg-[var(--beast-bg-dark)] py-20 text-white md:py-28">
      <div className="beast-container flex flex-col items-center text-center">
        <Reveal>
          <h2 className="max-w-2xl text-[32px] font-semibold leading-tight tracking-tight md:text-[44px]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-4 text-[16px] text-[var(--beast-ink-inverse-soft)]">{subtitle}</p>
          )}
        </Reveal>
        <Reveal delayMs={100}>
          <Link
            href={TRIAL_URL}
            className="mt-8 inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue-bright)]"
          >
            {buttonLabel}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
