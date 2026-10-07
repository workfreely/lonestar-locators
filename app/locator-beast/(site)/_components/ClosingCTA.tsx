import Link from "next/link";
import Reveal from "./Reveal";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";

export default function ClosingCTA({
  title,
  subtitle,
  buttonLabel = "Start Your 7-Day Free Trial",
  noCardNote = false,
}: {
  title: React.ReactNode;
  subtitle?: string;
  buttonLabel?: string;
  /** Show the subtle "No credit card needed" line beneath the button. */
  noCardNote?: boolean;
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
        <Reveal delayMs={100} className="mt-8 flex flex-col items-center">
          <Link
            href={TRIAL_URL}
            className="inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue-bright)]"
          >
            {buttonLabel}
          </Link>
          {noCardNote && (
            <p className="mt-3 text-[13px] text-[var(--beast-ink-inverse-soft)]">No credit card needed</p>
          )}
        </Reveal>
      </div>
    </section>
  );
}
