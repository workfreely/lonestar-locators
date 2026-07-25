import { HiOutlineCheck } from "react-icons/hi2";
import StepCard from "../StepCard";

export default function Step7Success({ onFinish, saving }: { onFinish: () => void; saving: boolean }) {
  return (
    <StepCard>
      <div className="flex flex-col items-center text-center">
        <div className="beast-pop flex h-16 w-16 items-center justify-center rounded-full bg-[var(--beast-blue)]">
          <HiOutlineCheck className="h-8 w-8 text-white" strokeWidth={3} />
        </div>

        <h1 className="mt-6 text-[28px] font-semibold tracking-tight text-[var(--beast-ink)]">
          You&apos;re officially a Locator Beast.
        </h1>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">
          Your workspace is ready. Let&apos;s close some deals.
        </p>

        <button
          type="button"
          onClick={onFinish}
          disabled={saving}
          className="mt-9 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:opacity-60"
        >
          {saving ? "Opening…" : "Open My Dashboard"}
        </button>
      </div>
    </StepCard>
  );
}
