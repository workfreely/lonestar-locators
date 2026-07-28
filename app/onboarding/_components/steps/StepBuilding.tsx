"use client";

import { useEffect, useRef, useState } from "react";
import { HiOutlineCheck } from "react-icons/hi2";

// Each line reads like Locator Beast is doing real work for the user.
const BUILD_STEPS = [
  "Creating your CRM",
  "Building your Smart Lead Form",
  "Creating your Landing Page",
  "Configuring AI",
  "Creating Follow-up Workflows",
  "Generating Your Share Link",
  "Preparing Demo Workspace",
  "Generating Analytics",
  "Almost Ready…",
];

const REVEAL_MS = 420;

export default function StepBuilding({ onFinish }: { onFinish: () => void }) {
  const [revealed, setRevealed] = useState(0);
  const finished = useRef(false);

  useEffect(() => {
    // Once every line is checked off, pause a beat, then open the workspace.
    if (revealed >= BUILD_STEPS.length) {
      const t = setTimeout(() => {
        if (!finished.current) {
          finished.current = true;
          onFinish();
        }
      }, 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed((r) => r + 1), REVEAL_MS);
    return () => clearTimeout(t);
  }, [revealed, onFinish]);

  const progress = Math.round((revealed / BUILD_STEPS.length) * 100);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="beast-fade-up w-full max-w-xl">
        <div className="flex flex-col items-center text-center">
          <div className="beast-pop text-[72px] leading-none">🚀</div>
          <h1 className="mt-6 text-[40px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)]">
            Building Your Business…
          </h1>
          <p className="mt-3 text-[17px] leading-relaxed text-[var(--beast-ink-soft)]">
            Hang tight — we&apos;re setting up your entire apartment locating business.
          </p>
        </div>

        {/* Progress bar advances as each line completes */}
        <div className="mt-10 h-2.5 w-full overflow-hidden rounded-full bg-[var(--beast-border)]">
          <div
            className="h-full rounded-full bg-[var(--beast-blue)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ul className="mx-auto mt-10 flex max-w-md flex-col gap-4">
          {BUILD_STEPS.map((label, i) => {
            const done = i < revealed;
            const active = i === revealed;
            return (
              <li
                key={label}
                className={`flex items-center gap-4 transition-opacity duration-500 ${
                  done || active ? "opacity-100" : "opacity-40"
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
                    done
                      ? "border-[#16a34a] bg-[#16a34a]"
                      : active
                        ? "border-[var(--beast-blue)] bg-white"
                        : "border-[var(--beast-border)] bg-white"
                  }`}
                >
                  {done ? (
                    <HiOutlineCheck className="beast-pop h-5 w-5 text-white" strokeWidth={3} />
                  ) : active ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--beast-blue)] border-t-transparent" />
                  ) : null}
                </span>
                <span
                  className={`text-[17px] ${
                    done || active ? "font-semibold text-[var(--beast-ink)]" : "font-medium text-[var(--beast-ink-soft)]"
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
