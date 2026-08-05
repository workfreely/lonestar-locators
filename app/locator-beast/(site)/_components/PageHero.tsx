import type { ReactNode } from "react";

/**
 * Shared dark hero for interior pages (Features, Pricing, Contact, legal).
 * Same bg/glow/animation language as the homepage Hero, scaled down since
 * these pages aren't the primary conversion surface.
 */
export default function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="beast-glow relative overflow-hidden bg-[var(--beast-bg-dark)] pb-16 pt-14 text-white md:pb-20 md:pt-20">
      <div className="beast-container relative flex flex-col items-center text-center">
        {eyebrow && (
          <p className="beast-fade-up text-[13px] font-semibold uppercase tracking-[0.35em] text-[var(--beast-blue-bright)]">
            {eyebrow}
          </p>
        )}

        <h1
          className="beast-fade-up mt-4 max-w-3xl text-[36px] font-semibold leading-[1.1] tracking-tight sm:text-[46px] md:text-[54px]"
          style={{ animationDelay: "80ms" }}
        >
          {title}
        </h1>

        {subtitle && (
          <p
            className="beast-fade-up mt-5 max-w-xl text-[17px] leading-relaxed text-[var(--beast-ink-inverse-soft)] md:text-[18px]"
            style={{ animationDelay: "160ms" }}
          >
            {subtitle}
          </p>
        )}

        {children && (
          <div className="beast-fade-up mt-8" style={{ animationDelay: "220ms" }}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
