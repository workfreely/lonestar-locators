"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Reveal from "@/app/locator-beast/(site)/_components/Reveal";
import { ACADEMY_MODULES, type Access } from "@/app/locator-beast/(site)/academy/_data/modules";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";

const PRICING_URL = "/pricing";

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="currentColor" />
      <path d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="2" fill="none" />
      <circle cx="12" cy="15.5" r="1.4" fill="#0b0f1a" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="2" />
      <path d="M10 8.5l6 3.5-6 3.5v-7z" fill="currentColor" />
    </svg>
  );
}

// The visitor's real entitlement, resolved server-side by the page:
//   "none"  → logged-out / expired / canceled / past_due (everything locked)
//   "trial" → active free trial (trial-tier modules unlocked)
//   "paid"  → active subscription (everything unlocked)
export type AcademyAccess = "none" | "trial" | "paid";

/**
 * Academy modules. The lock vs play icon and the click behavior are derived from
 * the visitor's REAL access (the `access` prop) combined with each module's tier
 * (`module.access`) — never from the section alone:
 *   - playable → play icon; the lesson is unlocked (no upsell modal).
 *   - locked   → lock icon; clicking opens the tier-appropriate modal (start the
 *                free trial for trial-tier modules, or see plans for paid-tier).
 * The green "Included in Free Trial" / "Paid Members" pills always reflect the
 * module TIER (so logged-out visitors still see which modules the trial unlocks),
 * independent of the play/lock state.
 */
export default function AcademyModules({ access }: { access: AcademyAccess }) {
  const [modalTier, setModalTier] = useState<Access | null>(null);

  useEffect(() => {
    if (!modalTier) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalTier(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalTier]);

  return (
    <>
      {/* Pull the modules up into the hero's bottom padding (negative margin)
          and cut the section's own top padding, so Module 01 sits much closer
          to the hero — the first row of cards is visible on a 1440px desktop
          without scrolling — while the hero text and bottom rhythm stay generous. */}
      <div className="-mt-10 bg-[var(--beast-bg-dark)] md:-mt-14">
        <div className="beast-container space-y-14 pb-16 pt-8 md:space-y-20 md:pb-24 md:pt-10">
          {ACADEMY_MODULES.map((module, mi) => {
            // Pill reflects the module TIER (unchanged). The icon/click reflect
            // the visitor's REAL access: a trial-tier module is playable on an
            // active trial or paid plan; a paid-tier module only on a paid plan.
            const isTrial = module.access === "trial";
            const playable = access === "paid" || (isTrial && access === "trial");
            return (
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

                  {/* Lesson cards — tier-aware. align-items:stretch (grid default)
                      keeps cards in a row equal height even when longer titles wrap. */}
                  <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {module.lessons.map((lesson) => (
                      <button
                        key={lesson.slug}
                        type="button"
                        onClick={() => {
                          // Locked lessons open the tier upsell; unlocked lessons
                          // have no upsell (the visitor already has access).
                          if (!playable) setModalTier(module.access);
                        }}
                        aria-haspopup={playable ? undefined : "dialog"}
                        className="group flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition-colors hover:border-[var(--beast-blue)]/50 hover:bg-white/[0.06]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[var(--beast-blue)]/15 text-[var(--beast-blue-bright)]">
                            {playable ? <PlayIcon className="h-4 w-4" /> : <LockIcon className="h-4 w-4" />}
                          </span>
                          {isTrial ? (
                            <span className="flex-none rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                              Included in Free Trial
                            </span>
                          ) : (
                            <span className="flex-none rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60">
                              🔒 Paid Members
                            </span>
                          )}
                        </div>
                        <p className="mt-3 text-[14.5px] font-semibold leading-snug text-white">{lesson.title}</p>
                        <p className="mt-1 text-[12.5px] tabular-nums text-white/45">{lesson.durationMin} min</p>
                      </button>
                    ))}
                  </div>
                </section>
              </Reveal>
            );
          })}
        </div>
      </div>

      {/* Tier-aware access modal */}
      {modalTier && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={modalTier === "trial" ? "Start your free trial" : "Unlock the full Beast Academy"}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setModalTier(null)}
            className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1a] p-7 text-center shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--beast-blue)]/15 text-[var(--beast-blue-bright)]">
              {modalTier === "trial" ? <PlayIcon className="h-6 w-6" /> : <LockIcon className="h-6 w-6" />}
            </span>
            {modalTier === "trial" ? (
              <>
                <h3 className="mt-5 text-[19px] font-semibold text-white">Included in your free trial</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/65">
                  This lesson is included when you start your Locator Beast free trial. Start your trial to set up
                  Locator Beast and begin managing clients.
                </p>
                <Link
                  href={TRIAL_URL}
                  className="mt-6 block w-full rounded-full bg-[var(--beast-blue)] px-6 py-3 text-[14.5px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
                >
                  Start your free trial
                </Link>
              </>
            ) : (
              <>
                <h3 className="mt-5 text-[19px] font-semibold text-white">Included with a paid membership</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/65">
                  The full Beast Academy — including this lesson — is included with a paid Locator Beast membership.
                </p>
                <Link
                  href={PRICING_URL}
                  className="mt-6 block w-full rounded-full bg-[var(--beast-blue)] px-6 py-3 text-[14.5px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
                >
                  See membership plans
                </Link>
              </>
            )}
            <button
              type="button"
              onClick={() => setModalTier(null)}
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
