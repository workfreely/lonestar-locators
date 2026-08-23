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
        "Keep your client's criteria, properties, and workflow beside you while you research apartments.",
      // No approved Chrome Web Store listing exists yet, so the card shows a
      // pending state rather than a dead install action. Flip to an action once
      // a real listing URL exists — do NOT invent one.
      action: null as string | null,
    },
    {
      icon: HiOutlineComputerDesktop,
      name: "Beast Sync",
      description:
        "Keep your phone conversations connected to the right clients in Locator Beast.",
      // The existing source of truth (components/crm/integrations/
      // BeastCompanionSection.tsx → DOWNLOAD_URLS.macos) is still an empty
      // string, meaning no signed installer is published. Pending until then.
      action: null as string | null,
    },
  ];

  return (
    <StepCard
      eyebrow="Step 4"
      title="Meet your Locator Beast tools"
      subtitle="Take Locator Beast with you while you work."
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
            {/* No real install/download URL exists for either tool yet, so both
                show a pending state. An action appears here only when a genuine
                published URL exists. */}
            <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-[var(--beast-ink-soft)]">
              Coming Soon
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-[var(--beast-ink-soft)]">
        You can manage both anytime in Settings → Integrations.
      </p>

      <StepNav onBack={onBack} onNext={() => onNext()} nextLabel="Continue" saving={saving} />
    </StepCard>
  );
}
