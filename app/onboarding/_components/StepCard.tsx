import type { ReactNode } from "react";

export default function StepCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="beast-fade-up w-full rounded-3xl border border-[var(--beast-border)] bg-white p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.25)] sm:p-10">
      {eyebrow && (
        <p className="text-[12px] font-semibold uppercase tracking-[0.25em] text-[var(--beast-blue)]">
          {eyebrow}
        </p>
      )}
      <h1 className={`text-[26px] font-semibold tracking-tight text-[var(--beast-ink)] ${eyebrow ? "mt-2" : ""}`}>
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}
