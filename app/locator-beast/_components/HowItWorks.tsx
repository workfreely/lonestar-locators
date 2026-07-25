import Reveal from "./Reveal";

const STEPS = [
  { title: "Start your free trial", body: "Sign up in minutes — no credit card required." },
  { title: "Connect your phone number", body: "Keep your existing number. Every call and text syncs in." },
  { title: "Sync Google Contacts & Calendar", body: "Your existing tools plug in instead of getting replaced." },
  { title: "Capture your leads", body: "Smart Lead Pages start collecting leads automatically." },
  { title: "Follow the guided workflow", body: "The Workflow Engine tells you the next step, every time." },
  { title: "Track every deal", body: "Watch leads move from first contact to signed lease." },
  { title: "Close more, consistently", body: "A repeatable process replaces guesswork with results." },
];

export default function HowItWorks() {
  return (
    <section className="bg-[#f7f8fa] py-20 md:py-28">
      <div className="beast-container">
        <Reveal>
          <h2 className="max-w-2xl text-[32px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
            How it works
          </h2>
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-[var(--beast-ink-soft)]">
            Seven steps from sign-up to a business that runs on autopilot.
          </p>
        </Reveal>

        <ol className="mt-14 flex flex-col divide-y divide-[var(--beast-border)] border-y border-[var(--beast-border)]">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delayMs={(i % 4) * 60}>
              <li className="flex flex-col gap-2 py-6 sm:flex-row sm:items-baseline sm:gap-8 md:py-7">
                <span className="text-[13px] font-semibold tabular-nums text-[var(--beast-blue)] sm:w-10">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-[17px] font-semibold text-[var(--beast-ink)]">{step.title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
                    {step.body}
                  </p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
