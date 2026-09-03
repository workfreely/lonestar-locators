import Reveal from "./Reveal";
import LocatorBeastWordmark from "@/components/brand/LocatorBeastWordmark";

const TRADITIONAL_CRM = [
  "Built for general real estate",
  "Manual follow-up",
  "Leads slip through the cracks",
  "Guess what to do next",
  "Multiple disconnected tools",
  "Generic sales pipeline",
];

const LOCATOR_BEAST = [
  "Built for apartment locators",
  "Automate your entire workflow",
  "Never miss another follow-up",
  "Always know your next step",
  "Capture every lead automatically",
  "Close more deals with AI",
];

function XIcon() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(197,34,42,0.1)]">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="#c5222a"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function CheckIcon() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(21,128,61,0.13)]">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M5 12.5l4.5 4.5L19 7"
          stroke="#15803d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function WhySection() {
  return (
    <section className="bg-white pt-12 pb-20 md:py-28">
      <div className="beast-container">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(21px,6.7vw,32px)] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
              <span className="whitespace-nowrap">Why Apartment Locators</span>
              <br />
              <span className="whitespace-nowrap">Switch to Locator Beast</span>
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[var(--beast-ink-soft)] md:text-[18px]">
              <span className="md:hidden">Stop wasting time. Start closing more leases.</span>
              <span className="hidden md:inline">
                Stop wasting time fighting your CRM. Start closing more leases.
              </span>
            </p>
          </div>
        </Reveal>

        <div className="mx-auto mt-8 grid max-w-4xl gap-6 md:mt-14 md:grid-cols-2 md:gap-8">
          {/* Traditional CRM — the muted "before" column */}
          <Reveal>
            <div className="h-full rounded-2xl border border-[var(--beast-border)] bg-[#f7f8fa] p-8 md:p-10">
              <p className="text-center text-[30px] font-semibold tracking-tight text-[var(--beast-ink-soft)]">
                Generic CRM
              </p>
              <ul className="mt-8 space-y-6">
                {TRADITIONAL_CRM.map((item) => (
                  <li key={item} className="flex items-center gap-4">
                    <XIcon />
                    <span className="text-[17px] leading-snug text-[var(--beast-ink-soft)] md:text-[18px]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* Locator Beast — the highlighted "winner" column, now on the dark
              brand surface so the wordmark reads as the same white lockup used
              in every navigation bar. Deep navy (#0D1B3A) rather than the near-black
              used by the nav — the card should read as BLUE next to the light
              Generic CRM column, not as another black panel. Only the fill and the
              text colour change:
              the blue border, the two-layer blue glow, padding, dimensions,
              bullet rows, icons and CTA behaviour are all untouched. */}
          <Reveal delayMs={100}>
            <div className="beast-glow h-full rounded-2xl border-2 border-[var(--beast-blue)] bg-[#0D1B3A] p-8 shadow-[0_0_60px_-15px_rgba(47,107,255,0.4),0_24px_50px_-24px_rgba(47,107,255,0.35)] md:p-10">
              {/* The full black wordmark stands in for the text heading here —
                  ONLY on this card; "Generic CRM" opposite stays text.

                  44px is not arbitrary: the wordmark's letterforms are 52.2% of
                  the artwork's ink height, so 44px puts them at ~23px cap
                  height — the same cap height as the 30px semibold heading
                  opposite. The letters match; the pin simply adds presence to
                  the highlighted column.

                  White variant, because the card is now the dark brand surface —
                  the black wordmark would be invisible on it, and the black full
                  logo is reserved for /login and /signup.

                  The row is pinned to h-[45px], the heading's own line box, so
                  both cards' lists still start on the same line. At every
                  two-column width "Generic CRM" is a single 45px line, and
                  below md the cards stack, where cross-card alignment no longer
                  applies. */}
              <div className="flex h-[45px] items-center justify-center">
                <LocatorBeastWordmark variant="white" height={44} />
              </div>
              <ul className="mt-8 space-y-6">
                {LOCATOR_BEAST.map((item) => (
                  <li key={item} className="flex items-center gap-4">
                    <CheckIcon />
                    <span className="text-[17px] font-medium leading-snug text-white md:text-[18px]">
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
