import Reveal from "./Reveal";

const OUTCOMES = [
  {
    title: "Never wonder what's next.",
    body: "A proven workflow guides every lead from first contact to signed lease, so nothing slips through the cracks.",
  },
  {
    title: "Run your business from one place.",
    body: "CRM, phone, calendar, contacts, and follow-ups live in a single application instead of five disconnected tools.",
  },
  {
    title: "Built for how you actually work.",
    body: "Every screen assumes you're an apartment locator — not a generic agent squeezing a workflow that doesn't fit.",
  },
];

export default function WhySection() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="beast-container">
        <Reveal>
          <h2 className="max-w-2xl text-[32px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
            Why Locator Beast?
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {OUTCOMES.map((outcome, i) => (
            <Reveal key={outcome.title} delayMs={i * 100}>
              <div>
                <p className="text-[20px] font-semibold leading-snug text-[var(--beast-ink)]">
                  {outcome.title}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">
                  {outcome.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
