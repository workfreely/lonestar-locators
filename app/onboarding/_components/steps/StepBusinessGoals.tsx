"use client";

import { useState } from "react";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import {
  DEFAULT_AVG_COMMISSION_PER_LEASE,
  DEFAULT_MONTHLY_COMMISSION_GOAL,
  type StepProps,
} from "../../_lib/types";

const inputClass =
  "w-full rounded-xl border border-[var(--beast-border)] bg-white py-3 pl-8 pr-4 text-[15px] font-semibold text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]";
const labelClass = "text-[13px] font-medium text-[var(--beast-ink-soft)]";

// Keep only digits, then format with thousands separators for display.
function formatCurrency(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

function toNumber(display: string): number | null {
  const digits = display.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function CurrencyField({
  label,
  value,
  onChange,
  helper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helper: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-[var(--beast-ink-soft)]">
          $
        </span>
        <input inputMode="numeric" value={value} onChange={(e) => onChange(formatCurrency(e.target.value))} className={inputClass} />
      </div>
      <p className="text-[12px] text-[var(--beast-ink-soft)]">{helper}</p>
    </div>
  );
}

export default function StepBusinessGoals({ data, onNext, onBack, saving }: StepProps) {
  // Prefill the defaults as real, editable values (not faint placeholders) so
  // only the active value is ever visible.
  const [monthlyGoal, setMonthlyGoal] = useState(
    (data.monthly_commission_goal ?? DEFAULT_MONTHLY_COMMISSION_GOAL).toLocaleString("en-US")
  );
  const [avgCommission, setAvgCommission] = useState(
    (data.avg_commission_per_lease ?? DEFAULT_AVG_COMMISSION_PER_LEASE).toLocaleString("en-US")
  );

  function handleNext() {
    // Cleared fields fall back to the sensible defaults — editable in Settings.
    onNext({
      monthly_commission_goal: toNumber(monthlyGoal) ?? DEFAULT_MONTHLY_COMMISSION_GOAL,
      avg_commission_per_lease: toNumber(avgCommission) ?? DEFAULT_AVG_COMMISSION_PER_LEASE,
    });
  }

  return (
    <StepCard
      eyebrow="Step 2"
      title="Business Goals"
      subtitle="Two quick numbers so your dashboard tracks what matters to you."
    >
      <div className="flex flex-col gap-5">
        <CurrencyField
          label="Monthly Commission Goal"
          value={monthlyGoal}
          onChange={setMonthlyGoal}
          helper="This personalizes your dashboard and monthly progress."
        />
        <CurrencyField
          label="Average Commission per Lease"
          value={avgCommission}
          onChange={setAvgCommission}
          helper="This helps estimate your projected pipeline and revenue."
        />

        <p className="text-[12.5px] text-[var(--beast-ink-soft)]">You can change these anytime in Settings.</p>
      </div>

      <StepNav onBack={onBack} onNext={handleNext} saving={saving} />
    </StepCard>
  );
}
