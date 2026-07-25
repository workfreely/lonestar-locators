import { HiOutlineCheckCircle } from "react-icons/hi2";
import Reveal from "./Reveal";

const INCLUDED = [
  "Workflow Engine",
  "CRM",
  "AI Client Insights",
  "Landing Pages",
  "Phone Sync",
  "Google Calendar",
  "Google Contacts",
  "Performance Dashboard",
  "Templates",
  "Analytics",
  "Unlimited Leads",
  "Unlimited Clients",
  "Future Updates",
  "Every Future Feature Included",
];

export default function IncludedChecklist() {
  return (
    <section className="bg-white py-20 md:py-28">
      <div className="beast-container">
        <Reveal>
          <h2 className="max-w-2xl text-[32px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
            What&apos;s included
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INCLUDED.map((item, i) => (
            <Reveal key={item} delayMs={(i % 6) * 50}>
              <div className="flex items-center gap-3 rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3.5">
                <HiOutlineCheckCircle className="h-5 w-5 shrink-0 text-[var(--beast-blue)]" />
                <span className="text-[14px] font-medium text-[var(--beast-ink)]">{item}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
