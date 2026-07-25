import Link from "next/link";
import DemoVideo from "./DemoVideo";
import { DEMO_URL, SITE_TAGLINE, TRIAL_URL } from "../_lib/site";

const TRUST_ITEMS = [
  "30-Day Free Trial",
  "No credit card required",
  "Setup in under 30 minutes",
  "Windows & Mac",
];

export default function Hero() {
  return (
    <section className="beast-glow relative overflow-hidden bg-[var(--beast-bg-dark)] pb-20 pt-10 text-white md:pb-28 md:pt-14">
      <div className="beast-container relative flex flex-col items-center text-center">
        <p className="beast-fade-up text-[13px] font-semibold uppercase tracking-[0.35em] text-[var(--beast-blue-bright)]">
          {SITE_TAGLINE}
        </p>

        <h1
          className="beast-fade-up mt-6 max-w-4xl text-[40px] font-semibold leading-[1.08] tracking-tight sm:text-[56px] md:text-[68px]"
          style={{ animationDelay: "80ms" }}
        >
          Become a Beast at
          <br />
          Apartment Locating.
        </h1>

        <div className="beast-fade-up mt-10 flex w-full justify-center" style={{ animationDelay: "140ms" }}>
          <DemoVideo />
        </div>

        <p
          className="beast-fade-up mt-10 max-w-xl text-[18px] leading-relaxed text-[var(--beast-ink-inverse-soft)] md:text-[20px]"
          style={{ animationDelay: "200ms" }}
        >
          The operating system built exclusively for apartment locators.
        </p>

        <p
          className="beast-fade-up mt-3 max-w-lg text-[15px] leading-relaxed text-[var(--beast-ink-inverse-soft)]"
          style={{ animationDelay: "260ms" }}
        >
          Replace Trello, Google Forms, spreadsheets, sticky notes, and disconnected tools with
          one desktop application.
        </p>

        <div
          className="beast-fade-up mt-10 flex flex-col items-center gap-4 sm:flex-row"
          style={{ animationDelay: "320ms" }}
        >
          <Link
            href={TRIAL_URL}
            className="rounded-full bg-[var(--beast-blue)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue-bright)]"
          >
            Start Your 30-Day Free Trial
          </Link>
          <Link
            href={DEMO_URL}
            className="rounded-full border border-white/20 px-7 py-3.5 text-[15px] font-semibold text-white/90 transition-colors duration-300 hover:border-white/40 hover:text-white"
          >
            Watch Demo
          </Link>
        </div>

        <ul
          className="beast-fade-up mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[13px] text-[var(--beast-ink-inverse-soft)]"
          style={{ animationDelay: "380ms" }}
        >
          {TRUST_ITEMS.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[var(--beast-blue-bright)]" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
