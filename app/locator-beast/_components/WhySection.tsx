import Reveal from "./Reveal";

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
              Stop wasting time fighting your CRM. Start closing more leases.
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

          {/* Locator Beast — the highlighted "winner" column */}
          <Reveal delayMs={100}>
            <div className="h-full rounded-2xl border-2 border-[var(--beast-blue)] bg-white p-8 shadow-[0_0_60px_-15px_rgba(47,107,255,0.4),0_24px_50px_-24px_rgba(47,107,255,0.35)] md:p-10">
              <p className="text-center text-[30px] font-semibold tracking-tight text-[var(--beast-ink)]">
                Locator Beast
              </p>
              <ul className="mt-8 space-y-6">
                {LOCATOR_BEAST.map((item) => (
                  <li key={item} className="flex items-center gap-4">
                    <CheckIcon />
                    <span className="text-[17px] font-medium leading-snug text-[var(--beast-ink)] md:text-[18px]">
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
