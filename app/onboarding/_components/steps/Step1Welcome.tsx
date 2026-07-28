import { HiOutlineSparkles, HiOutlineClock } from "react-icons/hi2";
import StepCard from "../StepCard";
import type { StepProps } from "../../_lib/types";

export default function Step1Welcome({ onNext }: StepProps) {
  return (
    <StepCard>
      <div className="flex flex-col items-center text-center">
        <div className="beast-pop flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--beast-blue)]/10">
          <HiOutlineSparkles className="h-8 w-8 text-[var(--beast-blue)]" />
        </div>

        <h1 className="mt-6 text-[28px] font-semibold tracking-tight text-[var(--beast-ink)]">
          Welcome to Locator Beast
        </h1>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">
          Let&apos;s get your apartment locating business up and running.
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-2">
          <HiOutlineClock className="h-4 w-4 text-[var(--beast-blue)]" />
          <span className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
            Estimated setup time · <span className="text-[var(--beast-ink)]">Less than 5 minutes</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => onNext()}
          className="mt-9 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)]"
        >
          Get Started
        </button>
      </div>
    </StepCard>
  );
}
