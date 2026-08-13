"use client";

import { HiOutlinePuzzlePiece, HiOutlineComputerDesktop } from "react-icons/hi2";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import type { StepProps } from "../../_lib/types";

// Introduces Locator Beast's two companion tools. This is an INTRODUCTION step
// only — it never installs anything, never fakes a connected state, and never
// blocks onboarding. Setup lives in Settings → Integrations, which the locator
// reaches after onboarding. Availability copy is intentionally honest (the
// browser extension + desktop app have no self-serve install flow yet).
export default function StepTools({ onNext, onBack, saving }: StepProps) {
  const tools = [
    {
      icon: HiOutlinePuzzlePiece,
      name: "Beast Companion",
      description:
        "A browser companion that brings Locator Beast right into your apartment research — surfacing your client's criteria and workflow while you browse listings.",
    },
    {
      icon: HiOutlineComputerDesktop,
      name: "Beast Sync",
      description:
        "A desktop companion that connects your phone's messaging activity to Locator Beast, so client conversations stay with the right lead.",
    },
  ];

  return (
    <StepCard
      eyebrow="Step 4"
      title="Meet your Locator Beast tools"
      subtitle="Two companion apps that extend Locator Beast. There's nothing to set up right now — you can manage them anytime from Settings → Integrations."
    >
      <div className="flex flex-col gap-3">
        {tools.map((t) => (
          <div
            key={t.name}
            className="flex items-start gap-4 rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
              <t.icon className="h-5 w-5 text-[var(--beast-blue)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[var(--beast-ink)]">{t.name}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-[var(--beast-ink-soft)]">{t.description}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--beast-ink-soft)]">
        Both are part of the Locator Beast ecosystem. When you're ready, set them up from{" "}
        <span className="font-semibold text-[var(--beast-ink)]">Settings → Integrations</span>.
      </p>

      <StepNav onBack={onBack} onNext={() => onNext()} nextLabel="Continue" saving={saving} />
    </StepCard>
  );
}
