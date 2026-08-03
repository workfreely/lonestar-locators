import Link from "next/link";
import HomepageDemo from "../demo/_components/HomepageDemo";
import { AppleIcon, WindowsIcon } from "@/components/icons/PlatformIcons";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";

const TRUST_ITEMS = ["30-Day Free Trial", "No credit card required", "Setup in under 10 minutes"];

export default function Hero() {
  return (
    <section className="beast-glow relative overflow-hidden bg-[var(--beast-bg-dark)] pb-12 pt-10 text-white md:pb-28 md:pt-14">
      <div className="beast-container relative flex flex-col items-center text-center">
        <h1
          className="beast-fade-up max-w-4xl text-[40px] font-semibold leading-[1.08] tracking-tight sm:text-[56px] md:text-[68px]"
          style={{ animationDelay: "80ms" }}
        >
          Stop Losing Leads.
          <br />
          Close More Leases.
        </h1>

        <p
          className="beast-fade-up mt-6 max-w-2xl text-[18px] leading-relaxed text-[var(--beast-ink-inverse-soft)] md:text-[20px] lg:max-w-3xl lg:text-[19px] lg:[text-wrap:balance]"
          style={{ animationDelay: "160ms" }}
        >
          All-in-one platform built for apartment locators. Capture leads, manage clients, automate
          follow-ups, and close more leases with AI.
        </p>

        {/* The homepage demonstrates the product automatically — the interactive
            demo replaces the old hero video and ends on its own CTA + Replay.
            `id` + scroll-margin let the "Live Demo" nav link smooth-scroll here. */}
        <div
          id="live-demo"
          className="beast-fade-up mt-12 w-full scroll-mt-24"
          style={{ animationDelay: "240ms" }}
        >
          <HomepageDemo />
        </div>

        {/* Feature/benefit row — anchors the bottom of the hero beneath the
            demo's CTA. Same small text + blue separator dots as before. */}
        <ul
          className="beast-fade-up mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[15px] text-[var(--beast-ink-inverse-soft)] lg:mt-12"
          style={{ animationDelay: "380ms" }}
        >
          {TRUST_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-[5px] w-[5px] rounded-full bg-[var(--beast-blue-bright)]" />
              {item}
            </li>
          ))}
          {/* Supported desktop platforms — official monochrome glyphs that
              inherit the muted bullet text color (macOS listed first). */}
          <li className="flex items-center gap-2">
            <span className="h-[5px] w-[5px] rounded-full bg-[var(--beast-blue-bright)]" />
            <span className="inline-flex items-center gap-1.5">
              <AppleIcon className="h-4 w-auto" />
              macOS
            </span>
            <span className="inline-flex items-center gap-1.5">
              <WindowsIcon className="h-3.5 w-auto" />
              Windows
            </span>
          </li>
        </ul>

        {/* Mobile-only full-width CTA — gives phone visitors a clear next step
            after scrolling the stacked workflow steps, before the comparison. */}
        <Link
          href={TRIAL_URL}
          className="mt-10 block w-full rounded-full bg-[var(--beast-blue)] px-8 py-4 text-center text-[16px] font-semibold text-white transition-transform duration-200 active:scale-[0.99] lg:hidden"
        >
          Start Your 30-Day Free Trial
        </Link>
      </div>
    </section>
  );
}
