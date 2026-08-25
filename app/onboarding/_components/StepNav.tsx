export default function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  saving = false,
  nextVariant = "primary",
  spacing = "default",
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
  /** "ghost" is for steps where the nav action is NOT the main thing on screen —
   *  Connect Google owns the primary weight there, so its "Skip for now" must not
   *  compete with it. Defaults to "primary", so every other step is untouched. */
  nextVariant?: "primary" | "ghost";
  /** "tight" pulls the nav closer to the content above, for a step whose own
   *  action button already sits directly above it. Default is mt-6 — mt-9 left a visible band of dead space under the
   *  shorter of two columns. */
  spacing?: "default" | "tight";
}) {
  // Sized, not stretched: a full-width bar read as the loudest thing on the
  // screen. ~200px keeps it the obvious next action without dominating. Mobile
  // returns to full width, where a sized button beside a sized Back looks
  // arbitrary.
  // Primary: the filled pill this component has always rendered. Ghost: same
  // geometry and hit target, no fill — secondary without shrinking to a small,
  // hard-to-hit text link.
  const nextClass =
    nextVariant === "ghost"
      ? "w-full rounded-full border border-[var(--beast-border)] bg-transparent px-7 py-3 text-[14px] font-semibold text-[var(--beast-ink-soft)] transition-colors hover:bg-[#f7f8fa] hover:text-[var(--beast-ink)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-[200px]"
      : "w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01] hover:bg-[var(--beast-blue)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 sm:w-[200px]";

  return (
    <div
      className={`${spacing === "tight" ? "mt-4" : "mt-6"} flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between`}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`w-full rounded-full border border-[var(--beast-border)] font-semibold sm:w-auto text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa] ${
          nextVariant === "ghost" ? "px-6 py-3 text-[14px]" : "px-6 py-3.5 text-[15px]"
        }`}
        >
          Back
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || saving}
        className={nextClass}
      >
        {saving ? "Saving…" : nextLabel}
      </button>
    </div>
  );
}
