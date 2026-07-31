"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Reveal from "@/app/locator-beast/_components/Reveal";
import { ACADEMY_MODULES } from "@/app/locator-beast/academy/_data/modules";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="currentColor" />
      <path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="15.5" r="1.4" fill="#0b0f1a" />
    </svg>
  );
}

// Every Academy lesson is members-only. A locked card opens this modal rather
// than navigating anywhere — Academy is premium content unlocked by a trial.
export default function AcademyModules() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="bg-[var(--beast-bg-dark)]">
        <div className="beast-container space-y-14 py-16 md:space-y-20 md:py-24">
          {ACADEMY_MODULES.map((module, mi) => (
            <Reveal key={module.slug}>
              <section>
                {/* Module header — numbered because the modules are a learning path. */}
                <div className="flex items-start gap-4">
                  <span className="mt-1 text-[15px] font-bold tabular-nums text-[var(--beast-blue-bright)]">
                    {String(mi + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h2 className="text-[22px] font-semibold text-white md:text-[26px]">{module.title}</h2>
                    <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-white/60">
                      {module.description}
                    </p>
                  </div>
                </div>

                {/* Locked lesson cards */}
                <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {module.lessons.map((lesson) => (
                    <button
                      key={lesson.slug}
                      type="button"
                      onClick={() => setOpen(true)}
                      aria-haspopup="dialog"
                      className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--beast-blue)]/15 text-[var(--beast-blue-bright)]">
                          <LockIcon className="h-4 w-4" />
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60">
                          🔒 Members Only
                        </span>
                      </div>
                      <p className="mt-3 text-[14.5px] font-semibold text-white">{lesson.title}</p>
                      <p className="mt-1 text-[12.5px] tabular-nums text-white/45">{lesson.durationMin} min</p>
                    </button>
                  ))}
                </div>
              </section>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Members-only modal */}
      {open && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Unlock Beast Academy"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1a] p-7 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--beast-blue)]/15 text-[var(--beast-blue-bright)]">
              <LockIcon className="h-6 w-6" />
            </span>
            <h3 className="mt-5 text-[19px] font-semibold text-white">Beast Academy is members only</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-white/65">
              Every lesson is included with your Locator Beast membership. Start your free trial to unlock the full
              Academy.
            </p>
            <Link
              href={TRIAL_URL}
              className="mt-6 block w-full rounded-full bg-[var(--beast-blue)] px-6 py-3 text-[14.5px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
            >
              Start your free trial
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 text-[13px] font-medium text-white/50 transition-colors hover:text-white"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </>
  );
}
