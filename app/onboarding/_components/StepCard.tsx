import type { ReactNode } from "react";

export default function StepCard({
  eyebrow,
  title,
  subtitle,
  tightTop = false,
  children,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** Opt-in: start the header a little higher in the card. Business Profile
   *  uses it because its two-column body makes the default top padding read as
   *  dead space; defaults to false so every other step is unchanged.
   *
   *  This prop briefly ALSO put the label inline with the title. That layout was
   *  reverted — a left label beside a left title fought the centred two-column
   *  form beneath it — so only the spacing part remains. */
  tightTop?: boolean;
  children: ReactNode;
}) {
  // The step label is defined ONCE, so STEP 1 … STEP 4 are necessarily
  // identical — there is no per-step copy that could drift. 13px/bold with eased
  // tracking; the blue and the uppercasing are unchanged. It sits at the card's
  // upper-left on every step, with the title centred beneath it.
  const eyebrowClass =
    "text-[13px] font-bold uppercase tracking-[0.22em] text-[var(--beast-blue)]";
  const titleClass = "text-[26px] font-semibold tracking-tight text-[var(--beast-ink)]";

  return (
    <div
      className={`beast-fade-up w-full rounded-3xl border border-[var(--beast-border)] bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.25)] ${
        // Business Profile's body is two columns, which reads as wider and
        // shorter than the other steps — the default top padding left a visible
        // band above it.
        tightTop ? "p-8 pt-7 sm:p-10 sm:pt-8" : "p-8 sm:p-10"
      }`}
    >
      {eyebrow && <p className={eyebrowClass}>{eyebrow}</p>}
      {/* On the tightTop step the title is pulled up onto the label's row: the
          label sits at the far left, the title stays centred across the card, so
          they read as one header band without ever being adjacent. Desktop only
          — at mobile widths the centred title would collide with the label, so
          below sm it keeps the normal stacked mt-2. */}
      {title && (
        <h1 className={`${titleClass} ${eyebrow ? "mt-2" : ""} ${tightTop && eyebrow ? "sm:-mt-6" : ""}`}>
          {title}
        </h1>
      )}
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">{subtitle}</p>}
      {/* The separation between the header and the content is the one gap that
          should be generous — it is what tells you the heading has ended and the
          work begins. */}
      <div className={subtitle ? "mt-10" : "mt-9"}>{children}</div>
    </div>
  );
}
