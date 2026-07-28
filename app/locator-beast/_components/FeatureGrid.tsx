import {
  HiOutlineBolt,
  HiOutlineUsers,
  HiOutlinePhone,
  HiOutlineDocumentText,
  HiOutlineSparkles,
  HiOutlineIdentification,
  HiOutlineCalendarDays,
  HiOutlineChartBar,
  HiOutlineListBullet,
  HiOutlineDocumentDuplicate,
  HiOutlineChartPie,
} from "react-icons/hi2";
import type { IconType } from "react-icons";
import Reveal from "./Reveal";

const FEATURES: { icon: IconType; title: string; body: string; comingSoon?: boolean }[] = [
  { icon: HiOutlineBolt, title: "Workflow Engine", body: "The heart of Locator Beast — the next step, every time." },
  { icon: HiOutlineUsers, title: "CRM", body: "Every client and every conversation, organized automatically." },
  { icon: HiOutlinePhone, title: "Phone Sync", body: "Use your existing number. Every call and text stays logged." },
  { icon: HiOutlineDocumentText, title: "Smart Lead Pages", body: "Capture leads the moment they come in, no manual entry." },
  { icon: HiOutlineSparkles, title: "AI Client Insights", body: "Know who's ready to close and who needs a nudge." },
  { icon: HiOutlineIdentification, title: "Google Contacts", body: "New clients are added to your contacts automatically." },
  { icon: HiOutlineCalendarDays, title: "Google Calendar", body: "Tours and follow-ups sync straight to your calendar." },
  { icon: HiOutlineChartBar, title: "Performance Dashboard", body: "See exactly where every deal stands, at a glance." },
  { icon: HiOutlineListBullet, title: "Agenda", body: "Your day, laid out — no more digging through notes." },
  { icon: HiOutlineDocumentDuplicate, title: "Templates", body: "Reusable messages that keep every follow-up consistent." },
  { icon: HiOutlineChartPie, title: "Analytics", body: "Understand what's actually driving your closed leases." },
];

export default function FeatureGrid() {
  return (
    <section className="bg-[#f7f8fa] py-20 md:py-28">
      <div className="beast-container">
        <Reveal>
          <h2 className="max-w-2xl text-[32px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
            Everything you need.
            <br />
            Nothing you don&apos;t.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delayMs={(i % 3) * 80}>
              <div className="beast-hover-lift h-full rounded-2xl border border-[var(--beast-border)] bg-white p-6">
                <div className="flex items-center justify-between">
                  <feature.icon className="h-6 w-6 text-[var(--beast-blue)]" />
                  {feature.comingSoon && (
                    <span className="rounded-full bg-[var(--beast-blue)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--beast-blue)]">
                      Coming Soon
                    </span>
                  )}
                </div>
                <p className="mt-4 text-[16px] font-semibold text-[var(--beast-ink)]">
                  {feature.title}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
                  {feature.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
