import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import "../locator-beast/beast.css";
import { LOGO_FOR_LIGHT_BG } from "../locator-beast/_lib/site";

const inter = Inter({
  subsets: ["latin"],
  variable: "--beast-font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Locator Beast",
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`beast-root ${inter.variable} items-center justify-center px-4 py-12`}
      style={{ backgroundColor: "#f7f8fa" }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <Image
          src={LOGO_FOR_LIGHT_BG}
          alt="Locator Beast"
          width={172}
          height={40}
          style={{ height: "28px", width: "auto" }}
          className="mb-10"
        />
        {children}

        {/* Lightweight auth footer — legal + support only. No marketing nav. */}
        <nav className="mt-8 flex items-center gap-2.5 text-[13px] text-[var(--beast-ink-soft)]">
          <Link href="/privacy" className="transition-colors hover:text-[var(--beast-ink)]">
            Privacy
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/terms" className="transition-colors hover:text-[var(--beast-ink)]">
            Terms
          </Link>
          <span aria-hidden="true">•</span>
          <Link href="/support" className="transition-colors hover:text-[var(--beast-ink)]">
            Support
          </Link>
        </nav>
      </div>
    </div>
  );
}
