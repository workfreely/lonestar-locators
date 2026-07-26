import type { ReactNode } from "react";

export default function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="beast-fade-up w-full rounded-3xl border border-[var(--beast-border)] bg-white p-8 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.25)] sm:p-10">
      <h1 className="text-[26px] font-semibold tracking-tight text-[var(--beast-ink)]">{title}</h1>
      {subtitle && <p className="mt-2 text-[14px] text-[var(--beast-ink-soft)]">{subtitle}</p>}
      <div className="mt-8">{children}</div>
      {footer && <div className="mt-8 text-center text-[14px] text-[var(--beast-ink-soft)]">{footer}</div>}
    </div>
  );
}
