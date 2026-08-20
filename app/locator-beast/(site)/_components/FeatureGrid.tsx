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
import { FEATURES } from "@/app/locator-beast/_lib/features-data";
import Reveal from "./Reveal";

// Titles + one-liners come from the ONE shared feature list; this file owns only
// the icon for each, keyed by title. That keeps the icon system exactly as it was
// while making it impossible for the homepage and /features to say different
// things about the same feature.
const ICONS: Record<string, IconType> = {
  "Workflow Engine": HiOutlineBolt,
  "AI-powered CRM": HiOutlineUsers,
  "Beast Sync": HiOutlinePhone,
  "Smart Lead Forms": HiOutlineDocumentText,
  "AI Client Insights": HiOutlineSparkles,
  "Google Contacts": HiOutlineIdentification,
  "Google Calendar": HiOutlineCalendarDays,
  "Analytics Dashboard": HiOutlineChartBar,
  "Agenda": HiOutlineListBullet,
  "Templates": HiOutlineDocumentDuplicate,
  "Meta + Instagram Ads": HiOutlineChartPie,
};

export default function FeatureGrid() {
  return (
    <section className="bg-[#f7f8fa] py-20 md:py-28">
      <div className="beast-container">
        <Reveal>
          <h2 className="mx-auto max-w-2xl text-center text-[32px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
            Everything you need.
            <br />
            Nothing you don&apos;t.
          </h2>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => {
            const Icon = ICONS[feature.title];
            return (
            <Reveal key={feature.title} delayMs={(i % 3) * 80}>
              <div className="beast-hover-lift h-full rounded-2xl border border-[var(--beast-border)] bg-white p-6">
                <div className="flex items-center gap-3">
                  {Icon && <Icon className="h-8 w-8 shrink-0 text-[var(--beast-blue)]" />}
                  <p className="text-[18px] font-semibold text-[var(--beast-ink)]">
                    {feature.title}
                  </p>
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
                  {feature.body}
                </p>
              </div>
            </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
