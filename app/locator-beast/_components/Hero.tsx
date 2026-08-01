import HomepageDemo from "../demo/_components/HomepageDemo";
import { SITE_TAGLINE } from "../_lib/site";

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
          Stop Losing Leads.
          <br />
          Close More Leases.
        </h1>

        <p
          className="beast-fade-up mt-6 max-w-2xl text-[18px] leading-relaxed text-[var(--beast-ink-inverse-soft)] md:text-[20px]"
          style={{ animationDelay: "160ms" }}
        >
          Manage leads, automate follow-ups, build Smart Lead Forms, and grow your apartment
          locating business from one modern workspace.
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
      </div>
    </section>
  );
}
