import Reveal from "./Reveal";

const POINTS = [
  "Never forget another follow-up",
  "Capture leads automatically",
  "Use your existing phone number",
  "AI-powered workflow, built in",
];

export default function BuiltByLocators() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="beast-container grid gap-12 md:grid-cols-2 md:items-center md:gap-16">
        <Reveal>
          <h2 className="text-[32px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
            Built by locators.
            <br />
            For locators.
          </h2>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-[var(--beast-ink-soft)]">
            This isn&apos;t a generic real estate CRM with a few fields renamed. Locator Beast is
            built exclusively for the apartment locating business — from lead to lease.
          </p>
        </Reveal>

        <Reveal delayMs={120}>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] p-4 text-[14px] font-medium text-[var(--beast-ink)]"
              >
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--beast-blue)]" />
                {point}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
