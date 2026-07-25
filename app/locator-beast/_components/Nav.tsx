"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LOGO_FOR_LIGHT_BG, NAV_LINKS, TRIAL_URL } from "../_lib/site";

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--beast-border)] bg-white/80 backdrop-blur-md">
      <div className="beast-container flex h-16 items-center justify-between md:h-20">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Image
            src={LOGO_FOR_LIGHT_BG}
            alt="Locator Beast"
            width={172}
            height={40}
            priority
            style={{ height: "28px", width: "auto" }}
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[15px] font-medium text-[var(--beast-ink-soft)] transition-colors hover:text-[var(--beast-ink)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href={TRIAL_URL}
            className="rounded-full bg-[var(--beast-ink)] px-5 py-2.5 text-[14px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue)]"
          >
            Start Free Trial
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--beast-border)] md:hidden"
        >
          <span className="relative block h-3.5 w-4">
            <span
              className={`absolute left-0 top-0 h-[1.5px] w-4 bg-[var(--beast-ink)] transition-transform ${open ? "translate-y-[6px] rotate-45" : ""}`}
            />
            <span
              className={`absolute left-0 bottom-0 h-[1.5px] w-4 bg-[var(--beast-ink)] transition-transform ${open ? "-translate-y-[6px] -rotate-45" : ""}`}
            />
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-[var(--beast-border)] bg-white px-6 py-6 md:hidden">
          <nav className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-[15px] font-medium text-[var(--beast-ink-soft)]"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href={TRIAL_URL}
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-[var(--beast-ink)] px-5 py-3 text-center text-[14px] font-semibold text-white"
            >
              Start Free Trial
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
