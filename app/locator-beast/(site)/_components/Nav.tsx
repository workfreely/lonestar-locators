"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/crm/Logo";
import { NAV_LINKS, TRIAL_URL } from "@/app/locator-beast/_lib/site";

export default function Nav() {
  const [open, setOpen] = useState(false);

  // PURE BLACK navigation bar (#000000) — flat and fully opaque. Deliberately
  // NOT translucent, NOT blurred, and NOT a CRM token: the marketing site renders
  // outside ThemeProvider, so a token would let a CRM theme preference bleed into
  // public pages, and translucency made the bar pick up whatever scrolled beneath
  // it instead of holding one constant brand surface.
  //
  // Only the BAR is black — every section below it keeps exactly the background
  // it has today.
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black">
      <div className="beast-container flex h-16 items-center justify-between md:h-20">
        <Link href="/" aria-label="Locator Beast home" className="flex items-center" onClick={() => setOpen(false)}>
          {/* Canonical brand mark — the shared Logo component on the dark
              treatment, so the public nav and every product header show the same
              white wordmark from one source. Sizing stays the marketing family's
              approved 40px: this bar is h-16/h-20, and the admin header's 28px
              reads far too small in it. */}
          <Logo tone="dark" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[15px] font-medium text-white/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-5 md:flex">
          <Link
            href="/login"
            className="text-[15px] font-medium text-white/70 transition-colors hover:text-white"
          >
            Log In
          </Link>
          <Link
            href={TRIAL_URL}
            className="rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0b0f1a] transition-all duration-300 hover:scale-[1.03] hover:bg-[#e6e9f0]"
          >
            Start Free Trial
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 md:hidden"
        >
          <span className="relative block h-3.5 w-4">
            <span
              className={`absolute left-0 top-0 h-[1.5px] w-4 bg-white transition-transform ${open ? "translate-y-[6px] rotate-45" : ""}`}
            />
            <span
              className={`absolute left-0 bottom-0 h-[1.5px] w-4 bg-white transition-transform ${open ? "-translate-y-[6px] -rotate-45" : ""}`}
            />
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[#0b0f1a] px-6 py-6 md:hidden">
          <nav className="flex flex-col gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-[15px] font-medium text-white/70"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-2 text-[15px] font-medium text-white/70"
            >
              Log In
            </Link>
            <Link
              href={TRIAL_URL}
              onClick={() => setOpen(false)}
              className="rounded-full bg-white px-5 py-3 text-center text-[14px] font-semibold text-[#0b0f1a] transition-colors hover:bg-[#e6e9f0]"
            >
              Start Free Trial
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
