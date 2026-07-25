export default function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  saving = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="mt-9 flex items-center gap-3">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-[var(--beast-border)] px-6 py-3.5 text-[15px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa]"
        >
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || saving}
        className="flex-1 rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01] hover:bg-[var(--beast-blue)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
      >
        {saving ? "Saving…" : nextLabel}
      </button>
    </div>
  );
}
