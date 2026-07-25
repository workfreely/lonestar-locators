import {
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlineSparkles,
  HiOutlineSpeakerWave,
  HiOutlineCircleStack,
  HiOutlineCpuChip,
} from "react-icons/hi2";
import type { IconType } from "react-icons";
import Reveal from "./Reveal";
import { COMING_SOON_FEATURES } from "../_lib/features-data";

const ICONS: IconType[] = [
  HiOutlineMapPin,
  HiOutlineMicrophone,
  HiOutlineSparkles,
  HiOutlineSpeakerWave,
  HiOutlineCircleStack,
  HiOutlineCpuChip,
];

export default function ComingSoonSection() {
  return (
    <section className="bg-[#f7f8fa] py-20 md:py-28">
      <div className="beast-container">
        <Reveal>
          <h2 className="max-w-2xl text-[32px] font-semibold leading-tight tracking-tight text-[var(--beast-ink)] md:text-[42px]">
            Coming Soon
          </h2>
          <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-[var(--beast-ink-soft)]">
            Every future feature is included — no upgrades, no add-on pricing, ever.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON_FEATURES.map((feature, i) => {
            const Icon = ICONS[i];
            return (
              <Reveal key={feature.title} delayMs={(i % 3) * 80}>
                <div className="beast-hover-lift h-full rounded-2xl border border-[var(--beast-border)] bg-white p-6">
                  <div className="flex items-center justify-between">
                    <Icon className="h-6 w-6 text-[var(--beast-blue)]" />
                    <span className="rounded-full bg-[var(--beast-blue)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--beast-blue)]">
                      Coming Soon
                    </span>
                  </div>
                  <p className="mt-4 text-[16px] font-semibold text-[var(--beast-ink)]">{feature.title}</p>
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
